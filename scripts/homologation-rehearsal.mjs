#!/usr/bin/env node
// Homologation rehearsal on a DISPOSABLE database: backup -> authorization gate -> migrate 034 -> 041 -> verify -> rollback -> re-migrate.
// It uses the product's own functions (takeVerifiedSnapshot, checkMigrationAuthorization, runMigrations, restoreDrill) and never opens the
// human DEV datastore: every path lives under a fresh OS temp directory that is removed at the end. Exit 0 = every check PASS.
// The owner repeats the SAME procedure on the real datastore by hand (see .specs/proposals/homologation-sequence.md); this script is the proof
// that the procedure and the tooling work before the owner touches real data.
import { mkdtempSync, rmSync, mkdirSync, readdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../server/src/db.js';
import { runMigrations, pendingMigrations, validateMigrations } from '../server/src/migrations.js';
import { checkMigrationAuthorization, AUTHORIZE_ENV } from '../server/src/migration-authorization.js';
import { takeVerifiedSnapshot, tableCounts, sha256File } from '../server/src/dev-snapshot.js';
import { restoreDrill } from '../server/src/dev-restore.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../server/migrations', import.meta.url));
const FROM = 34;
const TO = Math.max(...readdirSync(MIGRATIONS_DIR).filter((f) => /^\d+-.*\.sql$/.test(f)).map((f) => Number(f.slice(0, 3))));
const checks = [];
const check = (name, pass, detail = '') => { checks.push({ name, status: pass ? 'PASS' : 'FAIL', detail }); if (!pass) console.error(`FAIL ${name} ${detail}`); return pass; };

const work = mkdtempSync(join(tmpdir(), 'sl-homologation-'));
if (work.toLowerCase().includes('smartlearn-devdata')) throw new Error('refusing to run inside the human DEV datastore');
const upToFrom = join(work, `m${FROM}`);
mkdirSync(upToFrom);
for (const file of readdirSync(MIGRATIONS_DIR)) if (!/^\d+-/.test(file) || Number(file.slice(0, 3)) <= FROM || file === 'manifest.json') copyFileSync(join(MIGRATIONS_DIR, file), join(upToFrom, file));

const dbPath = join(work, 'rehearsal.db');
const snapshotsDir = join(work, 'snapshots');
const rows = (db, sql) => db.prepare(sql).all();
const idsOf = (db, table) => rows(db, `SELECT id FROM "${table}" ORDER BY id`).map((r) => r.id).join(',');

try {
  // 1. a database at the schema the owner has today, with realistic disposable rows
  let db = openDb(dbPath);
  runMigrations(db, upToFrom);
  const now = new Date().toISOString();
  const user = db.prepare(`INSERT INTO users (email, email_display, password_hash, password_salt, password_algorithm, password_params, created_at, updated_at)
    VALUES ('aluna@example.com', 'aluna@example.com', 'h', 's', 'scrypt', '{}', ?, ?)`).run(now, now).lastInsertRowid;
  for (const [n, name] of [[1, 'Farmacologia - aula 1.pdf'], [2, 'Fisiologia - aula 2.pdf']]) {
    db.prepare(`INSERT INTO sources (user_id, filename, original_name, content_type, byte_size, checksum, status, created_at, page_count)
      VALUES (?, ?, ?, 'application/pdf', 2048, ?, 'UPLOADED', ?, 12)`).run(user, `f${n}.pdf`, name, `chk${n}`, now);
  }
  const before = { counts: tableCounts(db), sourceIds: idsOf(db, 'sources'), userIds: idsOf(db, 'users') };
  check(`rehearsal database is at schema v${FROM}`, db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get().v === FROM);
  const pending = pendingMigrations(db).pending ?? [];
  const pendingVersions = pending.map((p) => p.version ?? p);
  db.close();

  // 2. verified backup BEFORE anything runs, and the authorization gate
  const snap = takeVerifiedSnapshot(dbPath, snapshotsDir, 'pre-homologation', { kind: 'pre-migration', expectSameCounts: true });
  check('backup is verified (integrity, foreign keys, same row counts, sha256)', snap.manifest.integrity === 'ok' && snap.manifest.foreignKeyViolations === 0, `sha256 ${snap.manifest.sha256.slice(0, 12)}`);
  const versions = Array.from({ length: TO - FROM }, (_, i) => FROM + 1 + i);
  check(`gate refuses ${versions[0]}..${TO} without authorization`, checkMigrationAuthorization({ fromVersion: FROM, pending: versions }, {}).ok === false);
  check('gate refuses when only part is authorized', checkMigrationAuthorization({ fromVersion: FROM, pending: versions }, { [AUTHORIZE_ENV]: String(versions[0]) }).ok === false);
  check('gate accepts the full explicit list', checkMigrationAuthorization({ fromVersion: FROM, pending: versions }, { [AUTHORIZE_ENV]: versions.join(',') }).ok === true);
  check(`pending migrations on the disposable DB are exactly ${versions[0]}..${TO}`, pendingVersions.length === 0 || pendingVersions.join() === versions.join(), `pending ${pendingVersions.join(',') || '(read with the 034-only directory)'}`);

  // 3. migrate to the newest version and verify nothing was lost
  db = openDb(dbPath);
  runMigrations(db, MIGRATIONS_DIR);
  check(`schema is now v${TO}`, db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get().v === TO);
  check('checksums of every applied migration match the files', (() => { try { validateMigrations(db); return true; } catch (e) { return false; } })());
  check('integrity_check ok', db.pragma('integrity_check', { simple: true }) === 'ok');
  check('foreign_key_check clean', db.pragma('foreign_key_check').length === 0);
  const after = tableCounts(db);
  const lost = Object.keys(before.counts).filter((t) => t !== 'schema_migrations' && after[t] !== before.counts[t]);
  check('every pre-existing table keeps its row count', lost.length === 0, lost.join(', '));
  check('user and source ids unchanged', idsOf(db, 'sources') === before.sourceIds && idsOf(db, 'users') === before.userIds);
  db.close();

  // 4. rollback: restore the backup elsewhere (byte-identical), and prove the restored copy is the pre-migration database
  const restored = join(work, 'restored');
  const drill = restoreDrill(snap.dir, restored, { env: { SMARTLEARN_DEV_DATA_DIR: join(work, 'live-placeholder') } });
  check('restore drill passes every check', drill.ok, drill.checks.filter((c) => c.status !== 'PASS').map((c) => c.name).join('; '));
  check('restored file is byte-identical to the backup', sha256File(drill.restoredDb) === snap.manifest.sha256);
  const rdb = openDb(drill.restoredDb);
  check(`restored database is back at v${FROM}`, rdb.prepare('SELECT MAX(version) AS v FROM schema_migrations').get().v === FROM);
  check('restored rows equal the originals', JSON.stringify(tableCounts(rdb)) === JSON.stringify(before.counts));
  // 5. the rollback is repeatable: the same migrations apply cleanly again to the restored copy
  runMigrations(rdb, MIGRATIONS_DIR);
  check(`restored copy migrates again to v${TO}`, rdb.prepare('SELECT MAX(version) AS v FROM schema_migrations').get().v === TO);
  rdb.close();
} finally {
  rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

const failed = checks.filter((c) => c.status === 'FAIL');
console.log(JSON.stringify({ rehearsal: 'backup-migrate-rollback', from: FROM, to: TO, disposable: true, checks, result: failed.length ? 'FAIL' : 'PASS' }, null, 1));
process.exit(failed.length ? 1 : 0);
