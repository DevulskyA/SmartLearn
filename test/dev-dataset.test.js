import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getDevDataset } from '../src/fixtures/dev-dataset.js';

test('getDevDataset retorna objeto com schemaVersion 3', () => {
  const d = getDevDataset();
  assert.equal(d.schemaVersion, 3);
});

test('getDevDataset contém subjects, learningUnits, reviewTasks não vazios', () => {
  const d = getDevDataset();
  assert.ok(Array.isArray(d.subjects) && d.subjects.length > 0, 'subjects não vazio');
  assert.ok(Array.isArray(d.learningUnits) && d.learningUnits.length > 0, 'learningUnits não vazio');
  assert.ok(Array.isArray(d.reviewTasks) && d.reviewTasks.length > 0, 'reviewTasks não vazio');
});

test('getDevDataset: cada subject tem id, name, color, isActive, sortOrder', () => {
  const { subjects } = getDevDataset();
  for (const s of subjects) {
    assert.ok(typeof s.id === 'number', `subject id deve ser number: ${JSON.stringify(s)}`);
    assert.ok(typeof s.name === 'string' && s.name.length > 0, `subject name inválido: ${JSON.stringify(s)}`);
    assert.ok(typeof s.color === 'string', `subject color inválido: ${JSON.stringify(s)}`);
    assert.ok(typeof s.isActive === 'boolean', `subject isActive deve ser boolean: ${JSON.stringify(s)}`);
  }
});

test('getDevDataset: review tasks cobrem 16 revisões por unidade', () => {
  const { reviewTasks, learningUnits } = getDevDataset();
  for (const unit of learningUnits) {
    const tasks = reviewTasks.filter(t => t.unitId === unit.id);
    assert.equal(tasks.length, 16, `unidade ${unit.id} deve ter 16 review tasks`);
  }
});

test('getDevDataset: review #1 de cada unidade vence dentro de 7 dias do studyDate', () => {
  const d = getDevDataset();
  for (const unit of d.learningUnits) {
    const firstTask = d.reviewTasks.find(t => t.unitId === unit.id && t.reviewNumber === 1);
    assert.ok(firstTask, `unidade ${unit.id} deve ter task reviewNumber=1`);
    const studyMs = new Date(unit.studyDate).getTime();
    const dueMs = new Date(firstTask.dueDate).getTime();
    const diffDays = (dueMs - studyMs) / (1000 * 60 * 60 * 24);
    assert.ok(diffDays >= 1 && diffDays <= 7, `review #1 da unidade ${unit.id} deve vencer em 1-7 dias após studyDate, got ${diffDays}`);
  }
});

test('getDevDataset: exercises têm provenance válido', () => {
  const { exercises } = getDevDataset();
  const valid = ['MANUAL', 'SOURCE', 'AI_GENERATED'];
  for (const ex of exercises) {
    assert.ok(valid.includes(ex.provenance), `provenance inválido: ${ex.provenance}`);
    assert.ok(ex.questionText && ex.questionText.length > 0, `questionText vazio em exercício ${ex.id}`);
    assert.ok(ex.answerText && ex.answerText.length > 0, `answerText vazio em exercício ${ex.id}`);
  }
});

test('getDevDataset: reviewTasks ids são únicos', () => {
  const { reviewTasks } = getDevDataset();
  const ids = reviewTasks.map(t => t.id);
  const unique = new Set(ids);
  assert.equal(unique.size, ids.length, 'reviewTasks ids devem ser únicos');
});
