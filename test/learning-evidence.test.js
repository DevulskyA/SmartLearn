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
  await DB.learningEvidence.create({
    unitId: unit.id,
    evidenceDate: "2026-09-01",
    context: "REVIEW",
    questionsCount: 10,
    correctCount: 8,
    reviewTaskId: 99,
  });
  await assert.rejects(
    () => DB.learningEvidence.create({
      unitId: unit.id,
      evidenceDate: "2026-09-01",
      context: "REVIEW",
      questionsCount: 5,
      correctCount: 3,
      reviewTaskId: 99,
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
  await DB.learningEvidence.create({ unitId: unit1.id, evidenceDate: "2026-09-01", context: "REVIEW", questionsCount: 10, correctCount: 8 });
  await DB.learningEvidence.create({ unitId: unit2.id, evidenceDate: "2026-09-01", context: "REVIEW", questionsCount: 5, correctCount: 3 });
  const ev1 = await DB.learningEvidence.getByUnit(unit1.id);
  assert.equal(ev1.length, 1);
  assert.equal(ev1[0].unitId, unit1.id);
});

test("learningEvidence.getBySubject retorna evidências de todas as unidades da disciplina", async () => {
  const subject = await makeSubject();
  const unit1 = await makeUnit(subject.id);
  const unit2 = await DB.learningUnits.create({ subjectId: subject.id, sourceText: "", studyDate: "2026-09-01", title: "Outro" });
  await DB.learningEvidence.create({ unitId: unit1.id, evidenceDate: "2026-09-01", context: "REVIEW", questionsCount: 10, correctCount: 8 });
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

test("importAll schemaVersion 1 (muito antigo) lança erro fail-closed", async () => {
  await DB.init();
  await assert.rejects(
    () => DB.importAll({ schemaVersion: 1, subjects: [], learningUnits: [], reviewTasks: [] }),
    /schemaVersion/i,
  );
});

// --- exportAll schemaVersion 3 com learningEvidence ---

test("exportAll inclui schemaVersion 3 e learningEvidence", async () => {
  const subject = await makeSubject();
  const unit = await makeUnit(subject.id);
  await DB.learningEvidence.create({ unitId: unit.id, evidenceDate: "2026-09-01", context: "REVIEW", questionsCount: 10, correctCount: 8 });
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
