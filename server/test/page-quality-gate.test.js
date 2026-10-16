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
import * as drafts from '../src/services/generated-drafts.js';
import { buildFixturePdf } from './pdf-fixtures/build-fixture-pdf.js';

// SPRINT 01 (PAGE QUALITY GATE): a page the extractor could not read (EMPTY/FAILED) keeps its
// diagnosis in source_pages, but it is never study material and never model input. Page existence
// is not evidence of usable text.

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const UPLOAD_DEFAULTS = { maxBytes: 25 * 1024 * 1024, quotaBytes: 200 * 1024 * 1024 };

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-pagequality-'));
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

/** Extracts a real fixture PDF, then marks the given pages as the extractor would have (EMPTY/FAILED, no text). */
async function sourceWithBadPages(db, userId, sourcesDir, texts, badByPage) {
  const source = sourceStorage.acceptUpload(db, userId, { buffer: buildFixturePdf(texts), originalName: 'aula.pdf', contentType: 'application/pdf', sourcesDir, ...UPLOAD_DEFAULTS });
  await extractSource(db, userId, source.id, { sourcesDir });
  const mark = db.prepare("UPDATE source_pages SET text = '', page_status = ? WHERE user_id = ? AND source_id = ? AND page_index = ?");
  for (const [pageIndex, status] of Object.entries(badByPage)) mark.run(status, userId, source.id, Number(pageIndex));
  return source;
}

test('chunking never creates a proposal for a page with no usable text, and the diagnosis stays on the page', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'a@example.com');
    const source = await sourceWithBadPages(db, userId, sourcesDir, ['um', 'dois', 'tres', 'quatro'], { 2: 'EMPTY', 4: 'FAILED' });

    const created = proposals.chunkSource(db, userId, source.id, { maxPagesPerChunk: 1 });
    assert.deepEqual(created.map((p) => [p.pageStart, p.pageEnd]), [[1, 1], [3, 3]], 'only pages with usable text may become proposals');

    const kept = db.prepare('SELECT page_index, page_status FROM source_pages WHERE user_id = ? AND source_id = ? ORDER BY page_index').all(userId, source.id);
    assert.deepEqual(kept.map((r) => [r.page_index, r.page_status]), [[1, 'OK'], [2, 'EMPTY'], [3, 'OK'], [4, 'FAILED']], 'the page and its diagnosis are preserved, not deleted');
  } finally { cleanup(); }
});

test('a proposal range that spans an unreadable page shows and sends only the readable pages', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'b@example.com');
    const source = await sourceWithBadPages(db, userId, sourcesDir, ['uno', 'dos', 'tres'], { 2: 'FAILED' });

    const [proposal] = proposals.chunkSource(db, userId, source.id, { maxPagesPerChunk: 10 });
    assert.deepEqual([proposal.pageStart, proposal.pageEnd], [1, 3]);
    assert.equal(proposals.getProposal(db, userId, proposal.id).excerpt, 'uno\n\ntres');

    const draft = await drafts.createDraft(db, userId, proposal.id);
    const cited = new Set([...draft.summarySourceSpans, ...draft.questions.flatMap((q) => q.sourceSpans)].map((s) => s.pageIndex));
    assert.deepEqual([...cited].sort(), [1, 3], 'the model input and every citation exclude the unreadable page');
  } finally { cleanup(); }
});

test('generating from a proposal with no usable text is an explicit domain error and stores nothing', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'c@example.com');
    const source = await sourceWithBadPages(db, userId, sourcesDir, ['ok', 'vazia'], { 2: 'EMPTY' });
    // A proposal from before the gate existed (or written directly) can still point at an unreadable range.
    const now = new Date().toISOString();
    const proposalId = db.prepare('INSERT INTO content_proposals (user_id, source_id, chunk_index, page_start, page_end, title, created_at, updated_at) VALUES (?, ?, 0, 2, 2, ?, ?, ?)')
      .run(userId, source.id, 'so a pagina vazia', now, now).lastInsertRowid;

    await assert.rejects(() => drafts.createDraft(db, userId, proposalId), (err) => err.code === 'NO_USABLE_TEXT');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM generated_drafts WHERE user_id = ?').get(userId).n, 0);
  } finally { cleanup(); }
});
