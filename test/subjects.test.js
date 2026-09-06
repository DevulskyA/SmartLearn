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

async function setup() {
  await DB.init();
}

async function makeSubject(name = "Fisiologia") {
  await setup();
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

// A — subject vazia pode ser excluída
test("deleteIfEmpty: subject sem learning_units é excluída com sucesso", async () => {
  const subject = await makeSubject();
  const before = await DB.subjects.getAll();
  assert.equal(before.length, 1);

  await DB.subjects.deleteIfEmpty(subject.id);

  const after = await DB.subjects.getAll();
  assert.equal(after.length, 0, "subject deve ser removida");
});

// B — subject com learning_unit é rejeitada
test("deleteIfEmpty: subject com learning_unit lança erro", async () => {
  const subject = await makeSubject();
  await makeUnit(subject.id);

  await assert.rejects(
    () => DB.subjects.deleteIfEmpty(subject.id),
    /excluir|histórico|unidade|unit/i,
  );
});

// C — após reject, contagens inalteradas
test("deleteIfEmpty: após rejeição, subject, units e tasks permanecem intactos", async () => {
  const subject = await makeSubject();
  const unit = await makeUnit(subject.id);
  await DB.reviewTasks.createBulk([{
    unitId: unit.id,
    reviewNumber: 1,
    dueDate: "2026-09-10",
    reviewDone: false,
    questionsDone: false,
  }]);
  await DB.learningEvidence.create({
    unitId: unit.id,
    evidenceDate: "2026-09-01",
    context: "INITIAL_PRACTICE",
    questionsCount: 10,
    correctCount: 8,
  });

  await assert.rejects(
    () => DB.subjects.deleteIfEmpty(subject.id),
    /excluir|histórico|unidade|unit/i,
  );

  const subjects = await DB.subjects.getAll();
  const units = await DB.learningUnits.getAll();
  const tasks = await DB.reviewTasks.getAll();
  const evidence = await DB.learningEvidence.getAll();

  assert.equal(subjects.length, 1, "subject count inalterado");
  assert.equal(units.length, 1, "unit count inalterado");
  assert.equal(tasks.length, 1, "task count inalterado");
  assert.equal(evidence.length, 1, "evidence count inalterado");
});

// D — deleção de subject vazia não deixa orphans (evidência de segurança)
test("deleteIfEmpty: remoção de subject vazia não cria estado inconsistente", async () => {
  const subj1 = await makeSubject("Fisiologia");
  const subj2 = await DB.subjects.create("Bioquímica", "DISC-RED");
  const unit = await makeUnit(subj2.id);
  await DB.learningEvidence.create({
    unitId: unit.id,
    evidenceDate: "2026-09-01",
    context: "INITIAL_PRACTICE",
    questionsCount: 5,
    correctCount: 3,
  });

  // subj1 é vazia; subj2 tem dados
  await DB.subjects.deleteIfEmpty(subj1.id);

  const subjects = await DB.subjects.getAll();
  const units = await DB.learningUnits.getAll();
  const evidence = await DB.learningEvidence.getAll();

  assert.equal(subjects.length, 1, "apenas subj2 permanece");
  assert.equal(units.length, 1, "unit de subj2 preservada");
  assert.equal(evidence.length, 1, "evidência de subj2 preservada");
});

// DISCRIMINATION: AC-028 — line control chars rejected at DB layer (bypass UI validation)
test("subjects.create: nome com \n rejeitado diretamente no adapter sem UI", async () => {
  await setup();
  await assert.rejects(
    () => DB.subjects.create("Semiologia\nMédica", "DISC-BLUE"),
    /quebras de linha/i,
    "DB layer must reject LF even when UI validation is bypassed"
  );
  const all = await DB.subjects.getAll();
  assert.equal(all.length, 0, "no subject created on rejection");
});

test("subjects.create: nome com \r rejeitado diretamente no adapter sem UI", async () => {
  await setup();
  await assert.rejects(
    () => DB.subjects.create("Semiologia\rMédica", "DISC-BLUE"),
    /quebras de linha/i
  );
});

test("DISCRIMINATION: subjects.create: normalização colapsa espaços horizontais mas não rejeita", async () => {
  await setup();
  const subj = await DB.subjects.create("  Semiologia  Médica  ", "DISC-BLUE");
  assert.equal(subj.name, "Semiologia Médica", "borders trimmed and internal spaces collapsed");
});
