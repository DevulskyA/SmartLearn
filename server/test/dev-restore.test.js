import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { takeVerifiedSnapshot, sha256File } from '../src/dev-snapshot.js';
import { restoreDrill } from '../src/dev-restore.js';

function world() {
  const root = mkdtempSync(join(tmpdir(), 'sl-drill-'));
  const live = join(root, 'SmartLearn-DevData');
  mkdirSync(live, { recursive: true });
  const dbPath = join(live, 'smartlearn-dev.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT, checksum TEXT, applied_at TEXT);
    CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT);
    CREATE TABLE learning_units (id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id), title TEXT);
    INSERT INTO schema_migrations VALUES (30, 'proposal-scope', 'c', 't');
    INSERT INTO users (email) VALUES ('dev@smartlearn.local');
    INSERT INTO learning_units (user_id, title) VALUES (1, 'a'), (1, 'b');
  `);
  const { dir } = takeVerifiedSnapshot(dbPath, join(live, 'snapshots'), '2026-10-04');
  return { root, live, dbPath, db, snapshot: dir, env: { SMARTLEARN_DEV_DATA_DIR: live }, cleanup: () => { db.close(); rmSync(root, { recursive: true, force: true }); } };
}

test('drill: a valid snapshot restores elsewhere, opens, passes integrity/FK/count/version checks, and the live database is untouched', () => {
  const w = world();
  try {
    const liveHash = sha256File(w.dbPath);
    const report = restoreDrill(w.snapshot, join(w.root, 'restore-here'), { env: w.env });
    assert.equal(report.ok, true, JSON.stringify(report.checks));
    assert.deepEqual(report.checks.map((c) => c.status), Array(report.checks.length).fill('PASS'));
    assert.match(report.checks.find((c) => c.name === 'history is readable').detail, /users=1 learning_units=2/);
    const restored = new Database(report.restoredDb, { readonly: true });
    assert.equal(restored.prepare('SELECT COUNT(*) AS n FROM learning_units').get().n, 2);
    restored.close();
    assert.equal(sha256File(w.dbPath), liveHash, 'the live database file is byte-identical after the drill');
  } finally { w.cleanup(); }
});

test('drill: a tampered snapshot fails before anything is restored', () => {
  const w = world();
  try {
    writeFileSync(join(w.snapshot, 'smartlearn-dev.db'), Buffer.concat([readFileSync(join(w.snapshot, 'smartlearn-dev.db')), Buffer.from('x')]));
    const dest = join(w.root, 'restore-here');
    const report = restoreDrill(w.snapshot, dest, { env: w.env });
    assert.equal(report.ok, false);
    assert.equal(report.restoredDb, null);
    assert.match(report.checks[0].name, /snapshot is valid/);
  } finally { w.cleanup(); }
});

test('drill: refuses a destination inside the live datastore, and a destination that is not empty', () => {
  const w = world();
  try {
    assert.throws(() => restoreDrill(w.snapshot, join(w.live, 'restore'), { env: w.env }), /inside the live DEV datastore/);
    assert.throws(() => restoreDrill(w.snapshot, w.live, { env: w.env }), /inside the live DEV datastore/);
    const busy = join(w.root, 'busy');
    mkdirSync(busy);
    writeFileSync(join(busy, 'x'), '1');
    assert.throws(() => restoreDrill(w.snapshot, busy, { env: w.env }), /not empty/);
  } finally { w.cleanup(); }
});

test('drill: a snapshot whose rows no longer match its manifest is reported as FAIL', () => {
  const w = world();
  try {
    // forge a consistent-looking snapshot: valid sha256 but the manifest counts were edited afterwards
    const manifestPath = join(w.snapshot, 'manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.counts.learning_units = 99;
    writeFileSync(manifestPath, JSON.stringify(manifest));
    const report = restoreDrill(w.snapshot, join(w.root, 'restore-here'), { env: w.env });
    assert.equal(report.ok, false);
    assert.equal(report.checks.find((c) => c.name === 'row counts equal the manifest').status, 'FAIL');
  } finally { w.cleanup(); }
});
