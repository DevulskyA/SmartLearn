import { test } from 'node:test';
import assert from 'node:assert/strict';

// Characterization of the user-visible pt-BR text in migration-ui.js. The module is DOM-free; only fetch is faked.
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true, writable: true });
globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
const { previewImport, entityLabel } = await import('../src/migration-ui.js');

test('a network failure during an import step says the server could not be reached, in pt-BR', async () => {
  const result = await previewImport('{}');
  assert.deepEqual(result, {
    ok: false,
    code: 'NETWORK_ERROR',
    message: 'Não foi possível contatar o servidor. Verifique sua conexão e tente novamente.',
  });
});

test('every migrated entity has its pt-BR label; an unknown key is shown as written', () => {
  assert.equal(entityLabel('subjects'), 'Disciplinas');
  assert.equal(entityLabel('learningUnits'), 'Aulas');
  assert.equal(entityLabel('reviewTasks'), 'Revisões');
  assert.equal(entityLabel('exercises'), 'Exercícios');
  assert.equal(entityLabel('learningEvidence'), 'Evidências de aprendizagem');
  assert.equal(entityLabel('exerciseVersions'), 'Versões de exercícios');
  assert.equal(entityLabel('exerciseAttempts'), 'Tentativas');
  assert.equal(entityLabel('learningEvents'), 'Eventos de aprendizagem');
  assert.equal(entityLabel('exams'), 'Provas');
  assert.equal(entityLabel('examItems'), 'Itens de provas');
  assert.equal(entityLabel('examEvidence'), 'Evidências de provas');
  assert.equal(entityLabel('somethingNew'), 'somethingNew');
});
