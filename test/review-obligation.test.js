// HG-09 experimental read-model: properties that must hold whatever D-13/D-14 end up being.
import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveObligations, completeRequired, RECOVERY } from '../shared/review-obligation.js';
import { generateReviewDates } from '../shared/review-schedule.js';

let nextId = 1;
const unitTasks = (unitId, studyDate, completedIdx = []) => generateReviewDates(studyDate).map((d, i) => ({
  id: nextId++, unitId, offsetDays: d.offsetDays ?? i, dueDate: d.dueDate ?? d.date ?? d, completedAt: completedIdx.includes(i) ? `${d.dueDate ?? d.date ?? d}T10:00:00Z` : null,
}));
const snapshot = (tasks) => JSON.stringify(tasks);

test('many overdue stages collapse into ONE required review per unit; the rest are listed under it, not demanded one by one', () => {
  const tasks = [...unitTasks(1, '2026-01-01'), ...unitTasks(2, '2026-01-05')];
  const out = deriveObligations(tasks, '2026-08-01');
  assert.equal(out.length, 2);
  for (const u of out) {
    assert.ok(u.required, 'a long-overdue unit owes exactly one');
    assert.ok(u.collapsed.length >= 4, 'the older ones are not lost, only collapsed');
    assert.equal(u.upcoming, null);
    assert.ok([u.required, ...u.collapsed].every((t) => t.dueDate <= '2026-08-01'));
    assert.ok(u.collapsed.every((t) => t.dueDate >= u.required.dueDate), 'the required one is the OLDEST due');
  }
});

test('a unit with nothing due owes nothing and shows its next one; a finished unit shows neither', () => {
  const fresh = deriveObligations(unitTasks(1, '2026-08-01'), '2026-08-01')[0];
  assert.equal(fresh.required, null);
  assert.ok(fresh.upcoming);
  const done = deriveObligations(unitTasks(2, '2026-01-01', Array.from({ length: 16 }, (_, i) => i)), '2027-12-31')[0];
  assert.deepEqual([done.required, done.upcoming, done.pendingCount], [null, null, 0]);
});

test('PURE: deriving and completing never mutate the tasks, never mark anything completed and are repeatable', () => {
  const tasks = unitTasks(1, '2026-01-01');
  const before = snapshot(tasks);
  const a = deriveObligations(tasks, '2026-08-01');
  const b = deriveObligations(tasks, '2026-08-01');
  completeRequired(tasks, 1, '2026-08-01', { recovery: RECOVERY.SUPERSEDE_OVERDUE });
  assert.deepEqual(a, b);
  assert.equal(snapshot(tasks), before);
});

test('recovery is a NAMED parameter: NONE keeps the older overdue ones owed in turn; SUPERSEDE_OVERDUE retires them as "not performed", never as done', () => {
  const tasks = unitTasks(1, '2026-01-01');
  const entry = deriveObligations(tasks, '2026-08-01')[0];
  const none = completeRequired(tasks, 1, '2026-08-01', { recovery: RECOVERY.NONE });
  assert.deepEqual(none, { completedId: entry.required.id, supersededIds: [] });
  const sup = completeRequired(tasks, 1, '2026-08-01', { recovery: RECOVERY.SUPERSEDE_OVERDUE });
  assert.equal(sup.completedId, entry.required.id);
  assert.deepEqual(sup.supersededIds, entry.collapsed.map((t) => t.id));
  assert.ok(!sup.supersededIds.includes(sup.completedId));
  assert.throws(() => completeRequired(tasks, 1, '2026-08-01', { recovery: 'INVENTED' }), /unknown recovery policy/);
});

test('applying SUPERSEDE_OVERDUE leaves exactly the future reviews pending; applying NONE leaves one required per step (no relief)', () => {
  const apply = (tasks, instr) => tasks.map((t) => (t.id === instr.completedId ? { ...t, completedAt: 'x' } : instr.supersededIds.includes(t.id) ? { ...t, completedAt: null, superseded: true } : t));
  const base = unitTasks(1, '2026-01-01');
  const owed = (tasks) => deriveObligations(tasks.filter((t) => !t.superseded), '2026-08-01')[0];
  const afterSup = apply(base, completeRequired(base, 1, '2026-08-01', { recovery: RECOVERY.SUPERSEDE_OVERDUE }));
  assert.equal(owed(afterSup).required, null, 'nothing overdue is owed after the one required review');
  const afterNone = apply(base, completeRequired(base, 1, '2026-08-01', { recovery: RECOVERY.NONE }));
  assert.ok(owed(afterNone).required, 'with NONE the next overdue stage is owed, so the pile is only reordered');
});

test('an empty or other-unit input is harmless', () => {
  assert.deepEqual(deriveObligations([], '2026-08-01'), []);
  assert.deepEqual(completeRequired(unitTasks(1, '2026-01-01'), 99, '2026-08-01'), { completedId: null, supersededIds: [] });
});
