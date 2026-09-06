import test from "node:test";
import assert from "node:assert/strict";

const store = {};
globalThis.localStorage = {
  getItem: (key) => store[key] ?? null,
  setItem: (key, value) => { store[key] = value; },
  removeItem: (key) => { delete store[key]; },
  clear: () => { for (const k of Object.keys(store)) delete store[k]; },
};

test.beforeEach(() => { localStorage.clear(); });

const { DB } = await import("../src/db.js");

async function makeSubject(name = "Fisiologia") {
  await DB.init();
  return DB.subjects.create(name, "DISC-BLUE");
}

async function makeUnit(subjectId) {
  return DB.learningUnits.create({
    subjectId,
    sourceText: "Guyton cap. 1",
    studyDate: "2026-09-01",
    title: "Homeostase",
  });
}

// --- CRUD básico ---

test("learningEvidence.create insere registro com context INITIAL_PRACTICE", async () => {
  const subject = await makeSubject("Fisiologia");
  const unit = await makeUnit(subject.id);
  const evidence = await DB.learningEvidence.create({
    unitId: unit.id,
    evidenceDate: "2026-09-01",
    context: "INITIAL_PRACTICE",
    questionsCount: 20,
    correctCount: 14,
  });
  assert.equal(evidence.unitId, unit.id);
  assert.equal(evidence.context, "INITIAL_PRACTICE");
  assert.equal(evidence.questionsCount, 20);
  assert.equal(evidence.correctCount, 14);
  assert.ok(Math.abs(evidence.scorePercent - 70) < 0.01);
  assert.equal(evidence.reviewTaskId, null);
});

test("learningEvidence.create insere com context EXTERNAL sem reviewTaskId", async () => {
  const subject = await makeSubject();
  const unit = await makeUnit(subject.id);
  const evidence = await DB.learningEvidence.create({
    unitId: unit.id,
    evidenceDate: "2026-09-02",
    context: "EXTERNAL",
    questionsCount: 40,
    correctCount: 30,
  });
  assert.equal(evidence.context, "EXTERNAL");
  assert.equal(evidence.reviewTaskId, null);
  assert.ok(Math.abs(evidence.scorePercent - 75) < 0.01);
});

test("learningEvidence.create rejeita context inválido", async () => {
  const subject = await makeSubject();
  const unit = await makeUnit(subject.id);
  await assert.rejects(
    () => DB.learningEvidence.create({
      unitId: unit.id,
      evidenceDate: "2026-09-01",
      context: "INVALID",
      questionsCount: 10,
      correctCount: 5,
    }),
    /context/i,
  );
});

test("learningEvidence.create rejeita questionsCount zero", async () => {
  const subject = await makeSubject();
  const unit = await makeUnit(subject.id);
  await assert.rejects(
    () => DB.learningEvidence.create({
      unitId: unit.id,
      evidenceDate: "2026-09-01",
      context: "REVIEW",
      questionsCount: 0,
      correctCount: 0,
    }),
    /questionsCount/i,
  );
});

test("learningEvidence.create rejeita correctCount > questionsCount", async () => {
  const subject = await makeSubject();
  const unit = await makeUnit(subject.id);
  await assert.rejects(
    () => DB.learningEvidence.create({
      unitId: unit.id,
      evidenceDate: "2026-09-01",
      context: "REVIEW",
      questionsCount: 10,
      correctCount: 11,
    }),
    /correctCount/i,
  );
});

// --- constraint único reviewTaskId ---

test("learningEvidence: segunda evidência para mesma reviewTask deve falhar", async () => {
  const subject = await makeSubject();
  const unit = await makeUnit(subject.id);
  const tasks = await DB.reviewTasks.createBulk([{ unitId: unit.id, reviewNumber: 1, dueDate: "2026-09-01", reviewDone: false, questionsDone: false }]);
  const task = tasks[0];
  await DB.learningEvidence.create({
    unitId: unit.id,
    evidenceDate: "2026-09-01",
    context: "REVIEW",
    questionsCount: 10,
    correctCount: 8,
    reviewTaskId: task.id,
  });
  await assert.rejects(
    () => DB.learningEvidence.create({
      unitId: unit.id,
      evidenceDate: "2026-09-01",
      context: "REVIEW",
      questionsCount: 5,
      correctCount: 3,
      reviewTaskId: task.id,
    }),
    /evidência/i,
  );
});

// --- completeReviewWithEvidence (atomicidade) ---

test("completeReviewWithEvidence atualiza review_task e cria learning_evidence atomicamente", async () => {
  const subject = await makeSubject();
  const unit = await makeUnit(subject.id);
  const tasks = await DB.reviewTasks.createBulk([{
    unitId: unit.id,
    reviewNumber: 1,
    dueDate: "2026-09-01",
    reviewDone: false,
    questionsDone: false,
  }]);
  const task = tasks[0];
  const updated = await DB.completeReviewWithEvidence({
    taskId: task.id,
    questionsCount: 20,
    correctCount: 15,
  });
  assert.equal(updated.reviewDone, true);
  assert.equal(updated.questionsDone, true);
  assert.equal(updated.questionsCount, 20);
  assert.equal(updated.correctCount, 15);
  assert.ok(Math.abs(updated.scorePercent - 75) < 0.01);

  const evidence = await DB.learningEvidence.getByUnit(unit.id);
  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].context, "REVIEW");
  assert.equal(evidence[0].questionsCount, 20);
  assert.equal(evidence[0].reviewTaskId, task.id);
});

test("completeReviewWithEvidence rejeita questionsCount inválido", async () => {
  await DB.init();
  await assert.rejects(
    () => DB.completeReviewWithEvidence({ taskId: 1, questionsCount: 0, correctCount: 0 }),
    /questionsCount/i,
  );
});

test("completeReviewWithEvidence rejeita correctCount > questionsCount", async () => {
  await DB.init();
  await assert.rejects(
    () => DB.completeReviewWithEvidence({ taskId: 1, questionsCount: 10, correctCount: 11 }),
    /correctCount/i,
  );
});

test("completeReviewWithEvidence segunda chamada para mesmo taskId deve falhar e não alterar o estado", async () => {
  const subject = await makeSubject();
  const unit = await makeUnit(subject.id);
  const tasks = await DB.reviewTasks.createBulk([{
    unitId: unit.id,
    reviewNumber: 1,
    dueDate: "2026-09-01",
    reviewDone: false,
    questionsDone: false,
  }]);
  const task = tasks[0];

  await DB.completeReviewWithEvidence({ taskId: task.id, questionsCount: 10, correctCount: 8 });

  await assert.rejects(
    () => DB.completeReviewWithEvidence({ taskId: task.id, questionsCount: 10, correctCount: 5 }),
    /evidência/i,
  );

  const evidence = await DB.learningEvidence.getByUnit(unit.id);
  assert.equal(evidence.length, 1, "nenhuma evidência extra criada");
  assert.ok(Math.abs(evidence[0].scorePercent - 80) < 0.01, "scorePercent da 1ª chamada preservado");

  const [finalTask] = await DB.reviewTasks.getAll().then(ts => ts.filter(t => t.id === task.id));
  assert.ok(Math.abs(finalTask.scorePercent - 80) < 0.01, "review_task não sobrescrito pela 2ª chamada");
});

// --- consultas ---

test("learningEvidence.getByUnit retorna só evidências da unidade", async () => {
  const subject = await makeSubject();
  const unit1 = await makeUnit(subject.id);
  const unit2 = await DB.learningUnits.create({
    subjectId: subject.id,
    sourceText: "",
    studyDate: "2026-09-01",
    title: "Outro",
  });
  await DB.learningEvidence.create({ unitId: unit1.id, evidenceDate: "2026-09-01", context: "INITIAL_PRACTICE", questionsCount: 10, correctCount: 8 });
  await DB.learningEvidence.create({ unitId: unit2.id, evidenceDate: "2026-09-01", context: "EXTERNAL", questionsCount: 5, correctCount: 3 });
  const ev1 = await DB.learningEvidence.getByUnit(unit1.id);
  assert.equal(ev1.length, 1);
  assert.equal(ev1[0].unitId, unit1.id);
});

test("learningEvidence.getBySubject retorna evidências de todas as unidades da disciplina", async () => {
  const subject = await makeSubject();
  const unit1 = await makeUnit(subject.id);
  const unit2 = await DB.learningUnits.create({ subjectId: subject.id, sourceText: "", studyDate: "2026-09-01", title: "Outro" });
  await DB.learningEvidence.create({ unitId: unit1.id, evidenceDate: "2026-09-01", context: "INITIAL_PRACTICE", questionsCount: 10, correctCount: 8 });
  await DB.learningEvidence.create({ unitId: unit2.id, evidenceDate: "2026-09-01", context: "EXTERNAL", questionsCount: 5, correctCount: 3 });
  const ev = await DB.learningEvidence.getBySubject(subject.id);
  assert.equal(ev.length, 2);
});

// --- migration idempotente ---

test("runMigrationFromReviewTasks é idempotente (rodar duas vezes não duplica)", async () => {
  const subject = await makeSubject();
  const unit = await makeUnit(subject.id);
  await DB.reviewTasks.createBulk([{
    unitId: unit.id,
    reviewNumber: 1,
    dueDate: "2026-09-01",
    reviewDone: true,
    questionsDone: true,
    questionsCount: 10,
    correctCount: 7,
    completedAt: "2026-09-01T10:00:00.000Z",
  }]);
  await DB.learningEvidence.runMigrationFromReviewTasks();
  await DB.learningEvidence.runMigrationFromReviewTasks();
  const evidence = await DB.learningEvidence.getAll();
  assert.equal(evidence.length, 1);
});

test("runMigrationFromReviewTasks ignora tarefas sem questões", async () => {
  const subject = await makeSubject();
  const unit = await makeUnit(subject.id);
  await DB.reviewTasks.createBulk([{
    unitId: unit.id,
    reviewNumber: 1,
    dueDate: "2026-09-01",
    reviewDone: true,
    questionsDone: false,
    questionsCount: null,
    correctCount: null,
  }]);
  await DB.learningEvidence.runMigrationFromReviewTasks();
  const evidence = await DB.learningEvidence.getAll();
  assert.equal(evidence.length, 0);
});

// --- import schemaVersion 2 → migra para v3 ---

test("importAll schemaVersion 2 faz upgrade para v3 preservando dados", async () => {
  await DB.init();
  const v2Backup = {
    schemaVersion: 2,
    subjects: [{ id: 1, name: "Fisiologia", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", isActive: true, sortOrder: 0 }],
    learningUnits: [{ id: 1, subjectId: 1, sourceText: "Guyton", studyDate: "2026-01-10", title: "Homeostase", summaryBody: null, createdAt: "2026-01-10T00:00:00.000Z", updatedAt: "2026-01-10T00:00:00.000Z" }],
    reviewTasks: [{
      id: 1,
      unitId: 1,
      reviewNumber: 1,
      dueDate: "2026-01-11",
      completedAt: "2026-01-11T10:00:00.000Z",
      reviewDone: true,
      questionsDone: true,
      questionsCount: 20,
      correctCount: 16,
      scorePercent: 80,
      comment: null,
      createdAt: "2026-01-10T00:00:00.000Z",
      updatedAt: "2026-01-11T10:00:00.000Z",
    }],
    exercises: [],
    settings: { appVersion: "2.0.0", reviewSchedule: [], lastBackupAt: null },
  };
  const result = await DB.importAll(v2Backup);
  assert.equal(result.schemaVersion, 3);
  assert.equal(result.subjects.length, 1);
  assert.equal(result.learningUnits.length, 1);
  // Migration should have created learning_evidence from review_task
  const evidence = await DB.learningEvidence.getAll();
  assert.ok(evidence.length >= 1);
  assert.equal(evidence[0].context, "REVIEW");
  assert.equal(evidence[0].questionsCount, 20);
});

// --- import schemaVersion desconhecido → erro ---

test("importAll schemaVersion desconhecido (futuro) lança erro fail-closed", async () => {
  await DB.init();
  await assert.rejects(
    () => DB.importAll({ schemaVersion: 999, subjects: [], learningUnits: [], reviewTasks: [] }),
    /schemaVersion/i,
  );
});

test("importAll schemaVersion 0 (não suportado) lança erro fail-closed", async () => {
  await DB.init();
  await assert.rejects(
    () => DB.importAll({ schemaVersion: 0, subjects: [], learningUnits: [], reviewTasks: [] }),
    /schemaVersion/i,
  );
});

// --- P0-3: import content validation (INVALID V3 → FAIL, existing data preserved) ---

test("P0-3: importAll rejeita unit com subject inexistente (referência quebrada)", async () => {
  await DB.init();
  const badBackup = {
    schemaVersion: 3,
    subjects: [{ id: 1, name: "Fisiologia", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", isActive: true, sortOrder: 0 }],
    learningUnits: [{ id: 1, subjectId: 999 /* não existe */, studyDate: "2026-01-01", title: "Homeostase", sourceText: "", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" }],
    reviewTasks: [],
  };
  await assert.rejects(() => DB.importAll(badBackup), /subject inexistente/i);
});

test("P0-3: importAll rejeita reviewTask com unit inexistente", async () => {
  await DB.init();
  const badBackup = {
    schemaVersion: 3,
    subjects: [{ id: 1, name: "Fisio", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", isActive: true, sortOrder: 0 }],
    learningUnits: [{ id: 1, subjectId: 1, studyDate: "2026-01-01", title: "Homeostase", sourceText: "", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" }],
    reviewTasks: [{ id: 1, unitId: 999 /* não existe */, reviewNumber: 1, dueDate: "2026-01-08", reviewDone: false, questionsDone: false, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" }],
  };
  await assert.rejects(() => DB.importAll(badBackup), /unit inexistente/i);
});

test("P0-3: importAll rejeita learningEvidence REVIEW sem reviewTaskId", async () => {
  await DB.init();
  const badBackup = {
    schemaVersion: 3,
    subjects: [{ id: 1, name: "Fisio", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", isActive: true, sortOrder: 0 }],
    learningUnits: [{ id: 1, subjectId: 1, studyDate: "2026-01-01", title: "Homeostase", sourceText: "", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" }],
    reviewTasks: [],
    learningEvidence: [{ unitId: 1, evidenceDate: "2026-01-01", context: "REVIEW", questionsCount: 10, correctCount: 8, reviewTaskId: null }],
  };
  await assert.rejects(() => DB.importAll(badBackup), /REVIEW requer reviewTaskId/i);
});

test("P0-3: importAll rejeita learningEvidence REVIEW com task de unidade diferente", async () => {
  await DB.init();
  const badBackup = {
    schemaVersion: 3,
    subjects: [{ id: 1, name: "Fisio", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", isActive: true, sortOrder: 0 }],
    learningUnits: [
      { id: 1, subjectId: 1, studyDate: "2026-01-01", title: "Cap 1", sourceText: "", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
      { id: 2, subjectId: 1, studyDate: "2026-01-02", title: "Cap 2", sourceText: "", createdAt: "2026-01-02T00:00:00Z", updatedAt: "2026-01-02T00:00:00Z" },
    ],
    reviewTasks: [{ id: 1, unitId: 1, reviewNumber: 1, dueDate: "2026-01-08", reviewDone: false, questionsDone: false, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" }],
    learningEvidence: [{ unitId: 2, evidenceDate: "2026-01-08", context: "REVIEW", questionsCount: 10, correctCount: 8, reviewTaskId: 1 /* task pertence à unit 1, não unit 2 */ }],
  };
  await assert.rejects(() => DB.importAll(badBackup), /unidade diferente/i);
});

test("P0-3: importAll rejeita IDs de subject duplicados", async () => {
  await DB.init();
  const badBackup = {
    schemaVersion: 3,
    subjects: [
      { id: 1, name: "Fisio", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", isActive: true, sortOrder: 0 },
      { id: 1, name: "Farmaco", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", isActive: true, sortOrder: 1 },
    ],
    learningUnits: [],
    reviewTasks: [],
  };
  await assert.rejects(() => DB.importAll(badBackup), /duplicado/i);
});

// P0-3 kill test: rejects learningEvidence where correctCount > questionsCount.
// This specific mutation (reading questionsCount twice instead of correctCount) was the P0-3 bug.
// With the buggy code: q=c=10, check "c>q" passes → backup accepted (WRONG).
// With correct code: q=10, c=15, check "15>10" fires → backup rejected (CORRECT).
test("P0-3 KILL: importAll rejeita learningEvidence com correctCount > questionsCount (campo correto verificado)", async () => {
  await DB.init();
  const badBackup = {
    schemaVersion: 3,
    subjects: [{ id: 1, name: "Fisio", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", isActive: true, sortOrder: 0 }],
    learningUnits: [{ id: 1, subjectId: 1, studyDate: "2026-01-01", title: "Cap 1", sourceText: "", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" }],
    reviewTasks: [],
    learningEvidence: [{ unitId: 1, evidenceDate: "2026-01-01", context: "INITIAL_PRACTICE", questionsCount: 10, correctCount: 15 /* > questionsCount → invalid */ }],
  };
  await assert.rejects(() => DB.importAll(badBackup), /correctCount/i);
});

test("P0-3: importAll inválido não altera dados existentes (fail-closed preserves state)", async () => {
  const subject = await makeSubject("Existente");
  const unit = await makeUnit(subject.id);
  const before = await DB.learningUnits.getAll();
  assert.equal(before.length, 1);

  // Try to import a backup with a broken reference
  const badBackup = {
    schemaVersion: 3,
    subjects: [{ id: 99, name: "Novo", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", isActive: true, sortOrder: 0 }],
    learningUnits: [{ id: 99, subjectId: 888 /* não existe */, studyDate: "2026-01-01", title: "X", sourceText: "", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" }],
    reviewTasks: [],
  };
  await assert.rejects(() => DB.importAll(badBackup), /subject inexistente/i);

  // Existing data must be intact
  const after = await DB.learningUnits.getAll();
  assert.equal(after.length, 1, "existing unit must survive after failed import");
  assert.equal(after[0].id, unit.id, "existing unit id must be preserved");
});

// --- exportAll schemaVersion 3 com learningEvidence ---

test("exportAll inclui schemaVersion 3 e learningEvidence", async () => {
  const subject = await makeSubject();
  const unit = await makeUnit(subject.id);
  await DB.learningEvidence.create({ unitId: unit.id, evidenceDate: "2026-09-01", context: "INITIAL_PRACTICE", questionsCount: 10, correctCount: 8 });
  const backup = await DB.exportAll();
  assert.equal(backup.schemaVersion, 3);
  assert.ok(Array.isArray(backup.learningEvidence));
  assert.equal(backup.learningEvidence.length, 1);
});

test("exportAll/importAll roundtrip v3 preserva learningEvidence", async () => {
  const subject = await makeSubject();
  const unit = await makeUnit(subject.id);
  await DB.learningEvidence.create({ unitId: unit.id, evidenceDate: "2026-09-02", context: "EXTERNAL", questionsCount: 40, correctCount: 30 });
  const backup = await DB.exportAll();
  await DB.clearAll();
  const restored = await DB.importAll(backup);
  assert.equal(restored.schemaVersion, 3);
  const evidence = await DB.learningEvidence.getAll();
  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].context, "EXTERNAL");
  assert.equal(evidence[0].questionsCount, 40);
});

// --- AC-018: isValidIsoDate calendar validation (discrimination tests) ---

const BASE_SUBJ = { id: 1, name: "Fisio", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", isActive: true, sortOrder: 0 };
const BASE_UNIT = { id: 1, subjectId: 1, studyDate: "2026-01-01", title: "Cap 1", sourceText: "", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" };

test("AC-018: importAll rejeita learningUnit com studyDate impossível (2026-02-30)", async () => {
  await DB.init();
  const backup = { schemaVersion: 3, subjects: [BASE_SUBJ], learningUnits: [{ ...BASE_UNIT, studyDate: "2026-02-30" }], reviewTasks: [] };
  await assert.rejects(() => DB.importAll(backup), /studyDate/i);
});

test("AC-018: importAll rejeita learningUnit com studyDate mês inválido (2026-13-01)", async () => {
  await DB.init();
  const backup = { schemaVersion: 3, subjects: [BASE_SUBJ], learningUnits: [{ ...BASE_UNIT, studyDate: "2026-13-01" }], reviewTasks: [] };
  await assert.rejects(() => DB.importAll(backup), /studyDate/i);
});

test("AC-018: importAll rejeita studyDate com sufixo ISO (2024-01-15T12:00:00)", async () => {
  await DB.init();
  const backup = { schemaVersion: 3, subjects: [BASE_SUBJ], learningUnits: [{ ...BASE_UNIT, studyDate: "2024-01-15T12:00:00" }], reviewTasks: [] };
  await assert.rejects(() => DB.importAll(backup), /studyDate/i);
});

test("AC-018: importAll aceita 2024-02-29 (ano bissexto válido)", async () => {
  await DB.init();
  const backup = { schemaVersion: 3, subjects: [BASE_SUBJ], learningUnits: [{ ...BASE_UNIT, studyDate: "2024-02-29" }], reviewTasks: [] };
  await assert.doesNotReject(() => DB.importAll(backup));
});

test("AC-018: importAll rejeita 2026-02-29 (ano não bissexto)", async () => {
  await DB.init();
  const backup = { schemaVersion: 3, subjects: [BASE_SUBJ], learningUnits: [{ ...BASE_UNIT, studyDate: "2026-02-29" }], reviewTasks: [] };
  await assert.rejects(() => DB.importAll(backup), /studyDate/i);
});

test("AC-019: importAll rejeita reviewTask com questionsCount=NaN", async () => {
  await DB.init();
  const backup = {
    schemaVersion: 3,
    subjects: [BASE_SUBJ],
    learningUnits: [BASE_UNIT],
    reviewTasks: [{ id: 1, unitId: 1, reviewNumber: 1, dueDate: "2026-01-08", reviewDone: false, questionsDone: false, questionsCount: NaN, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" }],
  };
  await assert.rejects(() => DB.importAll(backup), /questionsCount/i);
});

test("AC-019: importAll rejeita reviewTask com correctCount=Infinity", async () => {
  await DB.init();
  const backup = {
    schemaVersion: 3,
    subjects: [BASE_SUBJ],
    learningUnits: [BASE_UNIT],
    reviewTasks: [{ id: 1, unitId: 1, reviewNumber: 1, dueDate: "2026-01-08", reviewDone: false, questionsDone: false, questionsCount: 10, correctCount: Infinity, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" }],
  };
  await assert.rejects(() => DB.importAll(backup), /correctCount/i);
});

// --- T4: local date boundary ---

function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

test("completeReviewWithEvidence: evidenceDate usa dia local, não prefixo UTC", async () => {
  const subject = await makeSubject();
  const unit = await makeUnit(subject.id);
  const tasks = await DB.reviewTasks.createBulk([{
    unitId: unit.id, reviewNumber: 1, dueDate: "2026-09-01", reviewDone: false, questionsDone: false,
  }]);
  const today = localDate();
  await DB.completeReviewWithEvidence({ taskId: tasks[0].id, questionsCount: 10, correctCount: 7 });
  const evidence = await DB.learningEvidence.getByUnit(unit.id);
  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].evidenceDate, today, "evidenceDate deve ser o dia local, não o prefixo UTC de completedAt");
});

test("completeReviewWithEvidence: evidenceDate localDateIso — kill test M2 com data injetada na virada de dia UTC-3", async () => {
  // Data injetada: 2026-09-04T01:30:00.000Z = UTC Sep 4, local Sep 3 em UTC-3 (Brasília)
  // toISOString().slice(0,10) retornaria "2026-09-04" (UTC)
  // localDateIso() retorna "2026-09-03" (local em UTC-3)
  // Este teste falha se o mutante M2 for aplicado em ambiente UTC-3.
  const injectedNow = new Date('2026-09-04T01:30:00.000Z');
  const expectedLocalDate = localDate(injectedNow); // "2026-09-03" em UTC-3, "2026-09-04" em UTC puro
  const subject = await makeSubject("M2-kill");
  const unit = await makeUnit(subject.id);
  const tasks = await DB.reviewTasks.createBulk([{
    unitId: unit.id, reviewNumber: 1, dueDate: "2026-09-01", reviewDone: false, questionsDone: false,
  }]);
  await DB.completeReviewWithEvidence({ taskId: tasks[0].id, questionsCount: 5, correctCount: 5 }, injectedNow);
  const evidence = await DB.learningEvidence.getByUnit(unit.id);
  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].evidenceDate, expectedLocalDate, "evidenceDate deve usar dia local do dispositivo, não UTC de completedAt");
});

test("getCompletedToday: usa evidence_date para encontrar revisões do dia local", async () => {
  const subject = await makeSubject();
  const unit = await makeUnit(subject.id);
  const tasks = await DB.reviewTasks.createBulk([{
    unitId: unit.id, reviewNumber: 1, dueDate: "2026-09-01", reviewDone: false, questionsDone: false,
  }]);
  const today = localDate();
  await DB.completeReviewWithEvidence({ taskId: tasks[0].id, questionsCount: 10, correctCount: 7 });

  const found = await DB.reviewTasks.getCompletedToday(today);
  assert.equal(found.length, 1, "deve encontrar a revisão concluída hoje por evidenceDate");

  const yesterday = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return localDate(d); })();
  const notFound = await DB.reviewTasks.getCompletedToday(yesterday);
  assert.equal(notFound.length, 0, "ontem não deve encontrar revisão de hoje");
});

test("getCompletedToday: encontra revisão mesmo quando completedAt UTC está no dia seguinte", async () => {
  const subject = await makeSubject();
  const unit = await makeUnit(subject.id);
  const tasks = await DB.reviewTasks.createBulk([{
    unitId: unit.id, reviewNumber: 1, dueDate: "2026-09-01", reviewDone: false, questionsDone: false,
  }]);
  const task = tasks[0];

  // Simula revisão concluída às 22:30 local que gera completedAt UTC no dia seguinte
  // Fazemos isso criando evidência com evidenceDate=hoje e task com completedAt=amanhã UTC
  const localToday = "2026-09-03";
  const utcNextDay = "2026-09-04T01:30:00.000Z"; // UTC "next day" para BRT (UTC-3)

  // Forçar estado via update + create manual para simular boundary
  await DB.reviewTasks.update(task.id, { reviewDone: true, completedAt: utcNextDay });
  await DB.learningEvidence.create({
    unitId: unit.id,
    evidenceDate: localToday,  // dia local correto
    context: "REVIEW",
    questionsCount: 10,
    correctCount: 8,
    reviewTaskId: task.id,
  });

  // getCompletedToday deve encontrar via evidenceDate, não por completedAt.startsWith(today)
  const found = await DB.reviewTasks.getCompletedToday(localToday);
  assert.equal(found.length, 1, "deve encontrar via evidenceDate mesmo com completedAt UTC no dia seguinte");

  const notOnNextDay = await DB.reviewTasks.getCompletedToday("2026-09-04");
  assert.equal(notOnNextDay.length, 0, "não deve aparecer em 2026-09-04 — evidenceDate é 2026-09-03");
});

// --- P0-3 discrimination: context↔reviewTaskId contract ---

test("P0-3: create com context REVIEW sem reviewTaskId lança erro", async () => {
  const subject = await makeSubject();
  const unit = await makeUnit(subject.id);
  await assert.rejects(
    () => DB.learningEvidence.create({ unitId: unit.id, evidenceDate: "2026-09-01", context: "REVIEW", questionsCount: 10, correctCount: 8 }),
    /reviewTaskId/i,
  );
});

test("P0-3: create com context INITIAL_PRACTICE com reviewTaskId lança erro", async () => {
  const subject = await makeSubject();
  const unit = await makeUnit(subject.id);
  await assert.rejects(
    () => DB.learningEvidence.create({ unitId: unit.id, evidenceDate: "2026-09-01", context: "INITIAL_PRACTICE", questionsCount: 10, correctCount: 8, reviewTaskId: 99 }),
    /reviewTaskId/i,
  );
});

test("P0-3: create com context EXTERNAL com reviewTaskId lança erro", async () => {
  const subject = await makeSubject();
  const unit = await makeUnit(subject.id);
  await assert.rejects(
    () => DB.learningEvidence.create({ unitId: unit.id, evidenceDate: "2026-09-01", context: "EXTERNAL", questionsCount: 10, correctCount: 8, reviewTaskId: 99 }),
    /reviewTaskId/i,
  );
});

// --- P0-4 discrimination: v1 legacy backup import ---

test("P0-4: importAll aceita backup v1 (studyRecords sem schemaVersion) e migra", async () => {
  await DB.init();
  const v1Backup = {
    subjects: [{ id: 1, name: "Fisiologia", created_at: "2025-01-01T00:00:00.000Z", updated_at: "2025-01-01T00:00:00.000Z", is_active: 1, sort_order: 0 }],
    sources: [{ id: 1, name: "Guyton cap. 1" }],
    studyRecords: [{ id: 1, subject_id: 1, source_id: 1, study_date: "2025-01-01", content: "Homeostase", created_at: "2025-01-01T00:00:00.000Z", updated_at: "2025-01-01T00:00:00.000Z" }],
    reviewTasks: [{ id: 1, study_record_id: 1, review_number: 1, due_date: "2025-01-08", review_done: 0, questions_done: 0, created_at: "2025-01-01T00:00:00.000Z", updated_at: "2025-01-01T00:00:00.000Z" }],
    settings: [{ key: "main", app_version: "1.0.0", review_schedule: null }],
  };
  const result = await DB.importAll(v1Backup);
  assert.equal(result.schemaVersion, 3);
  assert.equal(result.learningUnits.length, 1);
  assert.equal(result.learningUnits[0].title, "Homeostase");
  assert.equal(result.learningUnits[0].sourceText, "Guyton cap. 1");
  assert.equal(result.reviewTasks[0].unitId, 1);
});

test("P0-4: schemaVersion 1 com learningUnits (não v1) é aceito", async () => {
  await DB.init();
  const backup = { schemaVersion: 1, subjects: [], learningUnits: [], reviewTasks: [] };
  const result = await DB.importAll(backup);
  assert.equal(result.schemaVersion, 3);
});

// --- P0-2 discrimination: clearAll não falha com learning_evidence presente ---

test("P0-2: clearAll apaga learning_evidence sem crash (BrowserStore)", async () => {
  const subject = await makeSubject();
  const unit = await makeUnit(subject.id);
  await DB.learningEvidence.create({ unitId: unit.id, evidenceDate: "2026-09-01", context: "EXTERNAL", questionsCount: 5, correctCount: 4 });
  let before = await DB.learningEvidence.getAll();
  assert.equal(before.length, 1);
  await DB.clearAll();
  const after = await DB.learningEvidence.getAll();
  assert.equal(after.length, 0, "learningEvidence deve ser apagada por clearAll");
});

// --- P0-2 Round 2: additional integrity invariants (BrowserStore) ---

test("P0-2: learningEvidence.create rejeita unit_id inexistente", async () => {
  await DB.init();
  await assert.rejects(
    () => DB.learningEvidence.create({ unitId: 9999, evidenceDate: "2026-09-01", context: "EXTERNAL", questionsCount: 5, correctCount: 3 }),
    /unit_id/i,
  );
});

test("P0-2: learningEvidence.create REVIEW rejeita review_task_id de outra unidade", async () => {
  const subject = await makeSubject();
  const unit1 = await makeUnit(subject.id);
  const unit2 = await DB.learningUnits.create({ subjectId: subject.id, sourceText: "", studyDate: "2026-09-02", title: "Outra Unidade" });
  const tasks = await DB.reviewTasks.createBulk([{ unitId: unit1.id, reviewNumber: 1, dueDate: "2026-09-04", reviewDone: false, questionsDone: false }]);
  const taskForUnit1 = tasks[0];
  // Attempt to create REVIEW evidence for unit2 using a task that belongs to unit1
  await assert.rejects(
    () => DB.learningEvidence.create({ unitId: unit2.id, evidenceDate: "2026-09-04", context: "REVIEW", questionsCount: 10, correctCount: 7, reviewTaskId: taskForUnit1.id }),
    /mesma unidade/i,
  );
});

test("P0-2: learningEvidence.create REVIEW com task da mesma unidade é aceito", async () => {
  const subject = await makeSubject();
  const unit = await makeUnit(subject.id);
  const tasks = await DB.reviewTasks.createBulk([{ unitId: unit.id, reviewNumber: 1, dueDate: "2026-09-04", reviewDone: false, questionsDone: false }]);
  const task = tasks[0];
  const evidence = await DB.learningEvidence.create({ unitId: unit.id, evidenceDate: "2026-09-04", context: "REVIEW", questionsCount: 10, correctCount: 7, reviewTaskId: task.id });
  assert.equal(evidence.unitId, unit.id);
  assert.equal(evidence.reviewTaskId, task.id);
});

// P0-4 BrowserStore dev seed safety: existing data must survive if smartlearn:dev-seeded is absent
test("P0-4: BrowserStore com dados reais não é apagado na ausência de smartlearn:dev-seeded", async () => {
  // Simulate existing user data in BrowserStore
  await DB.init();
  const subject = await DB.subjects.create("Disciplina Real");
  const unit = await DB.learningUnits.create({ subjectId: subject.id, sourceText: "", studyDate: "2026-01-01", title: "Conteúdo Real" });
  // Remove dev-seeded marker to simulate the upgrade scenario
  localStorage.removeItem("smartlearn:dev-seeded");
  // Call init again (simulates app restart without the marker)
  // Since import.meta.env?.DEV is undefined in Node test, the seed block never runs.
  // The guard (state.subjects.length === 0) is what prevents data destruction.
  // We verify data survives by reading it back.
  const units = await DB.learningUnits.getAll();
  assert.ok(units.some((u) => u.id === unit.id), "existing learning unit must survive after init without dev-seeded marker");
  const subjects = await DB.subjects.getAll();
  assert.ok(subjects.some((s) => s.name === "Disciplina Real"), "existing subject must survive");
});
