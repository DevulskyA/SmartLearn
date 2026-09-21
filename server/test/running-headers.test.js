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
import { stripRunningHeaders } from '../src/pdf/page-text.js';
import { buildFixturePdf } from './pdf-fixtures/build-fixture-pdf.js';

// SPRINT 05d (PAGE FURNITURE). Found on a real textbook chapter (Kumar & Clark, ch. 6): every page starts with a
// running header carrying the page number ("Adaptive immune system 87" / "88 Immunity" / "6Innate immune system 81"),
// which lands in the middle of the study text, often inside a sentence that continues on the next page. The
// signature that makes it safe to remove is the page number: it advances by one from page to page.

const body = (n) => `corpo da pagina ${n} com texto real.`;

test('a header whose page number advances page after page is removed from every page, body untouched', () => {
  const pages = [
    'Adaptive immune system 87\nthe antibody binds the antigen',
    '88 Immunity\nand the response continues here',
    'Adaptive immune system 89\nnext paragraph of the chapter',
    '90 Immunity\nmore content on this page',
    'Adaptive immune system 91\nfinal paragraph',
  ];
  assert.deepEqual(stripRunningHeaders(pages), [
    'the antibody binds the antigen', 'and the response continues here', 'next paragraph of the chapter', 'more content on this page', 'final paragraph',
  ]);
});

test('the chapter-number-glued variant from the real book is recognised too', () => {
  const pages = ['6Innate immune system 81\nfirst', '82 Immunity\nsecond', '6Innate immune system 83\nthird', '84 Immunity\nfourth'];
  assert.deepEqual(stripRunningHeaders(pages), ['first', 'second', 'third', 'fourth']);
});

test('a footer with a running page number is removed the same way', () => {
  const pages = [1, 2, 3, 4, 5].map((n) => `${body(n)}\nPagina ${n + 40}`);
  assert.deepEqual(stripRunningHeaders(pages), [1, 2, 3, 4, 5].map((n) => body(n)));
});

test('ordinary first lines, non-sequential numbers, long lines and short documents are never touched', () => {
  const prose = [1, 2, 3, 4, 5].map((n) => `Uma frase comum numero ${n}, que termina aqui.\ncontinua`);
  assert.deepEqual(stripRunningHeaders(prose), prose);

  const doses = ['3 mg por dia\nx', '7 dias de uso\nx', '12 semanas\nx', '5 ampolas\nx', '9 vezes\nx'];
  assert.deepEqual(stripRunningHeaders(doses), doses, 'numbers that do not advance are content, not page numbers');

  const long = [1, 2, 3, 4].map((n) => `${'palavra '.repeat(14)}${n + 10}\nresto`);
  assert.deepEqual(stripRunningHeaders(long), long, 'a long first line is prose, not a header');

  const short = ['Cabecalho 1\nx', 'Cabecalho 2\ny', 'Cabecalho 3\nz'];
  assert.deepEqual(stripRunningHeaders(short), short, 'three pages are not enough evidence');
});

test('a page that had only the header becomes empty text, not a page with the header as content', () => {
  const pages = ['Titulo 1\ntexto a', 'Titulo 2\ntexto b', 'Titulo 3', 'Titulo 4\ntexto d', 'Titulo 5\ntexto e'];
  assert.equal(stripRunningHeaders(pages)[2], '');
});

test('end to end: a PDF with a running header extracts without it, and a header-only page is reported as empty', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sl-headers-'));
  const db = openDb(join(dir, 'test.db'));
  try {
    runMigrations(db, fileURLToPath(new URL('../migrations', import.meta.url)));
    const now = new Date().toISOString();
    const userId = db.prepare(`INSERT INTO users (email, email_display, password_hash, password_salt, password_algorithm, password_params, created_at, updated_at) VALUES ('a@example.com', 'a@example.com', 'h', 's', 'scrypt', '{}', ?, ?)`).run(now, now).lastInsertRowid;
    const sourcesDir = join(dir, 'sources');
    const pages = ['Imunidade 10\nprimeira pagina real', 'Imunidade 11\nsegunda pagina real', 'Imunidade 12', 'Imunidade 13\nquarta pagina real', 'Imunidade 14\nquinta pagina real'];
    const source = sourceStorage.acceptUpload(db, userId, { buffer: buildFixturePdf(pages), originalName: 'a.pdf', contentType: 'application/pdf', sourcesDir, maxBytes: 25 * 1024 * 1024, quotaBytes: 200 * 1024 * 1024 });
    const result = await extractSource(db, userId, source.id, { sourcesDir });
    const rows = db.prepare('SELECT page_index, text, page_status FROM source_pages WHERE user_id = ? AND source_id = ? ORDER BY page_index').all(userId, source.id);
    assert.deepEqual(rows.map((r) => r.text), ['primeira pagina real', 'segunda pagina real', '', 'quarta pagina real', 'quinta pagina real']);
    assert.deepEqual(rows.map((r) => r.page_status), ['OK', 'OK', 'EMPTY', 'OK', 'OK']);
    assert.deepEqual(result.emptyPages, [3]);
  } finally { db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});

test('pages that are only one short numbered line are the content, not furniture (a header needs a body under it)', () => {
  const single = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
  assert.deepEqual(stripRunningHeaders(single), single);
});
