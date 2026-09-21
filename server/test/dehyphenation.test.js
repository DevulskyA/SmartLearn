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
import { dehyphenatePages } from '../src/pdf/page-text.js';
import { buildFixturePdf } from './pdf-fixtures/build-fixture-pdf.js';

// SPRINT 05c (EXTRACTION TEXT FIDELITY, part 2). Found running a real textbook chapter (Kumar & Clark, ch. 6
// Immunity, 28 pages): 302 words were left split at the line end ("gen-\nerated", "anti-\nbodies", "allow-\ning"),
// which breaks medical terms for the model, for the audit's term matching and for the excerpt the student reads.
// A word broken by typesetting is rejoined; a real hyphenated compound is not destroyed. The document itself is
// the evidence: the same word (or compound) appearing unbroken elsewhere decides.

test('a soft-hyphenated word is rejoined into one word, the line break disappears', () => {
  assert.deepEqual(dehyphenatePages(['the gene rearranges to give rise to anti-\nbodies called IgM.']), ['the gene rearranges to give rise to antibodies called IgM.']);
  assert.deepEqual(dehyphenatePages(['potentially allow-\ning antibodies with higher affinity']), ['potentially allowing antibodies with higher affinity']);
});

test('with no evidence either way the break is typesetting, so the word is rejoined', () => {
  assert.deepEqual(dehyphenatePages(['the response was gen-\nerated in the spleen']), ['the response was generated in the spleen']);
});

test('the rest of the document decides: a compound written with its hyphen elsewhere keeps it', () => {
  const out = dehyphenatePages(['a non-\nspecific response follows', 'the non-specific response is fast']);
  assert.equal(out[0], 'a non-specific response follows', 'hyphen kept, only the line break removed');
});

test('a word that appears unbroken elsewhere is rejoined even when a compound form is imaginable', () => {
  const out = dehyphenatePages(['produce anti-\nbodies here', 'the antibodies bind the antigen']);
  assert.equal(out[0], 'produce antibodies here');
});

test('evidence crosses pages: the break on one page is resolved by the word on another', () => {
  const out = dehyphenatePages(['immuno-\ndeficiency states', 'primary immunodeficiency is rare']);
  assert.equal(out[0], 'immunodeficiency states');
});

test('only lowercase letter + hyphen + lowercase letter at a line end is touched: abbreviations, numbers, capitals and spaced dashes are left alone', () => {
  for (const text of ['the T-\ncell receptor', 'PD-\n1 and PD-L1', 'in mid-\nSeptember', 'a range 5 -\n7 mg', 'value 10-\n20', 'end -\nstart']) {
    assert.deepEqual(dehyphenatePages([text]), [text]);
  }
});

test('ordinary line breaks and pages without any break are returned unchanged', () => {
  const text = 'first line\nsecond line\n\nthird';
  assert.deepEqual(dehyphenatePages([text, '', 'plain']), [text, '', 'plain']);
  assert.deepEqual(dehyphenatePages([]), []);
});

test('end to end: a PDF whose word is split across two lines extracts as one word', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sl-dehyph-'));
  const db = openDb(join(dir, 'test.db'));
  try {
    runMigrations(db, fileURLToPath(new URL('../migrations', import.meta.url)));
    const now = new Date().toISOString();
    const userId = db.prepare(`INSERT INTO users (email, email_display, password_hash, password_salt, password_algorithm, password_params, created_at, updated_at) VALUES ('a@example.com', 'a@example.com', 'h', 's', 'scrypt', '{}', ?, ?)`).run(now, now).lastInsertRowid;
    const sourcesDir = join(dir, 'sources');
    const source = sourceStorage.acceptUpload(db, userId, { buffer: buildFixturePdf(['a proteina liga os anti-\ncorpos ao antigeno']), originalName: 'a.pdf', contentType: 'application/pdf', sourcesDir, maxBytes: 25 * 1024 * 1024, quotaBytes: 200 * 1024 * 1024 });
    await extractSource(db, userId, source.id, { sourcesDir });
    const page = db.prepare('SELECT text FROM source_pages WHERE user_id = ? AND source_id = ? AND page_index = 1').get(userId, source.id);
    assert.equal(page.text, 'a proteina liga os anticorpos ao antigeno');
  } finally { db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});
