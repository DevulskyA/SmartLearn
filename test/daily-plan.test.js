// HG-14 prototype: invariants of the daily plan that must hold whatever weights are finally approved.
import test from 'node:test';
import assert from 'node:assert/strict';
import { planDay, scoreItem } from '../shared/daily-plan.js';

const TODAY = '2026-10-20';
const item = (id, minutes, extra = {}) => ({ id, minutes, dueDate: null, required: false, ...extra });

test('never plans more minutes than the student has, and every item is either planned or deferred with a reason', () => {
  const items = [item('a', 20), item('b', 25), item('c', 30), item('d', 15), item('e', null), item('f', 90)];
  for (const available of [0, 10, 30, 60, 100]) {
    const plan = planDay({ items, availableMinutes: available, today: TODAY });
    assert.ok(plan.usedMinutes <= available);
    assert.equal(plan.planned.length + plan.deferred.length, items.length, 'nothing disappears');
    assert.ok(plan.deferred.every((d) => ['UNESTIMATED', 'LONGER_THAN_THE_DAY', 'NO_TIME_LEFT'].includes(d.reason)));
  }
});

test('an item without a minute estimate is reported UNESTIMATED, never guessed; one longer than the whole day is not truncated', () => {
  const plan = planDay({ items: [item('x', null), item('y', 0), item('z', 120), item('ok', 10)], availableMinutes: 60, today: TODAY });
  assert.deepEqual(plan.planned.map((p) => p.id), ['ok']);
  assert.deepEqual(Object.fromEntries(plan.deferred.map((d) => [d.id, d.reason])), { x: 'UNESTIMATED', y: 'UNESTIMATED', z: 'LONGER_THAN_THE_DAY' });
});

test('what the schedule says is owed today comes before optional items, and the plan says when a required item did not fit', () => {
  const items = [item('opt', 20, { dueDate: '2026-09-01' }), item('req', 40, { required: true, dueDate: TODAY })];
  const fits = planDay({ items, availableMinutes: 60, today: TODAY });
  assert.deepEqual(fits.planned.map((p) => p.id), ['req', 'opt']);
  const tight = planDay({ items, availableMinutes: 40, today: TODAY });
  assert.deepEqual(tight.planned.map((p) => p.id), ['req']);
  const tooTight = planDay({ items: [item('req', 50, { required: true })], availableMinutes: 30, today: TODAY });
  assert.deepEqual(tooTight.requiredDeferred, ['req'], 'a required item left out is never silent');
});

test('lateness counts but is capped, so an old pile cannot bury a recent item forever; an exam only matters when given and near', () => {
  const old = scoreItem(item('o', 10, { dueDate: '2020-01-01' }), TODAY);
  const ancient = scoreItem(item('p', 10, { dueDate: '2000-01-01' }), TODAY);
  assert.equal(old.score, ancient.score);
  assert.ok(old.reasons.includes('OVERDUE_30D'));
  assert.equal(scoreItem(item('n', 10), TODAY).score, 0, 'no due date, no exam, not required: no invented urgency');
  const far = scoreItem(item('f', 10, { examDate: '2027-06-01' }), TODAY);
  const near = scoreItem(item('c', 10, { examDate: '2026-10-23' }), TODAY);
  const sooner = scoreItem(item('s', 10, { examDate: '2026-10-21' }), TODAY);
  assert.equal(far.score, 0);
  assert.ok(near.score > 0 && sooner.score > near.score);
  assert.ok(near.reasons.includes('EXAM_IN_3D'));
});

test('deterministic: same input, same plan, ties broken by id; the input is not mutated', () => {
  const items = [item('b', 10, { dueDate: '2026-10-10' }), item('a', 10, { dueDate: '2026-10-10' })];
  const before = JSON.stringify(items);
  const one = planDay({ items, availableMinutes: 15, today: TODAY });
  assert.deepEqual(planDay({ items, availableMinutes: 15, today: TODAY }), one);
  assert.deepEqual(one.planned.map((p) => p.id), ['a']);
  assert.equal(JSON.stringify(items), before);
  assert.throws(() => planDay({ items, availableMinutes: -1, today: TODAY }), /non-negative/);
});
