import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getUatMedicalDataset } from '../src/fixtures/uat-medical-dataset.js';
import { Analytics } from '../src/analytics.js';

// P0-2 required regression test #8: "the DEV/UAT fixture is valid and
// reproducibly rebuildable." This file proves both halves: the shape is a
// valid DB.importAll payload (schema/id/enum invariants the real import
// path enforces — see src/db.js's importAll validation), and calling the
// generator again rebuilds an equivalent dataset deterministically (same
// counts/relationships every time, not a one-off snapshot).

test('getUatMedicalDataset retorna objeto com schemaVersion 3', () => {
  const d = getUatMedicalDataset();
  assert.equal(d.schemaVersion, 3);
});

test('getUatMedicalDataset: ~9 disciplinas representativas, a maioria com múltiplos conteúdos', () => {
  const { subjects, learningUnits } = getUatMedicalDataset();
  assert.equal(subjects.length, 9, 'esperado exatamente 9 disciplinas representativas');
  const unitsBySubject = new Map();
  for (const u of learningUnits) {
    unitsBySubject.set(u.subjectId, (unitsBySubject.get(u.subjectId) ?? 0) + 1);
  }
  const withMultiple = [...unitsBySubject.values()].filter((n) => n >= 2).length;
  assert.ok(withMultiple >= 3, `esperado ao menos 3 disciplinas com múltiplos conteúdos, got ${withMultiple}`);
});

test('getUatMedicalDataset: cada subject tem id, name, color, isActive, sortOrder', () => {
  const { subjects } = getUatMedicalDataset();
  const ids = new Set();
  for (const s of subjects) {
    assert.ok(typeof s.id === 'number');
    assert.ok(typeof s.name === 'string' && s.name.length > 0);
    assert.ok(typeof s.color === 'string');
    assert.ok(typeof s.isActive === 'boolean');
    assert.ok(typeof s.sortOrder === 'number');
    ids.add(s.id);
  }
  assert.equal(ids.size, subjects.length, 'subject ids devem ser únicos');
});

test('getUatMedicalDataset: inclui tanto rótulos curtos quanto um rótulo de disciplina deliberadamente longo', () => {
  const { subjects } = getUatMedicalDataset();
  const shortOnes = subjects.filter((s) => s.name.length <= 12);
  const longOnes = subjects.filter((s) => s.name.length >= 50);
  assert.ok(shortOnes.length >= 1, 'esperado ao menos um rótulo curto (ex.: "Anatomia", "Pediatria")');
  assert.ok(longOnes.length >= 1, 'esperado ao menos um rótulo de disciplina bem longo para stress de layout');
});

test('getUatMedicalDataset: review tasks cobrem exatamente 16 revisões por unidade, ids únicos', () => {
  const { reviewTasks, learningUnits } = getUatMedicalDataset();
  for (const unit of learningUnits) {
    const tasks = reviewTasks.filter((t) => t.unitId === unit.id);
    assert.equal(tasks.length, 16, `unidade ${unit.id} (${unit.title}) deve ter 16 review tasks`);
  }
  const ids = reviewTasks.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length, 'reviewTasks ids devem ser únicos');
});

test('getUatMedicalDataset: review tasks aparecem em pelo menos três estados diferentes (concluída, atrasada pendente, futura pendente)', () => {
  const { reviewTasks } = getUatMedicalDataset();
  const today = new Date().toISOString().slice(0, 10);
  const done = reviewTasks.filter((t) => t.reviewDone === true);
  const overduePending = reviewTasks.filter((t) => t.reviewDone === false && t.dueDate < today);
  const futurePending = reviewTasks.filter((t) => t.reviewDone === false && t.dueDate >= today);
  assert.ok(done.length > 0, 'esperado ao menos uma review concluída');
  assert.ok(overduePending.length > 0, 'esperado ao menos uma review atrasada e ainda pendente');
  assert.ok(futurePending.length > 0, 'esperado ao menos uma review futura pendente');
});

test('getUatMedicalDataset: exercises têm provenance válido e texto não vazio', () => {
  const { exercises } = getUatMedicalDataset();
  assert.ok(exercises.length > 0);
  const valid = ['MANUAL', 'SOURCE', 'AI_GENERATED'];
  const ids = new Set();
  for (const ex of exercises) {
    assert.ok(valid.includes(ex.provenance), `provenance inválido: ${ex.provenance}`);
    assert.ok(ex.questionText?.length > 0);
    assert.ok(ex.answerText?.length > 0);
    ids.add(ex.id);
  }
  assert.equal(ids.size, exercises.length, 'exercise ids devem ser únicos');
});

test('getUatMedicalDataset: learningEvidence respeita a regra de domínio REVIEW<->reviewTaskId (importAll a valida)', () => {
  const { learningEvidence, reviewTasks } = getUatMedicalDataset();
  assert.ok(learningEvidence.length > 0);
  const taskIds = new Set(reviewTasks.map((t) => t.id));
  const ids = new Set();
  for (const ev of learningEvidence) {
    assert.ok(['INITIAL_PRACTICE', 'REVIEW', 'EXTERNAL'].includes(ev.context), `context inválido: ${ev.context}`);
    if (ev.context === 'REVIEW') {
      assert.ok(ev.reviewTaskId != null, 'REVIEW requer reviewTaskId');
      assert.ok(taskIds.has(ev.reviewTaskId), 'reviewTaskId deve apontar para uma review task real');
    } else {
      assert.equal(ev.reviewTaskId, null, `${ev.context} não pode ter reviewTaskId`);
    }
    assert.ok(ev.correctCount <= ev.questionsCount, 'correctCount nunca pode exceder questionsCount');
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(ev.evidenceDate), `evidenceDate deve ser ISO: ${ev.evidenceDate}`);
    ids.add(ev.id);
  }
  assert.equal(ids.size, learningEvidence.length, 'learningEvidence ids devem ser únicos');
});

test('getUatMedicalDataset: pelo menos uma disciplina/conteúdo sem nenhuma evidência ainda', () => {
  const { learningUnits, learningEvidence } = getUatMedicalDataset();
  const unitsWithEvidence = new Set(learningEvidence.map((e) => e.unitId));
  const noEvidenceUnits = learningUnits.filter((u) => !unitsWithEvidence.has(u.id));
  assert.ok(noEvidenceUnits.length >= 2, 'esperado ao menos 2 conteúdos ainda sem evidência');
});

test('getUatMedicalDataset: cobre volume de prática pequeno, médio e pesado', () => {
  const { learningUnits, learningEvidence } = getUatMedicalDataset();
  const totalsByUnit = new Map();
  for (const ev of learningEvidence) {
    totalsByUnit.set(ev.unitId, (totalsByUnit.get(ev.unitId) ?? 0) + ev.questionsCount);
  }
  const totals = learningUnits.map((u) => totalsByUnit.get(u.id) ?? 0).filter((n) => n > 0);
  assert.ok(totals.some((n) => n <= 15), 'esperado ao menos um conteúdo com volume pequeno (<=15 questões)');
  assert.ok(totals.some((n) => n > 15 && n < 80), 'esperado ao menos um conteúdo com volume médio');
  assert.ok(totals.some((n) => n >= 80), 'esperado ao menos um conteúdo com volume pesado (>=80 questões)');
});

test('getUatMedicalDataset: evidência cobre múltiplas janelas de tempo (recente, 30-90d, 90-365d, e além de 365d)', () => {
  const { learningEvidence } = getUatMedicalDataset();
  const today = new Date();
  const daysAgo = (iso) => Math.round((today.getTime() - new Date(`${iso}T00:00:00.000Z`).getTime()) / 86400000);
  const buckets = { last30: 0, d30to90: 0, d90to365: 0, beyond365: 0 };
  for (const ev of learningEvidence) {
    const n = daysAgo(ev.evidenceDate);
    if (n <= 30) buckets.last30++;
    else if (n <= 90) buckets.d30to90++;
    else if (n <= 365) buckets.d90to365++;
    else buckets.beyond365++;
  }
  for (const [bucket, count] of Object.entries(buckets)) {
    assert.ok(count > 0, `esperado ao menos uma evidência na janela ${bucket}, got 0`);
  }
});

test('getUatMedicalDataset: produz cada direção de tendência por disciplina (IMPROVING/DECLINING/STABLE/INSUFFICIENT)', () => {
  const d = getUatMedicalDataset();
  const today = new Date().toISOString().slice(0, 10);
  const rows = Analytics.bySubject(d.learningEvidence, d.learningUnits, d.subjects, today);
  const directions = new Set(rows.map((r) => r.trend.direction));
  for (const expected of ['IMPROVING', 'DECLINING', 'STABLE', 'INSUFFICIENT']) {
    assert.ok(directions.has(expected), `esperado ao menos uma disciplina com tendência ${expected}, got: ${[...directions].join(', ')}`);
  }
});

test('getUatMedicalDataset: produz desempenho baixo, médio e alto entre disciplinas (STRONG/ADEQUATE-ish/CRITICAL-ish)', () => {
  const d = getUatMedicalDataset();
  const today = new Date().toISOString().slice(0, 10);
  const rows = Analytics.bySubject(d.learningEvidence, d.learningUnits, d.subjects, today);
  const withEvidence = rows.filter((r) => r.weightedAccuracy != null);
  assert.ok(withEvidence.some((r) => r.weightedAccuracy >= 80), 'esperado ao menos uma disciplina com desempenho alto (>=80%)');
  assert.ok(withEvidence.some((r) => r.weightedAccuracy < 65), 'esperado ao menos uma disciplina com desempenho baixo (<65%)');
  assert.ok(rows.some((r) => r.weightedAccuracy == null), 'esperado ao menos uma disciplina sem evidência (NO_EVIDENCE)');
});

test('getUatMedicalDataset é reproduzível: duas chamadas produzem o MESMO objeto, byte a byte, ids inclusive', () => {
  // A real deepEqual, not just lengths/names — the id counters
  // (nextUnitId/nextTaskId/nextExerciseId/nextEvidenceId) are module-level
  // state shared across calls specifically so this must be exercised: an
  // independent review caught an earlier version of this test passing
  // while the ids themselves silently continued across calls (unit id 1
  // vs 14, task id 1 vs 209, evidence id 1 vs 43) because it only compared
  // lengths and [subjectId, title] tuples, never ids.
  const a = getUatMedicalDataset();
  const b = getUatMedicalDataset();
  assert.deepEqual(a, b, 'two calls in the same process must produce a byte-identical dataset, including every id');
});
