// Characterization of the user-visible pt-BR texts in src/stats.js, src/draft-review-ui.js and src/generation-jobs-ui.js.
// These pin today's exact strings so moving them into the catalog cannot change what the student sees.
import test from 'node:test';
import assert from 'node:assert/strict';

const { Stats } = await import('../src/stats.js');
const { generateDraft } = await import('../src/draft-review-ui.js');
const { createJob } = await import('../src/generation-jobs-ui.js');

const realFetch = globalThis.fetch;
const NETWORK_MESSAGE = 'Não foi possível contatar o servidor. Verifique sua conexão e tente novamente.';

test('Stats: an exercise whose unit or subject is missing shows the fallback names', () => {
  const stats = Stats.calculate(
    [],
    [{ id: 1, unitId: 99, questionsCount: 2, correctCount: 1, scorePercent: 50, evidenceDate: '2026-06-27', completedAt: '2026-06-27T10:00:00.000Z' }],
    [],
    [],
    '2026-06-27',
  );
  assert.equal(stats.completedExercises.length, 1);
  assert.equal(stats.completedExercises[0].subjectName, 'Sem disciplina');
  assert.equal(stats.completedExercises[0].title, 'Conteúdo indisponível');
  assert.equal(stats.avgBySubject[0].subjectName, 'Sem disciplina');
});

test('generateDraft: a network failure reports the reconnect message', async () => {
  globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
  try {
    const result = await generateDraft('p1');
    assert.deepEqual(result, { ok: false, code: 'NETWORK_ERROR', message: NETWORK_MESSAGE });
  } finally { globalThis.fetch = realFetch; }
});

test('createJob: a network failure reports the reconnect message', async () => {
  globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
  try {
    const result = await createJob('p1');
    assert.deepEqual(result, { ok: false, code: 'NETWORK_ERROR', message: NETWORK_MESSAGE });
  } finally { globalThis.fetch = realFetch; }
});
