// A figure occurrence may carry its display width (`[[fig:UUID|w=420]]`). Everything that asks "is this figure still used / is this reference valid /
// does it survive an export, a backup and a restore" must understand the sized marker exactly like the legacy one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import * as assets from '../src/services/visual-assets.js';
import * as learningUnits from '../src/services/learning-units.js';
import * as ops from '../src/operational-backup.js';
import { createLogicalExport } from '../src/backup.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));

function env() {
  const root = mkdtempSync(join(tmpdir(), 'sl-figwidth-'));
  const db = openDb(join(root, 'test.db'));
  runMigrations(db, MIGRATIONS_DIR);
  return { root, db, mediaDir: join(root, 'media'), sourcesDir: join(root, 'sources'), cleanup: () => { db.close(); rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}
const makeUser = (db, email) => {
  const now = new Date().toISOString();
  return Number(db.prepare(`INSERT INTO users (email, email_display, password_hash, password_salt, password_algorithm, password_params, created_at, updated_at)
    VALUES (?, ?, 'h', 's', 'scrypt', '{}', ?, ?)`).run(email, email, now, now).lastInsertRowid);
};
const png = () => sharp({ create: { width: 40, height: 30, channels: 3, background: '#2563eb' } }).png().toBuffer();
const input = (buffer) => ({ buffer, alt: 'Esquema', caption: 'Figura 1', operationKey: `k-${Math.random().toString(36).slice(2)}` });
const filesIn = (dir) => (existsSync(dir) ? readdirSync(dir) : []);
let counter = 0;
const unitWith = (db, userId, summaryBody) => learningUnits.create(db, userId, { newSubjectName: `Fisiologia ${counter += 1}`, title: 'Aula', studyDate: '2026-09-01', summaryBody }).unit;

test('a figure whose marker carries a width is still "in use": it is listed as referenced and cannot be deleted until the marker leaves the text', async () => {
  const e = env();
  try {
    const u = makeUser(e.db, 'a@example.com');
    const { asset } = await assets.create(e.db, u, input(await png()), { mediaDir: e.mediaDir });
    const unit = unitWith(e.db, u, `Texto\n\n[[fig:${asset.id}|w=420]]\n\nfim`);
    assert.deepEqual(assets.referencesOf(e.db, u, asset.id), [{ type: 'unit', id: unit.id }]);
    assert.throws(() => assets.remove(e.db, u, asset.id, e.mediaDir), (err) => err.code === 'ASSET_IN_USE');
    assert.equal(filesIn(e.mediaDir).length, 1, 'the refused delete touched nothing');
    // the same figure at two sizes in one text, and in another lesson: still referenced after one occurrence goes away
    learningUnits.updateFields(e.db, u, unit.id, { summaryBody: `[[fig:${asset.id}|w=60]]\n\nx\n\n[[fig:${asset.id}|w=900]]` });
    assert.throws(() => assets.remove(e.db, u, asset.id, e.mediaDir), (err) => err.code === 'ASSET_IN_USE');
    learningUnits.updateFields(e.db, u, unit.id, { summaryBody: 'sem figura' });
    assets.remove(e.db, u, asset.id, e.mediaDir);
    assert.deepEqual(filesIn(e.mediaDir), []);
  } finally { e.cleanup(); }
});

test('a sized marker pointing at another student\'s figure, or at nothing, is refused exactly like the legacy marker; an invalid width is just text', async () => {
  const e = env();
  try {
    const alice = makeUser(e.db, 'a@example.com');
    const bob = makeUser(e.db, 'b@example.com');
    const mine = (await assets.create(e.db, alice, input(await png()), { mediaDir: e.mediaDir })).asset;
    const theirs = (await assets.create(e.db, bob, input(await png()), { mediaDir: e.mediaDir })).asset;
    const create = (body) => unitWith(e.db, alice, body);
    assert.throws(() => create(`[[fig:${theirs.id}|w=420]]`), (err) => err.code === 'VALIDATION_FAILED' && err.field === 'summaryBody');
    assert.throws(() => create('[[fig:00000000-0000-4000-8000-000000000000|w=420]]'), (err) => err.code === 'VALIDATION_FAILED');
    assert.deepEqual(assets.findUnresolvedRefs(e.db, bob, `[[fig:${mine.id}|w=420]]`), [{ id: mine.id, reason: 'UNKNOWN' }]);
    assert.ok(create(`ok\n\n[[fig:${mine.id}|w=420]]`).id);
    // outside the grammar it is not a reference at all (and is not rendered as a figure either), so it cannot smuggle anything in
    assert.ok(create(`[[fig:${theirs.id}|w=5]] e [[fig:${theirs.id}|h=3]]`).id);
  } finally { e.cleanup(); }
});

test('the textual export, the operational backup, the restore and the restore rehearsal all understand the sized marker', async () => {
  const e = env();
  try {
    const u = makeUser(e.db, 'a@example.com');
    const { asset } = await assets.create(e.db, u, input(await png()), { mediaDir: e.mediaDir });
    const body = `Aula\n\n[[fig:${asset.id}|w=420]]\n\nentre\n\n[[fig:${asset.id}]]`;
    const unit = unitWith(e.db, u, body);

    const dest = join(e.root, 'backup');
    await ops.createOperationalBackup(e.db, { sourcesDir: e.sourcesDir, mediaDir: e.mediaDir, destDir: dest });
    assert.deepEqual(ops.verifyOperationalBackup(dest), []);
    const report = await ops.rehearseRestore(dest);
    assert.equal(report.ok, true, JSON.stringify(report.problems));
    assert.equal(report.figureRefsChecked, 1, 'the sized marker is checked as a reference (a figure used twice in one lesson counts once)');
    const restored = await ops.restoreOperationalBackup(dest, join(e.root, 'restored'));
    const copy = openDb(restored.dbPath);
    try {
      assert.equal(learningUnits.getById(copy, u, unit.id).summaryBody, body, 'both markers come back byte for byte');
      assert.deepEqual(assets.referencesOf(copy, u, asset.id).map((r) => r.type), ['unit']);
    } finally { copy.close(); }

    const exported = createLogicalExport(e.db, u).learningUnits.find((x) => x.id === unit.id).summary_body;
    assert.ok(!exported.includes('[[fig:'), 'the textual export leaves no token that would restore as a missing image');
    assert.ok(exported.includes('Figura não incluída'));
  } finally { e.cleanup(); }
});
