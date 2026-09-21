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
import { pageTextFromItems } from '../src/pdf/page-text.js';
import { buildFixturePdf } from './pdf-fixtures/build-fixture-pdf.js';

// SPRINT 05a (EXTRACTION TEXT FIDELITY). Found on a real medical textbook page (Kumar & Clark, 11th ed.): pdf.js
// reports each line as one item followed by an empty item with hasEOL=true. Joining `str` with '' glued the last
// word of every line to the first word of the next ("belongsto", "rise toantibodies", "Box6.8"), corrupting the
// text that feeds the model, the audit and the frozen citation snapshots.

test('a line end is a line break: words are never glued across it (shape taken from a real textbook page)', () => {
  const items = [
    { str: '6', hasEOL: false }, { str: 'Adaptive immune system', hasEOL: false }, { str: ' ', hasEOL: false }, { str: '87', hasEOL: false }, { str: '', hasEOL: true },
    { str: 'the heavy chain dictates the function of the antibody and belongs', hasEOL: false }, { str: '', hasEOL: true },
    { str: 'to', hasEOL: false }, { str: ' ', hasEOL: false }, { str: 'one of the classes of M, G1–4, A1–2, D, and E, giving rise to', hasEOL: false }, { str: '', hasEOL: true },
    { str: 'antibodies called IgM, IgG1–4, respectively.', hasEOL: false }, { str: '', hasEOL: true },
  ];
  const text = pageTextFromItems(items);
  assert.equal(text, '6Adaptive immune system 87\nthe heavy chain dictates the function of the antibody and belongs\nto one of the classes of M, G1–4, A1–2, D, and E, giving rise to\nantibodies called IgM, IgG1–4, respectively.');
  assert.ok(!/belongsto|rise toantibodies/.test(text));
});

test('spaces items inside a line are kept, trailing blanks before a break are dropped, and an item-less page is empty', () => {
  assert.equal(pageTextFromItems([{ str: 'a', hasEOL: false }, { str: ' ', hasEOL: false }, { str: 'b ', hasEOL: false }, { str: '', hasEOL: true }, { str: 'c', hasEOL: false }]), 'a b\nc');
  assert.equal(pageTextFromItems([]), '');
  assert.equal(pageTextFromItems([{ str: '', hasEOL: true }]).trim(), '');
});

test('end to end: a two-sentence PDF page extracts as two lines, and the frozen page text keeps them apart', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sl-textfidelity-'));
  const db = openDb(join(dir, 'test.db'));
  try {
    runMigrations(db, fileURLToPath(new URL('../migrations', import.meta.url)));
    const now = new Date().toISOString();
    const userId = db.prepare(`INSERT INTO users (email, email_display, password_hash, password_salt, password_algorithm, password_params, created_at, updated_at) VALUES ('a@example.com', 'a@example.com', 'h', 's', 'scrypt', '{}', ?, ?)`).run(now, now).lastInsertRowid;
    const sourcesDir = join(dir, 'sources');
    const source = sourceStorage.acceptUpload(db, userId, { buffer: buildFixturePdf(['o anticorpo pertence a classe IgG.\nA classe IgM tambem']), originalName: 'a.pdf', contentType: 'application/pdf', sourcesDir, maxBytes: 25 * 1024 * 1024, quotaBytes: 200 * 1024 * 1024 });
    const result = await extractSource(db, userId, source.id, { sourcesDir });
    assert.equal(result.status, 'EXTRACTED');
    const page = db.prepare('SELECT text FROM source_pages WHERE user_id = ? AND source_id = ? AND page_index = 1').get(userId, source.id);
    assert.equal(page.text, 'o anticorpo pertence a classe IgG.\nA classe IgM tambem');
  } finally { db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});
