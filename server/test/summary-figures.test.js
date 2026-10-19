// Summary figures: images inside a Resumo Mestre. Only raster formats recognised by their BYTES, owner-only, alt text required, and a
// repeated upload of the same image is the same figure.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import * as figures from '../src/services/summary-figures.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-figures-'));
  const db = openDb(join(dir, 'test.db'));
  runMigrations(db, MIGRATIONS_DIR);
  return { db, cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}
const makeUser = (db, email) => {
  const now = new Date().toISOString();
  return db.prepare(`INSERT INTO users (email, email_display, password_hash, password_salt, password_algorithm, password_params, created_at, updated_at)
    VALUES (?, ?, 'h', 's', 'scrypt', '{}', ?, ?)`).run(email, email, now, now).lastInsertRowid;
};

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('png-body')]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('jpeg-body')]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([1, 0, 0, 0]), Buffer.from('WEBPVP8 ')]);
const GIF = Buffer.from('GIF89a-body');

test('accepts PNG, JPEG, WebP and GIF by their bytes and stores them for the owner', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'a@example.com');
    const got = [PNG, JPEG, WEBP, GIF].map((buffer, i) => figures.create(db, userId, { buffer, alt: `figura ${i}` }));
    assert.deepEqual(got.map((f) => f.mime), ['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
    assert.deepEqual(figures.read(db, userId, got[0].id).bytes, PNG);
  } finally { cleanup(); }
});

test('rejects SVG, HTML, PDF and anything else that is not a raster image, whatever the client calls it', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'a@example.com');
    for (const body of ['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', '<html><script>1</script></html>', '%PDF-1.7 x', 'GIF-not-really', 'plain']) {
      assert.throws(() => figures.create(db, userId, { buffer: Buffer.from(body), alt: 'x' }), (e) => e.code === 'UNSUPPORTED_FILE_TYPE', body);
    }
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM summary_figures').get().n, 0);
  } finally { cleanup(); }
});

test('alt text is required (and cleaned of control characters); empty input and oversize are refused', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'a@example.com');
    for (const alt of ['', '   ', undefined, 'x'.repeat(301)]) {
      assert.throws(() => figures.create(db, userId, { buffer: PNG, alt }), (e) => e.code === 'VALIDATION_FAILED' && e.field === 'alt');
    }
    assert.equal(figures.create(db, userId, { buffer: PNG, alt: 'Barreira‮ de filtração' }).alt, 'Barreira de filtração');
    assert.throws(() => figures.create(db, userId, { buffer: Buffer.alloc(0), alt: 'x' }), (e) => e.code === 'VALIDATION_FAILED');
    const big = Buffer.concat([PNG, Buffer.alloc(figures.MAX_FIGURE_BYTES)]);
    assert.throws(() => figures.create(db, userId, { buffer: big, alt: 'x' }), (e) => e.code === 'FILE_TOO_LARGE');
  } finally { cleanup(); }
});

test('the same image uploaded again is the same figure; another user can neither read it nor see that it exists', () => {
  const { db, cleanup } = tmpDb();
  try {
    const alice = makeUser(db, 'a@example.com');
    const bob = makeUser(db, 'b@example.com');
    const first = figures.create(db, alice, { buffer: PNG, alt: 'um' });
    const again = figures.create(db, alice, { buffer: PNG, alt: 'outro texto' });
    assert.equal(again.id, first.id);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM summary_figures WHERE user_id = ?').get(alice).n, 1);
    assert.throws(() => figures.read(db, bob, first.id), (e) => e.code === 'NOT_FOUND');
    assert.throws(() => figures.read(db, alice, 99999), (e) => e.code === 'NOT_FOUND');
    const bobsCopy = figures.create(db, bob, { buffer: PNG, alt: 'do Bob' });
    assert.notEqual(bobsCopy.id, first.id, 'dedupe is per owner');
  } finally { cleanup(); }
});

test('the logical export carries the figures (bytes as base64) for their owner only', async () => {
  const { createLogicalExport } = await import('../src/backup.js');
  const { db, cleanup } = tmpDb();
  try {
    const alice = makeUser(db, 'a@example.com');
    const bob = makeUser(db, 'b@example.com');
    const mine = figures.create(db, alice, { buffer: PNG, alt: 'um' });
    figures.create(db, bob, { buffer: JPEG, alt: 'do Bob' });
    const exported = createLogicalExport(db, alice);
    assert.equal(exported.summaryFigures.length, 1);
    assert.equal(exported.summaryFigures[0].id, mine.id);
    assert.deepEqual(Buffer.from(exported.summaryFigures[0].dataBase64, 'base64'), PNG);
    assert.equal('data' in exported.summaryFigures[0], false);
  } finally { cleanup(); }
});
