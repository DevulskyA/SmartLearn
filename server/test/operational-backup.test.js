import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import * as learningUnits from '../src/services/learning-units.js';
import * as exercises from '../src/services/exercises.js';
import { acceptUpload } from '../src/services/source-storage.js';
import * as ops from '../src/operational-backup.js';

const PDF = (marker) => Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Marker (${marker}) >>\nendobj\ntrailer\n<< >>\n%%EOF\n`, 'latin1');
const sha = (buf) => createHash('sha256').update(buf).digest('hex');

// A realistic "production-like" environment: user, unit, exercise WITH a citation to
// an accepted source (real file on disk + extracted pages), and a live session.
function makeEnv() {
  const root = mkdtempSync(join(tmpdir(), 'sl-opbackup-'));
  const sourcesDir = join(root, 'live', 'sources');
  const db = openDb(join(root, 'live', 'smartlearn.db'));
  runMigrations(db);
  const now = new Date().toISOString();
  const userId = Number(db.prepare(`
    INSERT INTO users (email, email_display, password_hash, password_salt, password_algorithm, password_params, created_at, updated_at)
    VALUES ('op@example.com', 'op@example.com', 'hash', 'salt', 'scrypt', '{}', ?, ?)
  `).run(now, now).lastInsertRowid);
  const unit = learningUnits.create(db, userId, { newSubjectName: 'Farmacologia', title: 'Betabloqueadores', studyDate: '2026-09-01' }).unit;
  const exercise = exercises.create(db, userId, { unitId: unit.id, question: 'Qual o efeito?', answer: 'Reduz FC', provenance: 'MANUAL' });
  const pdf = PDF('fonte-1');
  const source = acceptUpload(db, userId, { buffer: pdf, originalName: 'aula.pdf', contentType: 'application/pdf', sourcesDir, maxBytes: 1e6, quotaBytes: 1e7 });
  db.prepare('INSERT INTO source_pages (user_id, source_id, page_index, text, created_at) VALUES (?, ?, 1, ?, ?)').run(userId, source.id, 'Betabloqueadores reduzem FC.', now);
  db.prepare('INSERT INTO exercise_source_citations (user_id, exercise_version_id, source_id, page_index, created_at) VALUES (?, ?, ?, 1, ?)')
    .run(userId, exercise.currentVersion.id, source.id, now);
  db.prepare('INSERT INTO sessions (token_hash, user_id, issued_at, expires_at, last_seen, csrf_token) VALUES (?, ?, ?, ?, ?, ?)')
    .run('tokenhash-live', userId, now, '2099-01-01T00:00:00.000Z', now, 'csrf-secret');
  const fileOf = () => join(sourcesDir, db.prepare('SELECT filename FROM sources WHERE id = ?').get(source.id).filename);
  return { root, db, sourcesDir, userId, unit, exercise, source, pdf, fileOf, cleanup: () => { db.close(); rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}

const tree = (dir) => readdirSync(dir, { recursive: true }).sort().join('|');
const hashTree = (dir) => readdirSync(dir, { recursive: true }).sort().filter((f) => !readdirSafe(join(dir, f))).map((f) => `${f}:${sha(readFileSync(join(dir, f)))}`).join('|');
function readdirSafe(p) { try { readdirSync(p); return true; } catch { return false; } }

test('full rehearsal: package -> verify -> restore in a temp env -> units, questions and citations resolve; the original environment is untouched', async () => {
  const env = makeEnv();
  try {
    const before = hashTree(env.sourcesDir);
    const dest = join(env.root, 'backups', 'b1');
    const manifest = await ops.createOperationalBackup(env.db, { sourcesDir: env.sourcesDir, destDir: dest, now: () => new Date('2026-09-19T12:00:00.000Z') });

    assert.equal(manifest.manifestVersion, 1);
    assert.equal(manifest.createdAt, '2026-09-19T12:00:00.000Z');
    assert.equal(manifest.database.integrityCheck, 'ok');
    assert.equal(manifest.sources.length, 1);
    assert.equal(manifest.sources[0].sha256, sha(env.pdf));
    assert.equal(manifest.database.tableCounts.exercise_source_citations, 1);
    assert.deepEqual(readdirSync(dest).sort(), ['database.db', 'manifest.json', 'sources']);

    assert.deepEqual(ops.verifyOperationalBackup(dest), []);

    const report = await ops.rehearseRestore(dest);
    assert.equal(report.ok, true, JSON.stringify(report.problems));
    assert.equal(report.counts.learning_units, 1);
    assert.equal(report.counts.exercises, 1);
    assert.equal(report.citationsChecked, 1);
    assert.equal(report.sourcesChecked, 1);
    assert.equal(report.tempEnvironmentRemoved, true);
    assert.ok(report.tempDir.startsWith(tmpdir()), 'the rehearsal only ever writes under the OS temp dir');
    assert.equal(existsSync(report.tempDir), false);

    // original environment untouched: sources byte-identical, DB rows unchanged, live session still there
    assert.equal(hashTree(env.sourcesDir), before);
    assert.equal(env.db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 1);
    assert.equal(env.db.prepare('SELECT COUNT(*) AS n FROM sources').get().n, 1);
  } finally { env.cleanup(); }
});

test('credentials/session handling is explicit: sessions (and their CSRF secrets) are NOT in the package; password hashes are, and the manifest says so', async () => {
  const env = makeEnv();
  try {
    // A session that was logged out (row deleted) BEFORE the backup: its bytes can still sit in
    // the live file's free space, so removing rows from the copy is not enough — VACUUM is.
    const now = new Date().toISOString();
    env.db.prepare('INSERT INTO sessions (token_hash, user_id, issued_at, expires_at, last_seen, csrf_token) VALUES (?, ?, ?, ?, ?, ?)')
      .run('tokenhash-old-loggedout-0123456789abcdef0123456789abcdef', env.userId, now, '2099-01-01T00:00:00.000Z', now, 'csrf-old-loggedout-secret');
    env.db.prepare('DELETE FROM sessions WHERE token_hash LIKE ?').run('tokenhash-old-%');
    env.db.pragma('wal_checkpoint(TRUNCATE)');
    const dest = join(env.root, 'backups', 'b1');
    const manifest = await ops.createOperationalBackup(env.db, { sourcesDir: env.sourcesDir, destDir: dest });
    assert.equal(manifest.credentials.sessionsIncluded, false);
    assert.equal(manifest.credentials.containsPasswordHashes, true);
    assert.equal(manifest.database.tableCounts.sessions, 0);
    const raw = readFileSync(join(dest, 'database.db'));
    assert.equal(raw.includes(Buffer.from('tokenhash-live')), false, 'no session token hash in the package');
    assert.equal(raw.includes(Buffer.from('csrf-secret')), false, 'no CSRF secret in the package');
    assert.equal(raw.includes(Buffer.from('tokenhash-old-loggedout')), false, 'no residue of an earlier deleted session in free pages');
    assert.equal(raw.includes(Buffer.from('csrf-old-loggedout-secret')), false);
    assert.equal(env.db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 1, 'the LIVE database keeps its session');
  } finally { env.cleanup(); }
});

test('backup fails closed on a missing source file and leaves no partial package behind', async () => {
  const env = makeEnv();
  try {
    unlinkSync(env.fileOf());
    const dest = join(env.root, 'backups', 'b1');
    await assert.rejects(() => ops.createOperationalBackup(env.db, { sourcesDir: env.sourcesDir, destDir: dest }), (e) => e.code === 'SOURCE_MISSING');
    assert.equal(existsSync(dest), false);
    assert.deepEqual(existsSync(join(env.root, 'backups')) ? readdirSync(join(env.root, 'backups')) : [], [], 'no .partial residue');
  } finally { env.cleanup(); }
});

test('backup fails closed on a corrupt source file (same size, different bytes)', async () => {
  const env = makeEnv();
  try {
    const bytes = Buffer.from(readFileSync(env.fileOf()));
    bytes[bytes.length - 3] ^= 0xff;
    writeFileSync(env.fileOf(), bytes);
    await assert.rejects(() => ops.createOperationalBackup(env.db, { sourcesDir: env.sourcesDir, destDir: join(env.root, 'b') }), (e) => e.code === 'SOURCE_CORRUPT');
  } finally { env.cleanup(); }
});

test('a package damaged AFTER creation is detected (missing source, corrupt source, corrupt database, tampered manifest) and restore refuses to build an environment from it', async () => {
  const env = makeEnv();
  try {
    const dest = join(env.root, 'backups', 'b1');
    await ops.createOperationalBackup(env.db, { sourcesDir: env.sourcesDir, destDir: dest });
    const sourceCopy = join(dest, 'sources', readdirSync(join(dest, 'sources'))[0]);
    const damage = [
      ['SOURCE_MISSING', () => unlinkSync(sourceCopy), () => writeFileSync(sourceCopy, env.pdf)],
      ['SOURCE_CORRUPT', () => { const b = Buffer.from(env.pdf); b[10] ^= 0xff; writeFileSync(sourceCopy, b); }, () => writeFileSync(sourceCopy, env.pdf)],
      ['DATABASE_CORRUPT', () => { const p = join(dest, 'database.db'); const b = Buffer.from(readFileSync(p)); b[b.length - 5] ^= 0xff; writeFileSync(join(dest, 'database.db.orig'), readFileSync(p)); writeFileSync(p, b); }, () => { writeFileSync(join(dest, 'database.db'), readFileSync(join(dest, 'database.db.orig'))); unlinkSync(join(dest, 'database.db.orig')); }],
      ['MANIFEST_INVALID', () => { writeFileSync(join(dest, 'manifest.json.orig'), readFileSync(join(dest, 'manifest.json'))); writeFileSync(join(dest, 'manifest.json'), '{not json'); }, () => { writeFileSync(join(dest, 'manifest.json'), readFileSync(join(dest, 'manifest.json.orig'))); unlinkSync(join(dest, 'manifest.json.orig')); }],
    ];
    assert.deepEqual(ops.verifyOperationalBackup(dest), [], 'baseline is clean');
    for (const [code, breakIt, fixIt] of damage) {
      breakIt();
      const problems = ops.verifyOperationalBackup(dest);
      assert.ok(problems.some((p) => p.code === code), `${code} not detected: ${JSON.stringify(problems)}`);
      const target = join(env.root, `restore-${code}`);
      await assert.rejects(() => ops.restoreOperationalBackup(dest, target), (e) => e.code === 'RESTORE_REFUSED');
      assert.equal(existsSync(target) ? readdirSync(target).length : 0, 0, `${code}: nothing restored`);
      fixIt();
      assert.deepEqual(ops.verifyOperationalBackup(dest), [], `${code}: fixture repaired`);
    }
  } finally { env.cleanup(); }
});

test('restore never overwrites: a non-empty target is refused and left byte-identical; an existing backup destination is never replaced', async () => {
  const env = makeEnv();
  try {
    const dest = join(env.root, 'backups', 'b1');
    await ops.createOperationalBackup(env.db, { sourcesDir: env.sourcesDir, destDir: dest });
    const snapshot = hashTree(dest);

    const occupied = join(env.root, 'occupied');
    await ops.restoreOperationalBackup(dest, occupied); // first restore into an empty target works
    writeFileSync(join(occupied, 'keep.txt'), 'precious');
    const occupiedBefore = hashTree(occupied);
    await assert.rejects(() => ops.restoreOperationalBackup(dest, occupied), (e) => e.code === 'RESTORE_TARGET_NOT_EMPTY');
    assert.equal(hashTree(occupied), occupiedBefore);

    await assert.rejects(() => ops.createOperationalBackup(env.db, { sourcesDir: env.sourcesDir, destDir: dest }), (e) => e.code === 'BACKUP_DEST_EXISTS');
    assert.equal(hashTree(dest), snapshot, 'the existing backup is untouched');
  } finally { env.cleanup(); }
});

test('rehearsal flags a citation whose source page is missing (a backup can be well-formed and still not resolve its assets)', async () => {
  const env = makeEnv();
  try {
    env.db.prepare('DELETE FROM source_pages').run();
    const dest = join(env.root, 'backups', 'b1');
    await ops.createOperationalBackup(env.db, { sourcesDir: env.sourcesDir, destDir: dest });
    assert.deepEqual(ops.verifyOperationalBackup(dest), [], 'the package itself is intact');
    const report = await ops.rehearseRestore(dest);
    assert.equal(report.ok, false);
    assert.ok(report.problems.some((p) => p.code === 'CITATION_PAGE_MISSING'), JSON.stringify(report.problems));
  } finally { env.cleanup(); }
});

test('retention is an explicit recorded setting and nothing here ever deletes a real backup: a second backup leaves the first in place', async () => {
  const env = makeEnv();
  try {
    const first = join(env.root, 'backups', 'b1');
    const second = join(env.root, 'backups', 'b2');
    const m1 = await ops.createOperationalBackup(env.db, { sourcesDir: env.sourcesDir, destDir: first, retainDays: 30 });
    await ops.createOperationalBackup(env.db, { sourcesDir: env.sourcesDir, destDir: second });
    assert.deepEqual(m1.retention, { policy: 'OPERATOR_MANAGED', retainDays: 30, automaticDeletion: false });
    assert.equal(existsSync(first) && existsSync(second), true);
    assert.equal(Object.keys(ops).some((name) => /delete|prune|remove|purge|cleanup/i.test(name)), false, 'no deletion API is exported');
    await assert.rejects(() => ops.createOperationalBackup(env.db, { sourcesDir: env.sourcesDir, destDir: join(env.root, 'x'), retainDays: -1 }), (e) => e.code === 'VALIDATION_FAILED');
  } finally { env.cleanup(); }
});

test('a fresh install with no sources still backs up and restores (empty sources are a valid state, not an error)', async () => {
  const root = mkdtempSync(join(tmpdir(), 'sl-opbackup-empty-'));
  const db = openDb(join(root, 'live', 'smartlearn.db'));
  try {
    runMigrations(db);
    const dest = join(root, 'b');
    const manifest = await ops.createOperationalBackup(db, { sourcesDir: join(root, 'live', 'no-such-dir'), destDir: dest });
    assert.deepEqual(manifest.sources, []);
    const report = await ops.rehearseRestore(dest);
    assert.equal(report.ok, true, JSON.stringify(report.problems));
    assert.equal(tree(dest).includes('manifest.json'), true);
  } finally { db.close(); rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});

// ---------- operator CLI, real processes ----------

const SCRIPT = fileURLToPath(new URL('../scripts/backup.mjs', import.meta.url));
const cli = (args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });

test('CLI: --package / --verify / --rehearse work end to end, a damaged package exits non-zero with its code, and the T19 physical mode still works', () => {
  const env = makeEnv();
  try {
    env.db.pragma('wal_checkpoint(TRUNCATE)');
    const dbFile = join(env.root, 'live', 'smartlearn.db');
    const dest = join(env.root, 'backups', 'cli1');

    const packed = cli(['--package', dest, '--db', dbFile, '--sources', env.sourcesDir, '--retain-days', '14']);
    assert.equal(packed.status, 0, packed.stderr);
    assert.match(packed.stdout, /Operational backup written/);
    assert.match(packed.stdout, /sessions: NOT included/);
    assert.match(packed.stdout, /14 day\(s\), recorded only/);

    assert.equal(cli(['--verify', dest]).status, 0);
    const rehearsed = cli(['--rehearse', dest]);
    assert.equal(rehearsed.status, 0, rehearsed.stderr);
    assert.match(rehearsed.stdout, /removed afterwards/);
    assert.match(rehearsed.stdout, /citations checked: 1/);

    assert.notEqual(cli(['--package', dest, '--db', dbFile, '--sources', env.sourcesDir]).status, 0, 'never overwrites');

    const copy = join(dest, 'sources', readdirSync(join(dest, 'sources'))[0]);
    const bytes = Buffer.from(readFileSync(copy));
    bytes[12] ^= 0xff;
    writeFileSync(copy, bytes);
    const bad = cli(['--verify', dest]);
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /SOURCE_CORRUPT/);
    assert.equal(cli(['--rehearse', dest]).status, 1);

    const legacy = join(env.root, 'legacy.db');
    const t19 = cli([legacy, '--db', dbFile]);
    assert.equal(t19.status, 0, t19.stderr);
    assert.match(t19.stdout, /Physical backup written/);
    assert.equal(cli([]).status, 1, 'no args prints usage');
  } finally { env.cleanup(); }
});
