import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import * as sourceStorage from '../src/services/source-storage.js';
import { extractSource } from '../src/services/source-extraction.js';
import * as proposals from '../src/services/content-proposals.js';
import { buildFixturePdf } from './pdf-fixtures/build-fixture-pdf.js';

// SPRINT 05b (SEMANTIC UNITIZATION), end to end: a PDF that carries its own structure is unitized by it.
// Shape and depth taken from a real textbook (Kumar & Clark 11th ed.: chapter > SECTION > subsection, each with a page).

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const UPLOAD_DEFAULTS = { maxBytes: 25 * 1024 * 1024, quotaBytes: 200 * 1024 * 1024 };

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-units-'));
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

async function extracted(db, userId, sourcesDir, pages, options) {
  const source = sourceStorage.acceptUpload(db, userId, { buffer: buildFixturePdf(pages, options), originalName: 'aula.pdf', contentType: 'application/pdf', sourcesDir, ...UPLOAD_DEFAULTS });
  const result = await extractSource(db, userId, source.id, { sourcesDir });
  return { source, result };
}

const OUTLINE = [
  { title: 'Consulta clinica', page: 1, items: [{ title: 'Historia', page: 1 }, { title: 'Exame fisico', page: 3 }, { title: 'Investigacao', page: 5 }] },
];

test('the document outline is stored with its levels and resolved pages, in document order', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'a@example.com');
    const { source } = await extracted(db, userId, sourcesDir, ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'], { outline: OUTLINE });
    const rows = db.prepare('SELECT ordinal, level, title, page_index FROM source_outline WHERE user_id = ? AND source_id = ? ORDER BY ordinal').all(userId, source.id);
    assert.deepEqual(rows.map((r) => [r.level, r.title, r.page_index]), [[1, 'Consulta clinica', 1], [2, 'Historia', 1], [2, 'Exame fisico', 3], [2, 'Investigacao', 5]]);
  } finally { cleanup(); }
});

test('a structured PDF is chunked into its own sections, named by the document, instead of arbitrary page blocks', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'b@example.com');
    const { source } = await extracted(db, userId, sourcesDir, ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'], { outline: OUTLINE });
    const units = proposals.chunkSource(db, userId, source.id, { maxPagesPerChunk: 3 });
    assert.deepEqual(units.map((u) => [u.pageStart, u.pageEnd, u.title]), [[1, 2, 'Historia'], [3, 4, 'Exame fisico'], [5, 6, 'Investigacao']]);
  } finally { cleanup(); }
});

test('a PDF without an outline is chunked exactly as before, with the default page-range title', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'c@example.com');
    const { source } = await extracted(db, userId, sourcesDir, ['p1', 'p2', 'p3', 'p4', 'p5'], {});
    const units = proposals.chunkSource(db, userId, source.id, { maxPagesPerChunk: 2 });
    assert.deepEqual(units.map((u) => [u.pageStart, u.pageEnd]), [[1, 2], [3, 4], [5, 5]]);
    assert.match(units[0].title, /aula — páginas 1-2/);
  } finally { cleanup(); }
});

test('re-extraction replaces the stored outline instead of accumulating it', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'd@example.com');
    const { source } = await extracted(db, userId, sourcesDir, ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'], { outline: OUTLINE });
    await extractSource(db, userId, source.id, { sourcesDir });
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM source_outline WHERE user_id = ? AND source_id = ?').get(userId, source.id).n, 4);
  } finally { cleanup(); }
});

test('a capitals outline becomes readable unit titles, keeping the acronyms the document writes in capitals', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'e@example.com');
    const outline = [{ title: 'HLA MOLECULES AND ANTIGEN PRESENTATION', page: 1 }, { title: 'INNATE IMMUNE SYSTEM', page: 3 }];
    const { source } = await extracted(db, userId, sourcesDir, ['HLA class I presents peptides.', 'texto', 'the innate system responds fast.', 'texto'], { outline });
    const units = proposals.chunkSource(db, userId, source.id, { maxPagesPerChunk: 2 });
    assert.deepEqual(units.map((u) => u.title), ['HLA molecules and antigen presentation', 'Innate immune system']);
  } finally { cleanup(); }
});
