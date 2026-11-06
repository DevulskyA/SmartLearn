import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditRisk, quantitiesIn } from '../src/ai/risk-checks.js';

// Robustness of the deterministic sensors: they run on EVERY draft, so they must never throw on odd model output, must stay fast on
// hostile text, and must catch a unit swap in every dimension the table knows. Fixtures are synthetic (no book text).
// risk-checks.test.js covers the behaviour on realistic sentences; this file covers the edges.

const seg = (text, pageIndex = 1) => ({ pageIndex, text });
const unitIssues = (draft, source) => auditRisk(draft, { segments: [seg(source)] }).filter((f) => f.issue === 'UNIT_MISMATCH');

test('thin or odd drafts and sources never throw (draft-schema.js already guarantees question items are objects, so those are the edge)', () => {
  const sources = [[], [seg('')], [seg('A dose is 5 mg.')], [{ pageIndex: 1, text: '' }]];
  const drafts = [
    {},
    { summary: undefined, questions: undefined },
    { summary: null, questions: null },
    { summary: '', questions: [] },
    { summary: 'Dose de 5 mg.', questions: [{}, { question: 'Q?', answer: 42 }, { question: 'Q?', answer: 'A', explanation: null }] },
    { summary: 12345, questions: [] },
  ];
  for (const segments of sources) {
    for (const draft of drafts) {
      assert.doesNotThrow(() => auditRisk(draft, { segments }), `draft ${JSON.stringify(draft)}`);
    }
  }
  assert.deepEqual(auditRisk({ summary: 'Dose de 5 g.', questions: [] }, { segments: [] }), []);
});

test('UNIT_MISMATCH is caught in every dimension the table knows (source unit -> wrong unit of the same dimension)', () => {
  const swaps = [
    ['5 mg', '5 g', 'mass'],
    ['5 mg', '5 µg', 'mass'],
    ['5 g', '5 kg', 'mass'],
    ['250 mL', '250 L', 'volume'],
    ['2 L', '2 dL', 'volume'],
    ['16 mm Hg', '16 kPa', 'pressure'],
    ['30 min', '30 h', 'time'],
    ['70 nm', '70 µm', 'length'],
    ['4 mmol', '4 mol', 'amount'],
  ];
  for (const [sourceQty, draftQty, dimension] of swaps) {
    const found = unitIssues({ summary: `O valor foi de ${draftQty} no estudo.`, questions: [] }, `The reported value was ${sourceQty} in the study.`);
    assert.equal(found.length, 1, `${sourceQty} -> ${draftQty} (${dimension}) must be flagged`);
    assert.equal(found[0].severity, 'HIGH');
  }
});

test('the right unit, a spelled-out synonym, and a decimal comma are NOT flagged; a decimal comma with the wrong unit is', () => {
  const source = 'The dose was 0.5 mg given once.';
  assert.deepEqual(unitIssues({ summary: 'A dose foi de 0,5 mg.', questions: [] }, source), []);
  assert.deepEqual(unitIssues({ summary: 'A dose foi de 0,5 miligramas.', questions: [] }, source), []);
  assert.equal(unitIssues({ summary: 'A dose foi de 0,5 g.', questions: [] }, source).length, 1);
});

test('rates are one unit: mL/min vs mL/h is a mismatch, mL/min vs mg is a different dimension and is not judged', () => {
  const source = 'The flow was 125 mL/min in the control group.';
  assert.equal(unitIssues({ summary: 'O fluxo foi de 125 mL/h.', questions: [] }, source).length, 1);
  assert.deepEqual(unitIssues({ summary: 'A dose foi de 125 mg.', questions: [] }, source), []);
});

test('a range reports both ends, and each end is checked', () => {
  const found = quantitiesIn('pores de 70–100 nm');
  assert.deepEqual(found.map((q) => q.value), ['70', '100']);
  assert.equal(unitIssues({ summary: 'Poros de 70–100 µm.', questions: [] }, 'The pores measure 70–100 nm.').length, 2);
});

test('hostile text stays fast: a long run of digits, slashes and unit-like words is scanned in well under a second', () => {
  const hostile = `${'1/'.repeat(20000)} ${'mg '.repeat(20000)} ${'9'.repeat(50000)} ${'a/'.repeat(20000)}`;
  const started = performance.now();
  const q = quantitiesIn(hostile);
  const draft = { summary: hostile, questions: [{ question: hostile, answer: hostile, explanation: hostile }] };
  assert.doesNotThrow(() => auditRisk(draft, { segments: [seg(hostile)] }));
  const ms = performance.now() - started;
  assert.ok(Array.isArray(q));
  assert.ok(ms < 3000, `hostile input took ${Math.round(ms)} ms`);
});

test('unknown language: only the unit check runs, so a lost qualifier is silent but a unit swap is still HIGH', () => {
  const source = seg('Xyzzy plugh 5 mg qwerty asdf zxcv wxyz. Only here.');
  const draft = { summary: 'Qwxz plugh 5 g asdf. Here.', questions: [] };
  const found = auditRisk(draft, { segments: [source] });
  assert.deepEqual(found.map((f) => f.issue), ['UNIT_MISMATCH']);
});
