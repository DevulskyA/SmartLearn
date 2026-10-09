import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPriorities, PRIORITIES_POLICY_VERSION, RECENT_WINDOW_DAYS, MIN_SAMPLE_QUESTIONS, WEAK_BELOW_PCT,
} from '../src/domain/priorities.js';
import { THRESHOLDS } from '../../src/performance-thresholds.js';

const TODAY = '2026-09-19';

const units = [
  { id: 1, title: 'Anatomia', subjectId: 10, subjectName: 'Anatomia' },
  { id: 2, title: 'Fisiologia', subjectId: 11, subjectName: 'Fisiologia' },
  { id: 3, title: 'Farmaco', subjectId: 12, subjectName: 'Farmaco' },
  { id: 4, title: 'Patologia', subjectId: 13, subjectName: 'Patologia' },
];
const review = (id, unitId, dueDate, completedAt = null) => ({ id, unitId, dueDate, completedAt });
const ev = (unitId, evidenceDate, questionsCount, correctCount, type = 'REVIEW') => ({ unitId, evidenceDate, type, questionsCount, correctCount });
const run = (input, opts) => buildPriorities({ today: TODAY, units, reviews: [], evidence: [], reinforcementByUnit: {}, ...input }, opts);

test('policy constants are pinned and the weak threshold matches the client ADEQUATE band (no silent drift)', () => {
  assert.equal(PRIORITIES_POLICY_VERSION, 1);
  assert.equal(RECENT_WINDOW_DAYS, 30);
  assert.equal(MIN_SAMPLE_QUESTIONS, 10);
  assert.equal(WEAK_BELOW_PCT, THRESHOLDS.ADEQUATE);
});

test('invalid or missing today throws instead of silently reading the clock', () => {
  assert.throws(() => buildPriorities({ units, reviews: [], evidence: [] }), TypeError);
  assert.throws(() => buildPriorities({ today: 'ontem', units, reviews: [], evidence: [] }), TypeError);
});

test('empty input is a safe boundary', () => {
  const r = run({});
  assert.deepEqual(r.due, []);
  assert.deepEqual(r.weakPractice, []);
  assert.equal(r.asOf, TODAY);
});

test('due work: overdue before due-today, oldest first, ties by id; completed and future reviews are excluded', () => {
  const r = run({
    reviews: [
      review(5, 1, TODAY),
      review(4, 2, '2026-09-10'),
      review(3, 3, '2026-09-10'),
      review(2, 4, '2026-09-15'),
      review(6, 1, '2026-09-20'),                              // future: not due
      review(7, 2, '2026-09-01', '2026-09-02T10:00:00.000Z'),  // completed: not due
    ],
  });
  assert.deepEqual(r.due.map((d) => d.reviewTaskId), [3, 4, 2, 5]);
  assert.deepEqual(r.due.map((d) => d.kind), ['OVERDUE', 'OVERDUE', 'OVERDUE', 'DUE_TODAY']);
  assert.equal(r.due[0].daysOverdue, 9);
  assert.equal(r.due[3].daysOverdue, 0);
  assert.ok(r.due.every((d) => d.reasonCodes.includes(d.kind)));
  assert.equal(r.due[0].unitTitle, 'Farmaco');
});

test('absent evidence is never a zero: no rows at all vs none in the window are distinct states with null accuracy', () => {
  const none = run({ reviews: [review(1, 1, TODAY)] });
  assert.equal(none.due[0].evidence.status, 'NONE');
  assert.equal(none.due[0].evidence.accuracyPct, null);
  assert.equal(none.due[0].evidence.questions, 0);
  assert.ok(none.due[0].reasonCodes.includes('NO_EVIDENCE_YET'));

  const old = run({ reviews: [review(1, 1, TODAY)], evidence: [ev(1, '2026-06-01', 20, 5)] });
  assert.equal(old.due[0].evidence.status, 'NONE_IN_WINDOW');
  assert.equal(old.due[0].evidence.accuracyPct, null);
  assert.ok(old.due[0].reasonCodes.includes('NO_RECENT_EVIDENCE'));
  assert.ok(!old.due[0].reasonCodes.includes('LOW_RECENT_ACCURACY'));
});

test('sample sizes are exact: window is the last 30 local days inclusive; older and future-dated evidence are excluded', () => {
  const r = run({
    reviews: [review(1, 1, TODAY)],
    evidence: [
      ev(1, '2026-08-21', 10, 8),   // today-29 -> inside (boundary)
      ev(1, '2026-08-20', 40, 0),   // today-30 -> outside
      ev(1, TODAY, 10, 6),          // today -> inside
      ev(1, '2026-09-25', 30, 0),   // future-dated -> outside
    ],
  });
  const e = r.due[0].evidence;
  assert.equal(e.questions, 20);
  assert.equal(e.correct, 14);
  assert.equal(e.accuracyPct, 70);
  assert.equal(e.from, '2026-08-21');
  assert.equal(e.to, TODAY);
  assert.equal(e.windowDays, 30);
});

test('accuracy is volume-weighted, never a mean of percentages (10q@100% + 90q@60% = 64%, weak; naive mean would be 80%)', () => {
  const r = run({ evidence: [ev(1, '2026-09-18', 10, 10), ev(1, '2026-09-17', 90, 54)] });
  assert.equal(r.weakPractice.length, 1);
  assert.equal(r.weakPractice[0].unitId, 1);
  assert.equal(r.weakPractice[0].evidence.accuracyPct, 64);
  assert.deepEqual(r.weakPractice[0].reasonCodes, ['LOW_RECENT_ACCURACY']);
});

test('a tiny bad sample never makes a unit weak (0/5 is INSUFFICIENT, not a verdict)', () => {
  const r = run({ evidence: [ev(1, '2026-09-18', 5, 0)] });
  assert.deepEqual(r.weakPractice, []);
  const withDue = run({ reviews: [review(1, 1, TODAY)], evidence: [ev(1, '2026-09-18', 5, 0)] });
  assert.equal(withDue.due[0].evidence.status, 'INSUFFICIENT');
  assert.ok(withDue.due[0].reasonCodes.includes('INSUFFICIENT_SAMPLE'));
  assert.ok(!withDue.due[0].reasonCodes.includes('LOW_RECENT_ACCURACY'));
});

test('a strong unit is not suggested, and 65% exactly is not weak (strictly below the band)', () => {
  const r = run({ evidence: [ev(1, '2026-09-18', 20, 18), ev(2, '2026-09-18', 20, 13)] });
  assert.deepEqual(r.weakPractice, []);
});

test('units already due are explained inside due and never repeated in weakPractice', () => {
  const r = run({ reviews: [review(1, 1, TODAY)], evidence: [ev(1, '2026-09-18', 20, 6), ev(2, '2026-09-18', 20, 6)] });
  assert.deepEqual(r.due.map((d) => d.unitId), [1]);
  assert.ok(r.due[0].reasonCodes.includes('LOW_RECENT_ACCURACY'));
  assert.deepEqual(r.weakPractice.map((w) => w.unitId), [2]);
});

test('reinforcement (attempt ledger) is its own signal: it surfaces the unit but never alters the aggregate sample (no double count)', () => {
  const base = run({ evidence: [ev(2, '2026-09-18', 20, 19)] });
  const withLedger = run({ evidence: [ev(2, '2026-09-18', 20, 19)], reinforcementByUnit: { 2: [7, 8, 9] } });
  assert.deepEqual(base.weakPractice, []);
  assert.equal(withLedger.weakPractice.length, 1);
  assert.deepEqual(withLedger.weakPractice[0].reasonCodes, ['ITEMS_TO_REINFORCE']);
  assert.equal(withLedger.weakPractice[0].reinforceCount, 3);
  assert.equal(withLedger.weakPractice[0].evidence.questions, 20);
  assert.equal(withLedger.weakPractice[0].evidence.correct, 19);
});

test('a unit with only ledger errors and no evidence is suggested without an invented accuracy', () => {
  const r = run({ reinforcementByUnit: { 3: [1] } });
  assert.equal(r.weakPractice.length, 1);
  assert.equal(r.weakPractice[0].evidence.status, 'NONE');
  assert.equal(r.weakPractice[0].evidence.accuracyPct, null);
});

test('weak ordering: lowest accuracy first, then more items to reinforce, then unit id; missing accuracy last', () => {
  const r = run({
    evidence: [ev(1, '2026-09-18', 20, 10), ev(2, '2026-09-18', 20, 10), ev(3, '2026-09-18', 20, 4)],
    reinforcementByUnit: { 2: [1, 2], 4: [9] },
  });
  assert.deepEqual(r.weakPractice.map((w) => w.unitId), [3, 2, 1, 4]);
});

test('weakPractice is capped, and the cap keeps the highest-priority ones', () => {
  const manyUnits = Array.from({ length: 8 }, (_, i) => ({ id: 100 + i, title: `U${i}`, subjectId: 1, subjectName: 'S' }));
  const evidence = manyUnits.map((u, i) => ev(u.id, '2026-09-18', 20, i)); // accuracy rises with i
  const r = buildPriorities({ today: TODAY, units: manyUnits, reviews: [], evidence, reinforcementByUnit: {} });
  assert.equal(r.weakPractice.length, 5);
  assert.deepEqual(r.weakPractice.map((w) => w.unitId), [100, 101, 102, 103, 104]);
});

test('source breakdown keeps self-reported/external evidence distinguishable while the weighted total still counts it once', () => {
  const r = run({ evidence: [ev(1, '2026-09-18', 10, 5, 'EXTERNAL'), ev(1, '2026-09-18', 10, 5, 'INITIAL_PRACTICE')] });
  const e = r.weakPractice[0].evidence;
  assert.equal(e.questions, 20);
  assert.deepEqual(e.bySource, {
    EXTERNAL: { questions: 10, correct: 5 },
    INITIAL_PRACTICE: { questions: 10, correct: 5 },
  });
});

test('pure and order-independent: input is not mutated and shuffling inputs yields the identical result', () => {
  const input = {
    reviews: [review(3, 2, '2026-09-10'), review(1, 1, TODAY), review(2, 3, '2026-09-10')],
    evidence: [ev(1, '2026-09-18', 20, 6), ev(4, '2026-09-17', 20, 5), ev(4, '2026-09-18', 10, 2)],
    reinforcementByUnit: { 4: [1, 2] },
  };
  const snapshot = JSON.stringify(input);
  const a = run(input);
  assert.equal(JSON.stringify(input), snapshot);
  const b = run({
    reviews: [...input.reviews].reverse(),
    evidence: [...input.evidence].reverse(),
    reinforcementByUnit: input.reinforcementByUnit,
  });
  assert.deepEqual(a, b);
});
