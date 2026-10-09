import test from 'node:test';
import assert from 'node:assert/strict';
import { groupUpcomingReviews, UPCOMING_CAP } from '../src/upcoming-reviews.js';

// T-F4-08: pure grouping/capping of the offline snapshot's FUTURE reviews (dueDate > today).
const item = (id, dueDate, unitTitle = `Aula ${id}`, subjectName = 'Disc') => ({ reviewTaskId: id, dueDate, unitTitle, subjectName });

test('keeps only items strictly after today; overdue and today are excluded', () => {
  const r = groupUpcomingReviews([item(1, '2026-10-04'), item(2, '2026-10-05'), item(3, '2026-10-06')], '2026-10-05');
  assert.equal(r.total, 1);
  assert.deepEqual(r.groups.map((g) => g.date), ['2026-10-06']);
});

test('groups by date in ascending order regardless of input order', () => {
  const r = groupUpcomingReviews([item(1, '2026-10-14'), item(2, '2026-10-06'), item(3, '2026-10-08'), item(4, '2026-10-06')], '2026-10-05');
  assert.deepEqual(r.groups.map((g) => g.date), ['2026-10-06', '2026-10-08', '2026-10-14']);
  assert.deepEqual(r.groups[0].items.map((i) => i.reviewTaskId), [2, 4]);
});

test('no future items yields an empty result', () => {
  const r = groupUpcomingReviews([item(1, '2026-10-05')], '2026-10-05');
  assert.deepEqual(r, { groups: [], shown: 0, remaining: 0, total: 0 });
  assert.deepEqual(groupUpcomingReviews(undefined, '2026-10-05').groups, []);
});

test('caps the shown rows and counts the rest, keeping the earliest dates', () => {
  const many = Array.from({ length: UPCOMING_CAP + 5 }, (_, i) => item(i + 1, `2026-11-${String(i + 1).padStart(2, '0')}`));
  const r = groupUpcomingReviews(many.reverse(), '2026-10-05');
  assert.equal(r.total, UPCOMING_CAP + 5);
  assert.equal(r.shown, UPCOMING_CAP);
  assert.equal(r.remaining, 5);
  assert.equal(r.groups.flatMap((g) => g.items).length, UPCOMING_CAP);
  assert.equal(r.groups[0].date, '2026-11-01');
});

test('the cap may cut a date group in the middle; the group keeps only the shown rows', () => {
  const same = Array.from({ length: 4 }, (_, i) => item(i + 1, '2026-10-06'));
  const r = groupUpcomingReviews(same, '2026-10-05', 3);
  assert.equal(r.shown, 3);
  assert.equal(r.remaining, 1);
  assert.equal(r.groups[0].items.length, 3);
});
