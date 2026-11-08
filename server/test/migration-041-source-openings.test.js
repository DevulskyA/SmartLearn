// Migration 041 (source_openings can go together with its source). Disposable databases only: nothing here touches a real database.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, readdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import * as openings from '../src/services/source-openings.js';
import * as sourceStorage from '../src/services/source-storage.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));

const makeUser = (db, email) => {
  const now = new Date().toISOString();
  return db.prepare(`INSERT INTO users (email, email_display, password_hash, password_salt, password_algorithm, password_params, created_at, updated_at)
    VALUES (?, ?, 'h', 's', 'scrypt', '{}', ?, ?)`).run(email, email, now, now).lastInsertRowid;
};
const makeSource = (db, userId, checksum) => db.prepare(`INSERT INTO sources (user_id, filename, original_name, content_type, byte_size, checksum, status, created_at, page_count)
  VALUES (?, ?, 'Aula.pdf', 'application/pdf', 100, ?, 'UPLOADED', ?, 12)`).run(userId, `f-${checksum}.pdf`, checksum, new Date().toISOString()).lastInsertRowid;
const tables = (db) => db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((r) => r.name);
const snapshot = (db) => Object.fromEntries(tables(db).filter((n) => n !== 'schema_migrations').map((n) => [n, db.prepare(`SELECT * FROM "${n}" ORDER BY 1`).all()]));

function databaseAt040() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-mig041-'));
  const upTo040 = join(dir, 'm040');
  mkdirSync(upTo040);
  for (const file of readdirSync(MIGRATIONS_DIR)) if (!file.startsWith('041-')) copyFileSync(join(MIGRATIONS_DIR, file), join(upTo040, file));
  const db = openDb(join(dir, 'test.db'));
  runMigrations(db, upTo040);
  return { db, dir, cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}

test('on a database at 040 the migration changes only the delete trigger and leaves every row, every other object and the foreign keys intact', () => {
  const { db, cleanup } = databaseAt040();
  try {
    const alice = makeUser(db, 'alice@example.com');
    const bob = makeUser(db, 'bob@example.com');
    const a1 = makeSource(db, alice, 'a1');
    const a2 = makeSource(db, alice, 'a2');
    const b1 = makeSource(db, bob, 'b1');
    openings.record(db, alice, { sourceId: a1, pageIndex: 1, context: 'STUDY', operationKey: 'k1' });
    openings.record(db, alice, { sourceId: a2, pageIndex: null, context: 'PLAN', operationKey: 'k2' });
    openings.record(db, bob, { sourceId: b1, pageIndex: 3, context: 'REVIEW', operationKey: 'k1' });
    const objects = () => Object.fromEntries(db.prepare("SELECT name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").all().map((r) => [r.name, r.sql]));
    const objectsBefore = objects();
    const rowsBefore = snapshot(db);

    runMigrations(db, MIGRATIONS_DIR);

    const objectsAfter = objects();
    const changed = Object.keys(objectsAfter).filter((name) => objectsBefore[name] !== objectsAfter[name]);
    assert.deepEqual(changed, ['source_openings_no_delete'], 'only the delete trigger differs');
    assert.deepEqual(Object.keys(objectsAfter).sort(), Object.keys(objectsBefore).sort(), 'no object added or dropped');
    assert.deepEqual(snapshot(db), rowsBefore, 'no row of any table changed');
    assert.deepEqual(db.pragma('foreign_key_check'), []);
    assert.equal(db.pragma('integrity_check', { simple: true }), 'ok');
  } finally { cleanup(); }
});

test('after the migration a record stays append-only while its source exists, and a source cannot be deleted from under its records', () => {
  const { db, cleanup } = databaseAt040();
  try {
    runMigrations(db, MIGRATIONS_DIR);
    const alice = makeUser(db, 'alice@example.com');
    const source = makeSource(db, alice, 'a1');
    const first = openings.record(db, alice, { sourceId: source, pageIndex: 2, context: 'STUDY', operationKey: 'k1' });
    assert.throws(() => db.prepare('DELETE FROM source_openings WHERE id = ?').run(first.id), /append-only/);
    assert.throws(() => db.prepare('UPDATE source_openings SET context = ? WHERE id = ?').run('PLAN', first.id), /append-only/);
    assert.throws(() => db.prepare('DELETE FROM sources WHERE id = ?').run(source), /FOREIGN KEY/i, 'a bare delete of the source is refused by the foreign key');
    assert.equal(openings.list(db, alice, { sourceId: source }).length, 1, 'the record survived every refused statement');
  } finally { cleanup(); }
});

test('removing an opened source takes its records and nothing else; another user and another source of the same user keep theirs', () => {
  const { db, dir, cleanup } = databaseAt040();
  try {
    runMigrations(db, MIGRATIONS_DIR);
    const alice = makeUser(db, 'alice@example.com');
    const bob = makeUser(db, 'bob@example.com');
    const a1 = makeSource(db, alice, 'a1');
    const a2 = makeSource(db, alice, 'a2');
    const b1 = makeSource(db, bob, 'b1');
    for (const [user, source, key] of [[alice, a1, 'k1'], [alice, a1, 'k2'], [alice, a2, 'k3'], [bob, b1, 'k1']]) {
      openings.record(db, user, { sourceId: source, pageIndex: 1, context: 'STUDY', operationKey: key });
    }
    const sourcesDir = join(dir, 'sources');
    mkdirSync(sourcesDir);
    const result = sourceStorage.remove(db, alice, a1, { sourcesDir, mediaDir: join(dir, 'media') });
    assert.deepEqual(result, { removed: true, id: a1 });
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sources WHERE id = ?').get(a1).n, 0);
    assert.deepEqual(openings.list(db, alice, { sourceId: a1 }), []);
    assert.equal(openings.list(db, alice, { sourceId: a2 }).length, 1, "the same user's other source keeps its record");
    assert.equal(openings.list(db, bob, { sourceId: b1 }).length, 1, "another user's record is untouched");
    assert.deepEqual(db.pragma('foreign_key_check'), []);
    assert.equal(db.pragma('integrity_check', { simple: true }), 'ok');
  } finally { cleanup(); }
});

test('a refused removal (the source feeds a lesson) deletes nothing, records included', () => {
  const { db, dir, cleanup } = databaseAt040();
  try {
    runMigrations(db, MIGRATIONS_DIR);
    const alice = makeUser(db, 'alice@example.com');
    const source = makeSource(db, alice, 'a1');
    openings.record(db, alice, { sourceId: source, pageIndex: 1, context: 'STUDY', operationKey: 'k1' });
    // a figure of this source used inside a lesson makes the removal refuse (SOURCE_HAS_UNITS); simulate the guard's own condition by an accepted draft
    const proposals = db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'content_proposals'").get().n;
    assert.equal(proposals, 1);
    const before = snapshot(db);
    // the same transaction body, failing after the deletions: everything is rolled back, records included, and the deferred pragma does not leak
    assert.throws(() => db.transaction(() => {
      db.pragma('defer_foreign_keys = ON');
      db.prepare('DELETE FROM sources WHERE user_id = ? AND id = ?').run(alice, source);
      db.prepare('DELETE FROM source_openings WHERE user_id = ? AND source_id = ?').run(alice, source);
      throw new Error('something later in the removal failed');
    })(), /something later/);
    assert.deepEqual(snapshot(db), before, 'a failure inside the removal leaves every row as it was');
    assert.deepEqual(db.pragma('foreign_key_check'), []);
    assert.equal(db.pragma('defer_foreign_keys', { simple: true }), 0, 'foreign keys are immediate again after the transaction');
    assert.throws(() => db.prepare('DELETE FROM sources WHERE id = ?').run(source), /FOREIGN KEY/i);
    assert.ok(dir);
  } finally { cleanup(); }
});
