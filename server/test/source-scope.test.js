import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import * as proposals from '../src/services/content-proposals.js';
import * as drafts from '../src/services/generated-drafts.js';
import { assertPayloadWithinScope, segmentsForProposal, ScopeViolation } from '../src/services/proposal-scope.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));

// A miniature Costanzo: page 11 prints "Glomerular Filtration" FIRST and the tail of "Renal Blood Flow" LAST.
const PAGES = [
  [1, 'Copyright © 2020 Wolters Kluwer. All rights reserved. ISBN 978-1-9751-5001-3'],
  [2, 'Dedication\nTo my students.'],
  [10, 'RENAL BLOOD FLOW\nrbf regulation text\nautoregulation text'],
  [11, 'GLOMERULAR FILTRATION\ngfr intro text\nCharacteristics of the Barrier\nbarrier text\nMeasuring Renal Blood Flow\nrbf SAMPLE PROBLEM with PAH 600 mg%'],
  [12, 'barrier continues\nMeasurement of Glomerular Filtration Rate\ninulin text part one'],
  [13, 'inulin text part two\nFiltration Fraction\nff text\nReabsorption and Secretion\nreabsorption text'],
  [14, 'Challenge Yourself\n1. A question printed in the book'],
];
const OUTLINE = [
  [1, 'Copyright Page', 1], [1, 'Dedication', 2],
  [1, 'Renal Blood Flow', 10], [2, 'Measuring Renal Blood Flow', 11], [1, 'Glomerular Filtration', 11],
  [2, 'Characteristics of the Barrier', 11], [2, 'Measurement of Glomerular Filtration Rate', 12],
  [2, 'Filtration Fraction', 13], [1, 'Reabsorption and Secretion', 13], [1, 'Challenge Yourself', 14],
];

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-scope-'));
  const db = openDb(join(dir, 'test.db'));
  runMigrations(db, MIGRATIONS_DIR);
  const now = new Date().toISOString();
  const userId = db.prepare(`INSERT INTO users (email, email_display, password_hash, password_salt, password_algorithm, password_params, created_at, updated_at)
    VALUES ('s@example.com', 's@example.com', 'h', 's', 'scrypt', '{}', ?, ?)`).run(now, now).lastInsertRowid;
  const sourceId = db.prepare(`INSERT INTO sources (user_id, filename, original_name, content_type, byte_size, checksum, status, created_at, extraction_status, page_count)
    VALUES (?, 'f.pdf', 'Costanzo.pdf', 'application/pdf', 100, 'abc', 'EXTRACTED', ?, 'EXTRACTED', 14)`).run(userId, now).lastInsertRowid;
  const addPage = db.prepare("INSERT INTO source_pages (user_id, source_id, page_index, text, created_at, page_status) VALUES (?, ?, ?, ?, ?, 'OK')");
  for (const [index, text] of PAGES) addPage.run(userId, sourceId, index, text, now);
  const addOutline = db.prepare('INSERT INTO source_outline (user_id, source_id, ordinal, level, title, page_index) VALUES (?, ?, ?, ?, ?, ?)');
  OUTLINE.forEach(([level, title, page], ordinal) => addOutline.run(userId, sourceId, ordinal, level, title, page));
  return { db, userId, sourceId, cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}

test('FRONT MATTER: copyright, dedication and the book\'s own exercises are indexed but not generatable', () => {
  const { db, userId, sourceId, cleanup } = setup();
  try {
    const list = proposals.chunkSource(db, userId, sourceId, {});
    const byTitle = Object.fromEntries(list.map((p) => [p.title, p]));
    assert.equal(byTitle['Copyright Page'].generatable, false);
    assert.equal(byTitle['Dedication'].generatable, false);
    assert.equal(byTitle['Challenge Yourself'].generatable, false);
    assert.equal(byTitle['Glomerular Filtration'].generatable, true);
    assert.equal(byTitle['Copyright Page'].kind, 'COPYRIGHT');
  } finally { cleanup(); }
});

test('FRONT MATTER: a non-content proposal is refused before any provider is called', async () => {
  const { db, userId, sourceId, cleanup } = setup();
  try {
    const list = proposals.chunkSource(db, userId, sourceId, {});
    const copyright = list.find((p) => p.title === 'Copyright Page');
    await assert.rejects(() => drafts.createDraft(db, userId, copyright.id, {}), (e) => e.code === 'NOT_GENERATABLE');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM generated_drafts').get().n, 0);
  } finally { cleanup(); }
});

test('BOUNDARY: the Glomerular Filtration proposal carries none of the previous section\'s text, and the previous section keeps it', () => {
  const { db, userId, sourceId, cleanup } = setup();
  try {
    const list = proposals.chunkSource(db, userId, sourceId, {});
    const gfr = proposals.getProposal(db, userId, list.find((p) => p.title === 'Glomerular Filtration').id);
    assert.ok(gfr.excerpt.includes('gfr intro text'));
    assert.ok(gfr.excerpt.includes('ff text'), 'the section lost its last subsection on the next page');
    assert.ok(!gfr.excerpt.includes('SAMPLE PROBLEM'));
    assert.ok(!gfr.excerpt.includes('reabsorption text'));
    const rbf = proposals.getProposal(db, userId, list.find((p) => p.title === 'Renal Blood Flow').id);
    assert.ok(rbf.excerpt.includes('SAMPLE PROBLEM'));
  } finally { cleanup(); }
});

test('TOPIC: searching the subsection finds it with its exact source range; approving it yields a proposal limited to those spans', () => {
  const { db, userId, sourceId, cleanup } = setup();
  try {
    const [hit] = proposals.searchTopics(db, userId, sourceId, 'measurement of glomerular filtration rate');
    assert.equal(hit.title, 'Measurement of Glomerular Filtration Rate');
    assert.equal(hit.generatable, true);
    const approved = proposals.approveScope(db, userId, sourceId, { ordinal: hit.ordinal, topic: 'Measurement of Glomerular Filtration Rate' });
    assert.equal(approved.topic, 'Measurement of Glomerular Filtration Rate');
    assert.ok(approved.excerpt.startsWith('Measurement of Glomerular Filtration Rate'));
    assert.ok(!approved.excerpt.includes('barrier continues'));
    assert.ok(!approved.excerpt.includes('ff text'));
    // approving the same scope twice is the same proposal
    assert.equal(proposals.approveScope(db, userId, sourceId, { ordinal: hit.ordinal }).id, approved.id);
  } finally { cleanup(); }
});

test('TOPIC: an explicit range with offsets is honoured exactly and validated', () => {
  const { db, userId, sourceId, cleanup } = setup();
  try {
    const offset = PAGES.find(([i]) => i === 12)[1].indexOf('Measurement');
    const approved = proposals.approveScope(db, userId, sourceId, { range: { pageStart: 12, pageEnd: 13, startOffset: offset, endOffset: 20 }, title: 'Faixa manual' });
    assert.equal(approved.pageStart, 12);
    assert.equal(approved.pageEnd, 13);
    assert.ok(!approved.excerpt.includes('barrier continues'));
    assert.ok(approved.excerpt.includes('inulin text part one'));
    assert.equal(approved.chars, PAGES.find(([i]) => i === 12)[1].length - offset + 20);
    assert.throws(() => proposals.approveScope(db, userId, sourceId, { range: { pageStart: 12, pageEnd: 11 } }), (e) => e.code === 'VALIDATION_FAILED');
    assert.throws(() => proposals.approveScope(db, userId, sourceId, { range: { pageStart: 12, pageEnd: 13, startOffset: 99999 } }), (e) => e.code === 'VALIDATION_FAILED');
  } finally { cleanup(); }
});

test('PAYLOAD INVARIANT: inside the approved scope passes; a page outside, altered text or an inflated payload aborts', () => {
  const { db, userId, sourceId, cleanup } = setup();
  try {
    const startOffset = PAGES.find(([i]) => i === 12)[1].indexOf('Measurement');
    const approved = proposals.approveScope(db, userId, sourceId, { range: { pageStart: 12, pageEnd: 13, startOffset } });
    const row = db.prepare('SELECT * FROM content_proposals WHERE id = ?').get(approved.id);
    const good = segmentsForProposal(db, userId, row);
    const ok = assertPayloadWithinScope(db, userId, row, good);
    assert.equal(ok.payloadChars, ok.sourceChars);
    assert.deepEqual(ok.pages, [12, 13]);

    const outside = [...good, { pageIndex: 14, text: 'Challenge Yourself\n1. A question printed in the book' }];
    assert.throws(() => assertPayloadWithinScope(db, userId, row, outside), (e) => e instanceof ScopeViolation);

    const altered = good.map((s, i) => (i === 0 ? { ...s, text: `${s.text}\nEXTRA TEXT THE STUDENT NEVER APPROVED` } : s));
    assert.throws(() => assertPayloadWithinScope(db, userId, row, altered), (e) => e.code === 'SCOPE_VIOLATION');

    // same size, different content: only an exact comparison with the approved text can see this
    const swapped = good.map((seg, i) => (i === 0 ? { ...seg, text: 'x'.repeat(seg.text.length) } : seg));
    assert.throws(() => assertPayloadWithinScope(db, userId, row, swapped), (e) => e.code === 'SCOPE_VIOLATION' && /difere do trecho aprovado/.test(e.message));
    assert.throws(() => assertPayloadWithinScope(db, userId, row, outside), (e) => /fora do trecho aprovado/.test(e.message));

    const wholeBookPage = [{ pageIndex: 12, text: PAGES.find(([i]) => i === 12)[1] }, good[1]];
    assert.throws(() => assertPayloadWithinScope(db, userId, row, wholeBookPage), (e) => e.code === 'SCOPE_VIOLATION', 'a whole page where only part was approved');
  } finally { cleanup(); }
});

test('PAYLOAD: a generated draft records the approved scope and the payload size (provable, equal to the approved source)', async () => {
  const { db, userId, sourceId, cleanup } = setup();
  try {
    const [hit] = proposals.searchTopics(db, userId, sourceId, 'measurement of glomerular filtration rate');
    const approved = proposals.approveScope(db, userId, sourceId, { ordinal: hit.ordinal, topic: 'Measurement of Glomerular Filtration Rate' });
    const draft = await drafts.createDraft(db, userId, approved.id, {});
    assert.equal(draft.sourceScope.documentId, sourceId);
    assert.equal(draft.sourceScope.documentName, 'Costanzo.pdf');
    assert.equal(draft.sourceScope.topic, 'Measurement of Glomerular Filtration Rate');
    assert.equal(draft.sourceScope.payloadChars, approved.chars);
    assert.equal(draft.sourceScope.sourceChars, approved.chars);
    assert.deepEqual(draft.sourceScope.payloadPages, [12, 13]);
  } finally { cleanup(); }
});

test('LEGACY: an old proposal (no spans) that is a copyright page is still not generatable', async () => {
  const { db, userId, sourceId, cleanup } = setup();
  try {
    const now = new Date().toISOString();
    const id = db.prepare(`INSERT INTO content_proposals (user_id, source_id, chunk_index, page_start, page_end, title, created_at, updated_at)
      VALUES (?, ?, 0, 1, 1, 'Copyright Page', ?, ?)`).run(userId, sourceId, now, now).lastInsertRowid;
    const [row] = proposals.listProposals(db, userId, sourceId).filter((p) => p.id === Number(id));
    assert.equal(row.kind, 'COPYRIGHT');
    assert.equal(row.generatable, false);
    await assert.rejects(() => drafts.createDraft(db, userId, Number(id), {}), (e) => e.code === 'NOT_GENERATABLE');
  } finally { cleanup(); }
});
