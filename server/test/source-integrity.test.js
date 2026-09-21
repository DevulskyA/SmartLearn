import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import * as sourceStorage from '../src/services/source-storage.js';
import { extractSource } from '../src/services/source-extraction.js';
import { buildFixturePdf } from './pdf-fixtures/build-fixture-pdf.js';

// SPRINT 03 (SOURCE FILE IDENTITY): the checksum recorded at upload is the identity of the source.
// Content is only derived from bytes that still match it; anything else fails closed and mutates nothing.

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const UPLOAD_DEFAULTS = { maxBytes: 25 * 1024 * 1024, quotaBytes: 200 * 1024 * 1024 };

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-integrity-'));
  const db = openDb(join(dir, 'test.db'));
  runMigrations(db, MIGRATIONS_DIR);
  return { db, sourcesDir: join(dir, 'sources'), cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}

function makeUser(db, email) {
  const now = new Date().toISOString();
  return db.prepare(`
    INSERT INTO users (email, email_display, password_hash, password_salt, password_algorithm, password_params, created_at, updated_at)
    VALUES (?, ?, 'h', 's', 'scrypt', '{}', ?, ?)
  `).run(email, email, now, now).lastInsertRowid;
}

function upload(db, userId, sourcesDir, pages) {
  const source = sourceStorage.acceptUpload(db, userId, { buffer: buildFixturePdf(pages), originalName: 'aula.pdf', contentType: 'application/pdf', sourcesDir, ...UPLOAD_DEFAULTS });
  const row = db.prepare('SELECT filename FROM sources WHERE id = ?').get(source.id);
  return { source, filePath: join(sourcesDir, row.filename) };
}

const snapshot = (db, id) => ({
  source: db.prepare('SELECT extraction_status, extraction_generation, parser_version FROM sources WHERE id = ?').get(id),
  pages: db.prepare('SELECT page_index, text, page_status FROM source_pages WHERE source_id = ? ORDER BY page_index').all(id),
});

test('bytes that no longer match the recorded checksum are never extracted: same size, different content', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'a@example.com');
    const { source, filePath } = upload(db, userId, sourcesDir, ['conteudo original']);
    const original = readFileSync(filePath);
    const tampered = Buffer.from(original);
    tampered[tampered.length - 12] ^= 0x01; // flip one bit inside the file, size unchanged
    assert.equal(tampered.length, original.length);
    writeFileSync(filePath, tampered);
    const before = snapshot(db, source.id);

    await assert.rejects(() => extractSource(db, userId, source.id, { sourcesDir }), (err) => err.code === 'SOURCE_INTEGRITY_FAILED');
    assert.deepEqual(snapshot(db, source.id), before, 'a refused extraction mutates nothing (not even the generation counter)');
  } finally { cleanup(); }
});

test('a different-size replacement is refused too, and a previous good extraction is left exactly as it was', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'b@example.com');
    const { source, filePath } = upload(db, userId, sourcesDir, ['pagina um', 'pagina dois']);
    const first = await extractSource(db, userId, source.id, { sourcesDir });
    assert.equal(first.status, 'EXTRACTED');
    const before = snapshot(db, source.id);

    writeFileSync(filePath, buildFixturePdf(['texto completamente diferente e mais longo que o original', 'outro', 'outro mais']));

    await assert.rejects(() => extractSource(db, userId, source.id, { sourcesDir }), (err) => err.code === 'SOURCE_INTEGRITY_FAILED');
    assert.deepEqual(snapshot(db, source.id), before, 'the earlier pages and their provenance must survive a refused re-extraction');
  } finally { cleanup(); }
});

test('a missing stored file is an explicit error, not an empty extraction', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'c@example.com');
    const { source, filePath } = upload(db, userId, sourcesDir, ['x']);
    unlinkSync(filePath);
    await assert.rejects(() => extractSource(db, userId, source.id, { sourcesDir }), (err) => err.code === 'SOURCE_FILE_MISSING');
  } finally { cleanup(); }
});

test('an intact file still extracts normally (the identity check is not a new failure mode)', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'd@example.com');
    const { source } = upload(db, userId, sourcesDir, ['ok um', 'ok dois']);
    const result = await extractSource(db, userId, source.id, { sourcesDir });
    assert.equal(result.status, 'EXTRACTED');
    assert.equal(result.okPageCount, 2);
  } finally { cleanup(); }
});
