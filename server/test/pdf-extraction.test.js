import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import * as sourceStorage from '../src/services/source-storage.js';
import { extractSource, listPages, SourceExtractionError } from '../src/services/source-extraction.js';
import { classifyExtractionError, rollUpExtractionStatus } from '../src/pdf/classify-extraction-error.js';
import { buildFixturePdf } from './pdf-fixtures/build-fixture-pdf.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const UPLOAD_DEFAULTS = { maxBytes: 25 * 1024 * 1024, quotaBytes: 200 * 1024 * 1024 };

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-extract-'));
  const path = join(dir, 'test.db');
  const db = openDb(path);
  runMigrations(db, MIGRATIONS_DIR);
  const sourcesDir = join(dir, 'sources');
  return { db, sourcesDir, cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}

function makeUser(db, email) {
  const now = new Date().toISOString();
  return db.prepare(`
    INSERT INTO users (email, email_display, password_hash, password_salt, password_algorithm, password_params, created_at, updated_at)
    VALUES (?, ?, 'h', 's', 'scrypt', '{}', ?, ?)
  `).run(email, email, now, now).lastInsertRowid;
}

function uploadFixture(db, userId, sourcesDir, pagesText) {
  const buffer = buildFixturePdf(pagesText);
  return sourceStorage.acceptUpload(db, userId, { buffer, originalName: 'fixture.pdf', contentType: 'application/pdf', sourcesDir, ...UPLOAD_DEFAULTS });
}

test('classifyExtractionError: PasswordException maps to ENCRYPTED, other errors map to EXTRACTION_FAILED', () => {
  assert.equal(classifyExtractionError({ name: 'PasswordException', message: 'needs a password' }), 'ENCRYPTED');
  assert.equal(classifyExtractionError({ name: 'InvalidPDFException', message: 'bad structure' }), 'EXTRACTION_FAILED');
  assert.equal(classifyExtractionError(new Error('generic')), 'EXTRACTION_FAILED');
  assert.equal(classifyExtractionError({}), 'EXTRACTION_FAILED');
});

test('a multi-page fixture preserves exact text and page mapping, with checksum/parser version recorded', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'a@example.com');
    const source = uploadFixture(db, userId, sourcesDir, ['Farmacologia: introdução', 'Segunda página com outro conteúdo', 'Terceira e última página']);

    const result = await extractSource(db, userId, source.id, { sourcesDir });
    assert.equal(result.status, 'EXTRACTED');
    assert.equal(result.pageCount, 3);

    const pages = listPages(db, userId, source.id);
    assert.equal(pages.length, 3);
    assert.deepEqual(pages.map(p => p.pageIndex), [1, 2, 3]);
    assert.equal(pages[0].text, 'Farmacologia: introdução');
    assert.equal(pages[1].text, 'Segunda página com outro conteúdo');
    assert.equal(pages[2].text, 'Terceira e última página');

    const row = db.prepare('SELECT extraction_status, page_count, parser_version, extracted_at FROM sources WHERE id = ?').get(source.id);
    assert.equal(row.extraction_status, 'EXTRACTED');
    assert.equal(row.page_count, 3);
    assert.ok(row.parser_version, 'parser_version must be recorded');
    assert.ok(row.extracted_at);
  } finally { cleanup(); }
});

test('a malformed PDF (truncated mid-file) fails extraction explicitly, never silently produces an empty document', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'b@example.com');
    const wellFormed = buildFixturePdf(['some real text']);
    const truncated = wellFormed.subarray(0, Math.floor(wellFormed.length * 0.6)); // cuts off xref/trailer
    // Bypass acceptUpload's own validation (a truncated-but-%PDF--prefixed
    // buffer would still pass the magic-byte check) to reach the worker
    // directly with a file pdf.js itself cannot parse.
    const source = sourceStorage.acceptUpload(db, userId, { buffer: truncated, originalName: 'broken.pdf', contentType: 'application/pdf', sourcesDir, ...UPLOAD_DEFAULTS });
    const filename = db.prepare('SELECT filename FROM sources WHERE id = ?').get(source.id).filename;

    const beforeBytes = readFileSync(join(sourcesDir, filename));
    const result = await extractSource(db, userId, source.id, { sourcesDir });
    assert.equal(result.status, 'EXTRACTION_FAILED');
    assert.ok(result.errorMessage);

    assert.equal(listPages(db, userId, source.id).length, 0);
    const row = db.prepare('SELECT extraction_status FROM sources WHERE id = ?').get(source.id);
    assert.equal(row.extraction_status, 'EXTRACTION_FAILED');

    const afterBytes = readFileSync(join(sourcesDir, filename));
    assert.ok(beforeBytes.equals(afterBytes), 'a failed extraction must never modify the original source file');
  } finally { cleanup(); }
});

test('an artificially short deadline times out safely: the worker is terminated and extraction reports TIMEOUT rather than hanging the caller', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'c@example.com');
    const source = uploadFixture(db, userId, sourcesDir, ['irrelevant, the deadline fires before any real parsing gets a chance to run']);

    const startedAt = Date.now();
    const result = await extractSource(db, userId, source.id, { sourcesDir, deadlineMs: 1 });
    const elapsedMs = Date.now() - startedAt;

    assert.equal(result.status, 'TIMEOUT');
    assert.ok(elapsedMs < 10_000, 'the caller must get a result promptly, not hang indefinitely');

    const row = db.prepare('SELECT extraction_status FROM sources WHERE id = ?').get(source.id);
    assert.equal(row.extraction_status, 'TIMEOUT');
  } finally { cleanup(); }
});

test('re-extraction is idempotent: pages are replaced wholesale, never duplicated or partially updated', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'd@example.com');
    const source = uploadFixture(db, userId, sourcesDir, ['page one', 'page two']);

    await extractSource(db, userId, source.id, { sourcesDir });
    await extractSource(db, userId, source.id, { sourcesDir });

    const pages = listPages(db, userId, source.id);
    assert.equal(pages.length, 2, 're-extraction must not accumulate duplicate page rows');
    const { n } = db.prepare('SELECT COUNT(*) as n FROM source_pages WHERE user_id = ? AND source_id = ?').get(userId, source.id);
    assert.equal(n, 2);
  } finally { cleanup(); }
});

test('a user cannot extract or list pages for a source owned by another user', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userA = makeUser(db, 'e@example.com');
    const userB = makeUser(db, 'f@example.com');
    const source = uploadFixture(db, userA, sourcesDir, ['owned by A']);

    await assert.rejects(() => extractSource(db, userB, source.id, { sourcesDir }), (err) => err instanceof SourceExtractionError && err.code === 'NOT_FOUND');
    assert.throws(() => listPages(db, userB, source.id), (err) => err.code === 'NOT_FOUND');
  } finally { cleanup(); }
});

// C4 (audit): a slower, since-superseded extraction attempt finishing
// after a newer one must never overwrite the newer attempt's result.
// Two calls started back-to-back (before either awaits its worker) bump
// generation to 1 then 2 synchronously -- the first call is permanently
// superseded the instant the second one starts, regardless of which
// worker message arrives first.
test('C4: a stale (superseded) extraction attempt never overwrites a newer attempt\'s result, whichever finishes last', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'h@example.com');
    const source = uploadFixture(db, userId, sourcesDir, ['conteudo estavel entre tentativas']);

    const [first, second] = await Promise.all([
      extractSource(db, userId, source.id, { sourcesDir }),
      extractSource(db, userId, source.id, { sourcesDir }),
    ]);

    assert.equal(first.applied, false, 'the first-started attempt must be superseded once a second one starts');
    assert.equal(second.applied, true, 'the second (latest-started) attempt must be the one that actually persists');

    const row = db.prepare('SELECT extraction_generation, extraction_status FROM sources WHERE id = ?').get(source.id);
    assert.equal(row.extraction_generation, 2);
    assert.equal(row.extraction_status, 'EXTRACTED');

    // Exactly one generation's worth of pages exists — no half-applied mix.
    const pages = listPages(db, userId, source.id);
    assert.equal(pages.length, 1);
  } finally { cleanup(); }
});

test('rollUpExtractionStatus: at least one OK page always yields EXTRACTED, regardless of other pages\' status', () => {
  assert.equal(rollUpExtractionStatus([{ status: 'OK' }]), 'EXTRACTED');
  assert.equal(rollUpExtractionStatus([{ status: 'OK' }, { status: 'EMPTY' }, { status: 'FAILED' }]), 'EXTRACTED');
});

test('rollUpExtractionStatus: zero OK pages with at least one EMPTY (no FAILED) yields IMAGE_ONLY_OR_UNREADABLE', () => {
  assert.equal(rollUpExtractionStatus([{ status: 'EMPTY' }, { status: 'EMPTY' }]), 'IMAGE_ONLY_OR_UNREADABLE');
});

test('rollUpExtractionStatus: every page FAILED (no OK, no EMPTY) yields EXTRACTION_FAILED', () => {
  assert.equal(rollUpExtractionStatus([{ status: 'FAILED' }, { status: 'FAILED' }]), 'EXTRACTION_FAILED');
});

// C5 (audit): "existe algum texto" is not "extração válida" -- a document
// with a real, usable page ALONGSIDE a legitimately blank/image-only page
// (e.g. a scanned cover sheet) must report the document as usable overall
// while still recording each page's own real status, never silently
// treating the empty page as if it held real content.
test('C5: a document mixing a real text page with a legitimately empty page reports EXTRACTED overall, with per-page status distinguishing OK from EMPTY', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'i@example.com');
    const buffer = buildFixturePdf(['Farmacologia real', 'conteudo irrelevante', 'Terceira pagina real'], { emptyPages: [2] });
    const source = sourceStorage.acceptUpload(db, userId, { buffer, originalName: 'mixed.pdf', contentType: 'application/pdf', sourcesDir, ...UPLOAD_DEFAULTS });

    const result = await extractSource(db, userId, source.id, { sourcesDir });
    assert.equal(result.status, 'EXTRACTED', 'one legitimately blank page must not fail the whole document');
    assert.equal(result.okPageCount, 2);
    assert.equal(result.emptyPageCount, 1);
    assert.equal(result.failedPageCount, 0);

    const pages = listPages(db, userId, source.id);
    assert.equal(pages.find((p) => p.pageIndex === 1).pageStatus, 'OK');
    assert.equal(pages.find((p) => p.pageIndex === 2).pageStatus, 'EMPTY');
    assert.equal(pages.find((p) => p.pageIndex === 2).text, '', 'an empty page must never have fabricated text');
    assert.equal(pages.find((p) => p.pageIndex === 3).pageStatus, 'OK');
  } finally { cleanup(); }
});

test('C5: a document where every page is legitimately empty reports IMAGE_ONLY_OR_UNREADABLE, not EXTRACTED', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'j@example.com');
    const buffer = buildFixturePdf(['a', 'b'], { emptyPages: [1, 2] });
    const source = sourceStorage.acceptUpload(db, userId, { buffer, originalName: 'blank.pdf', contentType: 'application/pdf', sourcesDir, ...UPLOAD_DEFAULTS });

    const result = await extractSource(db, userId, source.id, { sourcesDir });
    assert.equal(result.status, 'IMAGE_ONLY_OR_UNREADABLE');
    assert.equal(result.okPageCount, 0);
    assert.equal(result.emptyPageCount, 2);
  } finally { cleanup(); }
});

test('extracting a nonexistent source is rejected without creating any page rows', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'g@example.com');
    await assert.rejects(() => extractSource(db, userId, 999999, { sourcesDir }), (err) => err.code === 'NOT_FOUND');
  } finally { cleanup(); }
});
