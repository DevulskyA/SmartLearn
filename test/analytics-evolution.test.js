import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthlyAccuracySeries } from '../src/analytics.js';

// The evolution chart's data, extracted from app.js so it is testable without a DOM.
const subjects = [{ id: 1, name: 'Fisiologia' }, { id: 2, name: 'Anatomia' }];
const units = [{ id: 10, subjectId: 1 }, { id: 20, subjectId: 2 }];
const ev = (unitId, evidenceDate, questionsCount, correctCount) => ({ unitId, evidenceDate, questionsCount, correctCount });
const TODAY = '2026-10-16';

test('accuracy is correct/questions in percent per subject and month; a month without evidence for a subject is null', () => {
  const evidence = [ev(10, '2026-08-03', 10, 5), ev(10, '2026-08-20', 10, 10), ev(10, '2026-10-01', 4, 1), ev(20, '2026-09-09', 8, 6)];
  const r = monthlyAccuracySeries(evidence, units, subjects, { today: TODAY });
  assert.deepEqual(r.months, ['2026-08', '2026-09', '2026-10']);
  const bySubject = Object.fromEntries(r.series.map((s) => [s.subjectId, s.points]));
  assert.deepEqual(bySubject[1], [75, null, 25]);
  assert.deepEqual(bySubject[2], [null, 75, null]);
  assert.equal(r.series.find((s) => s.subjectId === 1).subject.name, 'Fisiologia');
});

test('periodMonths keeps the last N months counted from today; 0 keeps everything', () => {
  const evidence = [ev(10, '2026-03-31', 10, 10), ev(10, '2026-04-01', 10, 5), ev(10, '2025-01-10', 10, 0)];
  assert.deepEqual(monthlyAccuracySeries(evidence, units, subjects, { today: TODAY, periodMonths: 6 }).months, ['2026-04']);
  assert.deepEqual(monthlyAccuracySeries(evidence, units, subjects, { today: TODAY, periodMonths: 0 }).months, ['2025-01', '2026-03', '2026-04']);
});

test('subjectFilter is compared as a string and narrows the series; unknown units and a filter with no match give an empty chart', () => {
  const evidence = [ev(10, '2026-10-01', 10, 5), ev(20, '2026-10-02', 10, 10), ev(99, '2026-10-03', 10, 10)];
  const only2 = monthlyAccuracySeries(evidence, units, subjects, { today: TODAY, subjectFilter: '2' });
  assert.deepEqual(only2.series.map((s) => s.subjectId), [2]);
  const none = monthlyAccuracySeries(evidence, units, subjects, { today: TODAY, subjectFilter: '7' });
  assert.deepEqual(none, { months: [], series: [] });
  assert.deepEqual(monthlyAccuracySeries([], units, subjects, { today: TODAY }), { months: [], series: [] });
});

test('a month whose questions sum to zero is null, not NaN', () => {
  const r = monthlyAccuracySeries([ev(10, '2026-10-01', 0, 0)], units, subjects, { today: TODAY });
  assert.deepEqual(r.series[0].points, [null]);
});
