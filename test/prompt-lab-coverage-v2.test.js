import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { coverageOf, formulationsOf, validateTiers, TIERS } from '../scripts/prompt-lab/coverage.mjs';

// Methodology v2 (Constitution I.18): the summary is judged on the ESSENTIAL concepts, not on the whole map; each ESSENTIAL concept
// owes at least two question formulations of different types. These tests pin that arithmetic on a tiny synthetic map.
const MAP = {
  concepts: [
    { id: 'A', tier: 'ESSENTIAL', label: 'a', anyOf: [['alfa', 'beta']] },
    { id: 'B', tier: 'ESSENTIAL', label: 'b', anyOf: [['gama'], ['delta']] },
    { id: 'C', tier: 'RELEVANT', label: 'c', anyOf: [['epsilon']] },
    { id: 'D', tier: 'PERIPHERAL', label: 'd', anyOf: [['zeta']] },
  ],
};

test('essential coverage counts only ESSENTIAL concepts; a missing PERIPHERAL does not lower it', () => {
  const r = coverageOf('Alfa e beta. Delta. Epsilon.', MAP);
  assert.equal(r.covered, 3);
  assert.equal(r.total, 4);
  assert.equal(r.essentialCovered, 2);
  assert.equal(r.essentialTotal, 2);
  assert.deepEqual(r.essentialMissing, []);
  assert.deepEqual(r.byTier.PERIPHERAL, { covered: 0, total: 1 });
  assert.deepEqual(r.byTier.RELEVANT, { covered: 1, total: 1 });
});

test('a missing ESSENTIAL concept is reported by id even when everything else is covered', () => {
  const r = coverageOf('Alfa sozinho. Epsilon. Zeta.', MAP); // A needs alfa AND beta; B absent
  assert.equal(r.essentialCovered, 0);
  assert.deepEqual(r.essentialMissing.map((m) => m.id), ['A', 'B']);
  assert.equal(r.covered, 2);
});

test('matching ignores case and accents, as before (backward compatible for maps without tiers)', () => {
  const legacy = { concepts: [{ id: 'X', label: 'x', anyOf: [['hematócrito', 'rpf']] }] };
  const r = coverageOf('O HEMATOCRITO entra no RPF.', legacy);
  assert.equal(r.covered, 1);
  assert.equal(r.essentialTotal, 0);
  assert.equal(r.rows[0].tier, null);
});

test('formulations: distinct question types count, a repeated type is a rephrasing and does not', () => {
  const qs = [
    { question: 'O que é alfa?', answer: 'Beta explica.', questionType: 'RECALL' },
    { question: 'Por que alfa e beta?', answer: 'Porque sim.', questionType: 'RECALL' }, // same type: not a new formulation
    { question: 'Gama no caso clínico?', answer: 'x', questionType: 'CLINICAL_REASONING' },
    { question: 'Delta no mecanismo?', answer: 'x', questionType: 'MECHANISM' },
  ];
  const f = formulationsOf(qs, MAP);
  const byId = Object.fromEntries(f.rows.map((r) => [r.id, r]));
  assert.deepEqual(byId.A.types, ['RECALL']);
  assert.equal(byId.A.questions, 2);
  assert.deepEqual(byId.B.types, ['CLINICAL_REASONING', 'MECHANISM']);
  assert.equal(f.essentialTotal, 2);
  assert.equal(f.essentialWithEnough, 1);
  assert.deepEqual(f.essentialShort.map((s) => s.id), ['A']);
});

test('formulations read question+answer only; the explanation naming a concept does not count as a question about it', () => {
  const qs = [{ question: 'Qual a pressão?', answer: '45', explanation: 'Alfa e beta explicam.', questionType: 'RECALL' }];
  const f = formulationsOf(qs, MAP);
  assert.equal(f.rows.find((r) => r.id === 'A').questions, 0);
});

test('questions match on questionAnyOf (one distinctive term) while the summary keeps the stricter anyOf', () => {
  const map = { concepts: [{ id: 'P', tier: 'ESSENTIAL', label: 'p', anyOf: [['prostaglandina', 'nsaid']], questionAnyOf: [['prostaglandina'], ['aine']] }] };
  const qs = [
    { question: 'Por que os AINEs pioram o fluxo renal?', answer: 'Inibem a síntese.', questionType: 'MECHANISM' },
    { question: 'Qual o papel da prostaglandina?', answer: 'Dilata a aferente.', questionType: 'RECALL' },
  ];
  assert.deepEqual(formulationsOf(qs, map).rows[0].types, ['MECHANISM', 'RECALL']);
  assert.equal(coverageOf('Prostaglandina protege o fluxo.', map).covered, 0, 'the summary still needs both words');
});

test('minFormulations is configurable and an empty draft leaves every essential short', () => {
  assert.equal(formulationsOf([], MAP).essentialShort.length, 2);
  const qs = [{ question: 'Alfa beta?', answer: 'x', questionType: 'RECALL' }];
  assert.equal(formulationsOf(qs, MAP, 1).essentialShort.map((s) => s.id).join(), 'B');
});

test('validateTiers rejects missing or unknown tiers, duplicated ids, and a map with no ESSENTIAL concept', () => {
  assert.deepEqual(validateTiers(MAP), []);
  const bad = { concepts: [{ id: 'A', anyOf: [['x']] }, { id: 'A', tier: 'ESSENCIAL', anyOf: [['x']] }] };
  const problems = validateTiers(bad);
  assert.ok(problems.some((p) => p.includes('duplicated id')));
  assert.ok(problems.some((p) => p.includes('A: tier must be one of')));
  assert.ok(problems.some((p) => p.includes('no ESSENTIAL concept')));
});

test('the shipped Renal Blood Flow map is valid methodology v2 and its tiers are explicitly marked as awaiting medical review', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const map = JSON.parse(readFileSync(join(root, '.specs', 'features', 'prompt-lab', 'source-maps', 'renal-blood-flow.json'), 'utf8'));
  assert.deepEqual(validateTiers(map), []);
  assert.equal(map.concepts.length, 19);
  assert.equal(map.tierStatus, 'PROPOSED_BY_AI_PENDING_MEDICAL_REVIEW');
  for (const t of TIERS) assert.ok(map.concepts.some((c) => c.tier === t), `tier ${t} is used`);
});
