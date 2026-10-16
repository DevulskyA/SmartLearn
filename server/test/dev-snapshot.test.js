import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { takeVerifiedSnapshot, isValidSnapshot, applyRetention, dailySnapshotIfNeeded, preMigrationSnapshot, sha256File } from '../src/dev-snapshot.js';

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-snap-'));
  const dbPath = join(dir, 'smartlearn-dev.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT, checksum TEXT, applied_at TEXT);
    CREATE TABLE subjects (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE units (id INTEGER PRIMARY KEY, subject_id INTEGER NOT NULL REFERENCES subjects(id), title TEXT);
    INSERT INTO schema_migrations VALUES (29, 'x', 'c', 't'), (30, 'y', 'c', 't');
    INSERT INTO subjects (name) VALUES ('Fisiologia'), ('Anatomia');
    INSERT INTO units (subject_id, title) VALUES (1, 'Filtração'), (1, 'Reabsorção'), (2, 'Ossos');
  `);
  return { dir, dbPath, db, snaps: join(dir, 'snapshots'), cleanup: () => { try { db.close(); } catch { /* already closed */ } rmSync(dir, { recursive: true, force: true }); } };
}

test('a verified snapshot opens, matches the source counts, records schema version and sha256, and leaves the source untouched', () => {
  const f = fixture();
  try {
    const before = statSync(f.dbPath).mtimeMs;
    const { file, manifest } = takeVerifiedSnapshot(f.dbPath, f.snaps, 'pre-migrate-v30', { kind: 'pre-migrate', expectSameCounts: true });
    assert.deepEqual(manifest.counts, { schema_migrations: 2, subjects: 2, units: 3 });
    assert.equal(manifest.schemaVersion, 30);
    assert.equal(manifest.integrity, 'ok');
    assert.equal(manifest.sha256, sha256File(file));
    assert.equal(isValidSnapshot(join(f.snaps, 'pre-migrate-v30')), true);
    const copy = new Database(file, { readonly: true });
    assert.equal(copy.prepare('SELECT COUNT(*) AS n FROM units').get().n, 3);
    copy.close();
    assert.equal(statSync(f.dbPath).mtimeMs, before, 'the source database file was not modified');
  } finally { f.cleanup(); }
});

test('data that lives only in the WAL of a live writer is in the snapshot (a raw copy of the .db file alone would miss it)', () => {
  const f = fixture();
  try {
    f.db.pragma('wal_autocheckpoint = 0');
    f.db.prepare('INSERT INTO subjects (name) VALUES (?)').run('Neurologia');
    const { manifest } = takeVerifiedSnapshot(f.dbPath, f.snaps, '2026-10-04');
    assert.equal(manifest.counts.subjects, 3);
  } finally { f.cleanup(); }
});

test('tampering with a snapshot file makes it invalid', () => {
  const f = fixture();
  try {
    const { file, dir } = takeVerifiedSnapshot(f.dbPath, f.snaps, '2026-10-04');
    assert.equal(isValidSnapshot(dir), true);
    writeFileSync(file, Buffer.concat([readFileSync(file), Buffer.from('x')]));
    assert.equal(isValidSnapshot(dir), false);
    assert.equal(isValidSnapshot(join(f.snaps, 'does-not-exist')), false);
  } finally { f.cleanup(); }
});

test('a failed snapshot leaves nothing behind and a missing/empty/garbage source is refused', () => {
  const f = fixture();
  try {
    assert.throws(() => takeVerifiedSnapshot(join(f.dir, 'missing.db'), f.snaps, 'a'), /no database to snapshot/);
    writeFileSync(join(f.dir, 'empty.db'), '');
    assert.throws(() => takeVerifiedSnapshot(join(f.dir, 'empty.db'), f.snaps, 'b'), /no database to snapshot/);
    writeFileSync(join(f.dir, 'garbage.db'), 'this is not a sqlite database at all, just text');
    assert.throws(() => takeVerifiedSnapshot(join(f.dir, 'garbage.db'), f.snaps, 'c'));
    assert.equal(existsSync(join(f.snaps, 'c')), false, 'the partial snapshot is removed');
    takeVerifiedSnapshot(f.dbPath, f.snaps, 'd');
    assert.throws(() => takeVerifiedSnapshot(f.dbPath, f.snaps, 'd'), /already exists/);
  } finally { f.cleanup(); }
});

test('retention keeps the newest 7 daily snapshots, never removes pre-migrate snapshots, and never leaves no valid snapshot', () => {
  const f = fixture();
  try {
    const days = Array.from({ length: 9 }, (_, i) => `2026-09-${String(10 + i).padStart(2, '0')}`);
    for (const d of days) takeVerifiedSnapshot(f.dbPath, f.snaps, d);
    preMigrationSnapshot(f.dbPath, f.snaps, 29);
    const removed = applyRetention(f.snaps, { keepDays: 7 });
    assert.deepEqual(removed, days.slice(0, 2));
    assert.ok(existsSync(join(f.snaps, 'pre-migrate-v29')));
    assert.ok(existsSync(join(f.snaps, days[8])));

    // only the OLDEST day is valid; the rest are corrupted: removing it would leave nothing valid, so it stays
    const g = fixture();
    try {
      for (const d of days) { takeVerifiedSnapshot(g.dbPath, g.snaps, d); }
      for (const d of days.slice(1)) writeFileSync(join(g.snaps, d, 'manifest.json'), '{broken');
      assert.deepEqual(applyRetention(g.snaps, { keepDays: 7 }), [days[1]], 'the invalid oldest-but-valid-one logic keeps the only valid snapshot');
      assert.ok(existsSync(join(g.snaps, days[0])), 'the only valid snapshot is kept');
    } finally { g.cleanup(); }
  } finally { f.cleanup(); }
});

test('the daily snapshot is taken once per calendar day and only when there is data', () => {
  const f = fixture();
  try {
    const day = new Date('2026-10-04T10:00:00Z');
    assert.ok(dailySnapshotIfNeeded(f.dbPath, f.snaps, { now: day }));
    assert.equal(dailySnapshotIfNeeded(f.dbPath, f.snaps, { now: new Date('2026-10-04T22:00:00Z') }), null);
    assert.ok(dailySnapshotIfNeeded(f.dbPath, f.snaps, { now: new Date('2026-10-05T01:00:00Z') }));
    mkdirSync(join(f.dir, 'e'));
    writeFileSync(join(f.dir, 'e', 'empty.db'), '');
    assert.equal(dailySnapshotIfNeeded(join(f.dir, 'e', 'empty.db'), join(f.dir, 'e', 's'), { now: day }), null);
  } finally { f.cleanup(); }
});

test('the pre-migration snapshot is named after the schema version it protects, verified, and a repeat gets a distinct name', () => {
  const f = fixture();
  try {
    const first = preMigrationSnapshot(f.dbPath, f.snaps, 30, { now: new Date('2026-10-04T10:00:00Z') });
    assert.match(first.dir, /pre-migrate-v30$/);
    assert.equal(first.manifest.kind, 'pre-migrate');
    const again = preMigrationSnapshot(f.dbPath, f.snaps, 30, { now: new Date('2026-10-04T11:00:00Z') });
    assert.match(again.dir, /pre-migrate-v30-2026-10-04T11-00-00-000Z$/);
  } finally { f.cleanup(); }
});

// ---- T-F1-02: a verified backup exists BEFORE a pending migration runs, and a failed backup stops the migration ----
import { snapshotBeforeMigration } from '../src/dev-snapshot.js';
import { runMigrations, pendingMigrations } from '../src/migrations.js';

function migrationsDir(dir, versions) {
  const d = join(dir, `migrations-${versions.join('')}`);
  mkdirSync(d, { recursive: true });
  for (const v of versions) writeFileSync(join(d, `00${v}-step${v}.sql`), `CREATE TABLE step${v} (id INTEGER PRIMARY KEY);`);
  return d;
}

test('pendingMigrations reports the version already applied and what is missing, creating nothing', () => {
  const f = fixture();
  try {
    const dir = migrationsDir(f.dir, [1, 2, 3]);
    const fresh = new Database(join(f.dir, 'fresh.db'));
    assert.deepEqual(pendingMigrations(fresh, dir), { fromVersion: 0, pending: [1, 2, 3] });
    assert.equal(fresh.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'schema_migrations'").get().n, 0, 'read-only: no schema table was created');
    runMigrations(fresh, migrationsDir(f.dir, [1]));
    assert.deepEqual(pendingMigrations(fresh, dir), { fromVersion: 1, pending: [2, 3] });
    fresh.close();
  } finally { f.cleanup(); }
});

test('before a pending migration on a database with data, a verified pre-migrate snapshot exists first; nothing pending or a new database takes none', () => {
  const f = fixture();
  try {
    const db = new Database(join(f.dir, 'live.db'));
    db.pragma('journal_mode = WAL');
    runMigrations(db, migrationsDir(f.dir, [1]));
    db.exec('INSERT INTO step1 (id) VALUES (7)');
    const dir = migrationsDir(f.dir, [1, 2]);
    const snap = snapshotBeforeMigration(db, join(f.dir, 'live.db'), f.snaps, { migrationsDir: dir });
    assert.match(snap.dir, /pre-migrate-v1$/);
    assert.equal(snap.manifest.schemaVersion, 1);
    assert.equal(snap.manifest.counts.step1, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'step2'").get().n, 0, 'the snapshot was taken BEFORE the migration ran');
    runMigrations(db, dir);
    assert.equal(snapshotBeforeMigration(db, join(f.dir, 'live.db'), f.snaps, { migrationsDir: dir }), null, 'nothing pending');
    const brandNew = new Database(join(f.dir, 'new.db'));
    assert.equal(snapshotBeforeMigration(brandNew, join(f.dir, 'new.db'), join(f.dir, 'snaps2'), { migrationsDir: dir }), null, 'a new empty database has nothing to protect');
    brandNew.close(); db.close();
  } finally { f.cleanup(); }
});

test('if the pre-migration snapshot cannot be taken, it throws so the caller never migrates without a backup', () => {
  const f = fixture();
  try {
    const db = new Database(join(f.dir, 'live.db'));
    runMigrations(db, migrationsDir(f.dir, [1]));
    writeFileSync(join(f.dir, 'not-a-dir'), 'x'); // snapshots "directory" is a file: mkdir fails
    assert.throws(() => snapshotBeforeMigration(db, join(f.dir, 'live.db'), join(f.dir, 'not-a-dir'), { migrationsDir: migrationsDir(f.dir, [1, 2]) }));
    db.close();
  } finally { f.cleanup(); }
});
