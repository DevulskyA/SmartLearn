import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orderItemsByColumns } from '../src/pdf/column-order.js';
import { pageTextFromItems } from '../src/pdf/page-text.js';

const PAGE = { width: 612, height: 783 };
// one visual line = a text item followed by pdf.js's empty hasEOL item
const line = (x, y, str, width = 230) => [
  { str, transform: [1, 0, 0, 1, x, y], width, height: 10, hasEOL: false },
  { str: '', transform: [1, 0, 0, 1, x + width, y], width: 0, height: 10, hasEOL: true },
];
const column = (x, topY, prefix, n) => Array.from({ length: n }, (_, i) => line(x, topY - i * 12, `${prefix}${i + 1}`)).flat();
const header = () => line(453, 741, 'Chapter 6 header', 100);
const footer = () => line(300, 20, 'footer 261', 60);
const textOf = (items) => pageTextFromItems(items).split('\n');

test('right column painted before the left one: the left column is read first, header and footer keep their place', () => {
  const items = [...header(), ...column(318, 705, 'R', 7), ...column(60, 716, 'L', 7), ...footer()];
  const out = orderItemsByColumns(items, PAGE);
  assert.deepEqual(textOf(out), ['Chapter 6 header', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'footer 261']);
  assert.equal(out.length, items.length, 'no item is lost or duplicated');
});

test('the sentence that the right column starts is not interrupted by the left column any more', () => {
  const right = [...line(318, 705, 'Heading'), ...column(318, 690, 'R', 6), ...line(318, 600, 'which are attached to the basement')];
  const left = [...line(60, 716, 'zero it is nearly zero.'), ...column(60, 704, 'L', 6)];
  const text = pageTextFromItems(orderItemsByColumns([...header(), ...right, ...left], PAGE));
  assert.ok(text.indexOf('nearly zero') < text.indexOf('Heading'), 'left column text precedes the right column heading');
  assert.ok(text.trimEnd().endsWith('attached to the basement'), 'the page now ends where the right column ends');
});

test('already left-first pages are returned untouched (same array)', () => {
  const items = [...header(), ...column(60, 716, 'L', 7), ...column(318, 705, 'R', 7), ...footer()];
  assert.equal(orderItemsByColumns(items, PAGE), items);
});

test('a line that spans the gutter (full-width title or caption) means the layout is not plain two-column: untouched', () => {
  const items = [...header(), ...column(318, 705, 'R', 7), ...line(60, 600, 'A full width title across the page', 480), ...column(60, 716, 'L', 7)];
  assert.equal(orderItemsByColumns(items, PAGE), items);
});

test('interleaved columns (more than one switch) are untouched', () => {
  const items = [...column(318, 705, 'R', 7), ...column(60, 716, 'L', 7), ...column(318, 300, 'S', 7)];
  assert.equal(orderItemsByColumns(items, PAGE), items);
});

test('blocks shorter than six lines are untouched (a marginal note is not a column)', () => {
  const items = [...column(318, 705, 'R', 7), ...column(60, 716, 'L', 5)];
  assert.equal(orderItemsByColumns(items, PAGE), items);
});

test('a single-column page is untouched', () => {
  const items = [...header(), ...column(60, 705, 'A', 20)];
  assert.equal(orderItemsByColumns(items, PAGE), items);
});

test('missing or invalid page size or items: returned as they are', () => {
  const items = column(318, 705, 'R', 7);
  assert.equal(orderItemsByColumns(items, null), items);
  assert.equal(orderItemsByColumns(items, { width: 0, height: 0 }), items);
  assert.equal(orderItemsByColumns(null, PAGE), null);
});

// End to end through the real extraction worker (not only the pure function): the page is a real PDF whose content
// stream paints the right column first. Without the wiring in extract-worker.js the stored page text reads right, left.
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import * as sourceStorage from '../src/services/source-storage.js';
import { extractSource } from '../src/services/source-extraction.js';
import { buildPositionedPdf } from './pdf-fixtures/build-positioned-pdf.js';

const col = (x, topY, prefix, n) => Array.from({ length: n }, (_, i) => ({ x, y: topY - i * 12, text: `${prefix} column line ${i + 1}` }));

async function storedPageText(pdfLines) {
  const dir = mkdtempSync(join(tmpdir(), 'sl-colorder-'));
  const db = openDb(join(dir, 'test.db'));
  try {
    runMigrations(db, fileURLToPath(new URL('../migrations', import.meta.url)));
    const now = new Date().toISOString();
    const userId = db.prepare(`INSERT INTO users (email, email_display, password_hash, password_salt, password_algorithm, password_params, created_at, updated_at) VALUES ('c@example.com', 'c@example.com', 'h', 's', 'scrypt', '{}', ?, ?)`).run(now, now).lastInsertRowid;
    const sourcesDir = join(dir, 'sources');
    const source = sourceStorage.acceptUpload(db, userId, { buffer: buildPositionedPdf(pdfLines), originalName: 'cols.pdf', contentType: 'application/pdf', sourcesDir, maxBytes: 25 * 1024 * 1024, quotaBytes: 200 * 1024 * 1024 });
    const result = await extractSource(db, userId, source.id, { sourcesDir });
    assert.equal(result.status, 'EXTRACTED');
    return db.prepare('SELECT text FROM source_pages WHERE user_id = ? AND source_id = ? AND page_index = 1').get(userId, source.id).text;
  } finally { db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
}

test('extraction pipeline: a real two-column PDF painted right-then-left is stored in reading order (left column first)', async () => {
  const text = await storedPageText([...col(318, 700, 'Right', 8), ...col(60, 700, 'Left', 8)]);
  assert.ok(text.indexOf('Left column line 1') >= 0 && text.indexOf('Right column line 1') >= 0, 'both columns extracted');
  assert.ok(text.indexOf('Left column line 8') < text.indexOf('Right column line 1'), 'the whole left column precedes the right column');
});

test('extraction pipeline: the same two columns painted left-then-right are stored exactly as painted (no change)', async () => {
  const text = await storedPageText([...col(60, 700, 'Left', 8), ...col(318, 700, 'Right', 8)]);
  assert.ok(text.indexOf('Left column line 8') < text.indexOf('Right column line 1'));
});

test('a column boundary is a line boundary: the left column\'s last line has no end-of-line item in the stream, and the right column must still start on its own line', () => {
  // as in the real Costanzo page 267: the last item painted on the page (a watermark) carries no end-of-line marker
  const left = [...column(60, 716, 'L', 6), { str: 'watermark.com', transform: [1, 0, 0, 1, 60, 560], width: 90, height: 10, hasEOL: false }];
  const right = [...line(318, 705, 'GLOMERULAR FILTRATION', 160), ...column(318, 690, 'R', 6)];
  const out = orderItemsByColumns([...header(), ...right, ...left], PAGE);
  const lines = textOf(out);
  assert.ok(lines.includes('watermark.com'), 'the left column ends on its own line');
  assert.ok(lines.includes('GLOMERULAR FILTRATION'), 'the right column heading starts on its own line (a section heading must be locatable)');
  assert.equal(out.length, right.length + left.length + header().length, 'no item is lost or duplicated');
});
