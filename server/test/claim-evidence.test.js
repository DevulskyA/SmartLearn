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
import { generateDraft as fakeGenerateDraft } from '../src/ai/fake-provider.js';
import { normalizeForMatch, validateSummaryEvidence, groundSummary } from '../src/ai/claim-evidence.js';
import { buildFixturePdf } from './pdf-fixtures/build-fixture-pdf.js';

// "Which passage of the approved source backs this sentence?" The model proposes; the server confirms the page is in scope, the quote
// really occurs in it, the claim is really in the summary NOW, and that the two talk about the same thing. No model, no stored verdict.

const SEGMENTS = [
  { pageIndex: 7, text: 'A taxa de filtração glomerular normal é de cerca de 125 mL/min em adultos jovens, e a filtração ocorre através da membrana basal glomerular.' },
  { pageIndex: 8, text: 'A membrana basal glo-\nmerular impede a passagem de proteínas plasmáticas porque possui cargas negativas fixas.' },
];
const SUMMARY = 'A taxa de filtração glomerular normal é de cerca de 125 mL/min. A membrana basal glomerular impede a passagem de proteínas plasmáticas. Esta frase não tem nenhum trecho que a sustente na fonte.';
const GOOD = { claim: 'A taxa de filtração glomerular normal é de cerca de 125 mL/min.', pageIndex: 7, quote: 'taxa de filtração glomerular normal é de cerca de 125 mL/min' };

test('normalization: case, accents, whitespace, a hyphen line break and ligatures never decide existence', () => {
  assert.equal(normalizeForMatch('MEMBRANA  Basal glo-\nmerular'), 'membrana basal glomerular');
  assert.equal(normalizeForMatch('ﬁltração — “dose”'), 'filtracao - "dose"');
});

test('a quote that really occurs in the page (even across a hyphenated line break) is accepted', () => {
  const spanning = { claim: 'A membrana basal glomerular impede a passagem de proteínas plasmáticas.', pageIndex: 8, quote: 'A membrana basal glomerular impede a passagem de proteínas plasmáticas' };
  const { kept, rejected } = validateSummaryEvidence([GOOD, spanning], { summary: SUMMARY, segments: SEGMENTS });
  assert.equal(kept.length, 2);
  assert.equal(rejected, 0);
});

test('an invented quote is rejected by the server', () => {
  const invented = { ...GOOD, quote: 'a taxa de filtração glomerular normal é de cerca de 180 mL/min' };
  const { kept, rejected } = validateSummaryEvidence([invented], { summary: SUMMARY, segments: SEGMENTS });
  assert.deepEqual([kept.length, rejected], [0, 1]);
});

test('a page outside the approved scope is rejected, even when the quote exists on a page that is in scope', () => {
  const { kept, rejected } = validateSummaryEvidence([{ ...GOOD, pageIndex: 99 }, { ...GOOD, pageIndex: 8 }], { summary: SUMMARY, segments: SEGMENTS });
  assert.deepEqual([kept.length, rejected], [0, 2]);
});

test('a claim that is not in the summary, a too-short quote and a malformed entry are rejected', () => {
  const { kept, rejected } = validateSummaryEvidence([
    { ...GOOD, claim: 'Uma frase que o resumo nunca disse.' },
    { ...GOOD, quote: 'filtração' },
    { claim: 'sem página', quote: 'taxa de filtração glomerular normal' },
    'texto solto',
  ], { summary: SUMMARY, segments: SEGMENTS });
  assert.deepEqual([kept.length, rejected], [0, 4]);
});

test('a real passage that does not talk about the claim is NOT grounding (valid page, wrong support)', () => {
  const unrelated = { claim: 'A membrana basal glomerular impede a passagem de proteínas plasmáticas.', pageIndex: 7, quote: 'taxa de filtração glomerular normal é de cerca de 125 mL/min' };
  const { kept } = validateSummaryEvidence([unrelated], { summary: SUMMARY, segments: SEGMENTS });
  assert.equal(kept.length, 0);
  // and a claim whose number is not in the quote
  const wrongNumber = { claim: 'A taxa de filtração glomerular normal é de cerca de 180 mL/min.', pageIndex: 7, quote: GOOD.quote };
  assert.equal(validateSummaryEvidence([wrongNumber], { summary: SUMMARY.replace('125', '180'), segments: SEGMENTS }).kept.length, 0);
});

test('grounding: a supported sentence is distinguishable from an unsupported one', () => {
  const g = groundSummary(SUMMARY, [GOOD], SEGMENTS);
  assert.deepEqual(g.sentences.map((s) => s.status), ['SOURCE_LINKED', 'NOT_LINKED', 'NOT_LINKED']);
  assert.equal(g.sentences[0].pageIndex, 7);
  assert.equal(g.supported, 1);
  assert.equal(g.unsupported, 2);
  assert.equal(g.orphaned, 0);
});

test('an edit that rewrites the sentence leaves the evidence orphaned, never looking valid', () => {
  const edited = SUMMARY.replace('125 mL/min', '120 mL/min');
  const g = groundSummary(edited, [GOOD], SEGMENTS);
  assert.equal(g.sentences[0].status, 'NOT_LINKED');
  assert.equal(g.orphaned, 1);
});

test('a changed source stops supporting: the quote is no longer in the page, so the sentence is unsupported again', () => {
  const changed = [{ pageIndex: 7, text: 'Texto novo da página sem aquele trecho.' }, SEGMENTS[1]];
  const g = groundSummary(SUMMARY, [GOOD], changed);
  assert.equal(g.sentences[0].status, 'NOT_LINKED');
  assert.equal(g.orphaned, 1);
});

// ---- through the real pipeline (test double provider, real source, real storage) ----------------------------------------------
const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const UPLOAD_DEFAULTS = { maxBytes: 25 * 1024 * 1024, quotaBytes: 200 * 1024 * 1024 };

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-evidence-'));
  const db = openDb(join(dir, 'test.db'));
  runMigrations(db, MIGRATIONS_DIR);
  return { db, sourcesDir: join(dir, 'sources'), cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}

test('pipeline: the model proposes three entries (real, invented, out-of-scope page); only the real one is stored and the draft shows what is supported', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const now = new Date().toISOString();
    const userId = db.prepare(`INSERT INTO users (email, email_display, password_hash, password_salt, password_algorithm, password_params, created_at, updated_at)
      VALUES ('e@example.com', 'e@example.com', 'h', 's', 'scrypt', '{}', ?, ?)`).run(now, now).lastInsertRowid;
    const source = sourceStorage.acceptUpload(db, userId, { buffer: buildFixturePdf(['A filtracao glomerular normal e de cerca de 125 mL por minuto nos adultos jovens saudaveis do estudo.']), originalName: 'a.pdf', contentType: 'application/pdf', sourcesDir, ...UPLOAD_DEFAULTS });
    await extractSource(db, userId, source.id, { sourcesDir });
    const [proposal] = proposals.chunkSource(db, userId, source.id, { maxPagesPerChunk: 10 });

    const realQuote = 'filtracao glomerular normal e de cerca de 125 mL por minuto';
    const provider = {
      name: 'FAKE', live: false,
      async generate(input) {
        const raw = await fakeGenerateDraft(input);
        const page = input.segments[0].pageIndex;
        return {
          ...raw,
          summary: 'A filtracao glomerular normal e de cerca de 125 mL por minuto. Esta segunda frase do resumo nao tem apoio na fonte.',
          summaryEvidence: [
            { claim: 'A filtracao glomerular normal e de cerca de 125 mL por minuto.', pageIndex: page, quote: realQuote },
            { claim: 'Esta segunda frase do resumo nao tem apoio na fonte.', pageIndex: page, quote: 'um trecho que o livro nunca teve em lugar nenhum' },
            { claim: 'A filtracao glomerular normal e de cerca de 125 mL por minuto.', pageIndex: page + 50, quote: realQuote },
          ],
        };
      },
    };
    const created = await drafts.createDraft(db, userId, proposal.id, { providerImpl: provider });
    assert.equal(created.summaryEvidence.length, 1);
    assert.equal(created.summaryGrounding.supported, 1);
    assert.equal(created.summaryGrounding.unsupported, 1);
    assert.deepEqual(created.summaryGrounding.sentences.map((s) => s.status), ['SOURCE_LINKED', 'NOT_LINKED']);

    // the reviewer rewrites the supported sentence: the stored entry no longer holds, and the draft says so
    const edited = drafts.reviseSummary(db, userId, created.id, { summary: 'A filtracao glomerular normal e de cerca de 130 mL por minuto. Esta segunda frase do resumo nao tem apoio na fonte.', expectedVersion: created.summaryVersion });
    assert.deepEqual(edited.summaryGrounding.sentences.map((s) => s.status), ['NOT_LINKED', 'NOT_LINKED']);
    assert.equal(edited.summaryGrounding.orphaned, 1);

    // restoring the sentence restores the support (nothing was lost, nothing is stored as a verdict)
    const restored = drafts.reviseSummary(db, userId, created.id, { summary: created.summary, expectedVersion: edited.summaryVersion });
    assert.equal(restored.summaryGrounding.supported, 1);
  } finally { cleanup(); }
});

test('the built-in test double carries real evidence, so the default pipeline shows a supported first sentence', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const now = new Date().toISOString();
    const userId = db.prepare(`INSERT INTO users (email, email_display, password_hash, password_salt, password_algorithm, password_params, created_at, updated_at)
      VALUES ('f@example.com', 'f@example.com', 'h', 's', 'scrypt', '{}', ?, ?)`).run(now, now).lastInsertRowid;
    const source = sourceStorage.acceptUpload(db, userId, { buffer: buildFixturePdf(['Fisiologia renal: a filtracao glomerular ocorre no corpusculo renal.']), originalName: 'b.pdf', contentType: 'application/pdf', sourcesDir, ...UPLOAD_DEFAULTS });
    await extractSource(db, userId, source.id, { sourcesDir });
    const [proposal] = proposals.chunkSource(db, userId, source.id, { maxPagesPerChunk: 10 });
    const created = await drafts.createDraft(db, userId, proposal.id, {});
    assert.ok(created.summaryEvidence.length >= 1);
    assert.ok(created.summaryGrounding.supported >= 1);
  } finally { cleanup(); }
});

test('a quote that backs only part of a sentence does not make its numbers look backed: PARTLY_LINKED', () => {
  const summary = 'A taxa de filtração glomerular normal é de cerca de 125 mL/min em adultos jovens, e corresponde a 180 L por dia.';
  const entry = { claim: 'A taxa de filtração glomerular normal é de cerca de 125 mL/min em adultos jovens', pageIndex: 7, quote: 'taxa de filtração glomerular normal é de cerca de 125 mL/min em adultos jovens' };
  const g = groundSummary(summary, [entry], SEGMENTS);
  assert.equal(g.sentences[0].status, 'PARTLY_LINKED');
  assert.deepEqual(g.sentences[0].valuesWithoutPassage, ['180']);
  assert.equal(g.supported, 0);
  // when the quote carries every value, the sentence is linked in full
  const whole = { claim: 'A taxa de filtração glomerular normal é de cerca de 125 mL/min', pageIndex: 7, quote: GOOD.quote };
  assert.equal(groundSummary(SUMMARY, [whole], SEGMENTS).sentences[0].status, 'SOURCE_LINKED');
});
