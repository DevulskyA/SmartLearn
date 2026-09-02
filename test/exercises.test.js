import test from "node:test";
import assert from "node:assert/strict";

// localStorage polyfill for node:test (separate store from study-records.test.js)
const store = {};
globalThis.localStorage = {
  getItem: (key) => store[key] ?? null,
  setItem: (key, value) => { store[key] = value; },
  removeItem: (key) => { delete store[key]; },
  clear: () => { for (const k of Object.keys(store)) delete store[k]; },
};

test.beforeEach(() => { localStorage.clear(); });

const { DB } = await import("../src/db.js");

async function makeStudyRecord() {
  await DB.init();
  const [subject] = await DB.subjects.getActive();
  const [source] = await DB.sources.getActive();
  return DB.studyRecords.create({
    subjectId: subject.id,
    sourceId: source.id,
    studyDate: "2026-09-02",
    content: "Base de testes",
  });
}

test("DB.exercises.create persiste e getAll retorna o item", async () => {
  const record = await makeStudyRecord();

  const exercise = await DB.exercises.create(record.id, {
    questionText: "Qual é a lei de Frank-Starling?",
    answerText: "Mais estiramento → mais força de contração",
    hintText: "Pré-carga cardíaca",
  });

  assert.ok(exercise.id > 0);
  assert.equal(exercise.questionText, "Qual é a lei de Frank-Starling?");
  assert.equal(exercise.hintText, "Pré-carga cardíaca");

  const all = await DB.exercises.getAll(record.id);
  assert.equal(all.length, 1);
  assert.equal(all[0].id, exercise.id);
});

test("DB.exercises.getAll retorna apenas exercises do estudo especificado", async () => {
  const record1 = await makeStudyRecord();
  const [subject] = await DB.subjects.getActive();
  const [source] = await DB.sources.getActive();
  const record2 = await DB.studyRecords.create({
    subjectId: subject.id,
    sourceId: source.id,
    studyDate: "2026-09-03",
    content: "Outro estudo",
  });

  await DB.exercises.create(record1.id, { questionText: "Q do estudo 1", answerText: "R1" });
  await DB.exercises.create(record2.id, { questionText: "Q do estudo 2", answerText: "R2" });

  const all1 = await DB.exercises.getAll(record1.id);
  const all2 = await DB.exercises.getAll(record2.id);
  assert.equal(all1.length, 1);
  assert.equal(all2.length, 1);
  assert.equal(all1[0].questionText, "Q do estudo 1");
  assert.equal(all2[0].questionText, "Q do estudo 2");
});

test("DB.exercises.create com questionText vazio lança erro", async () => {
  const record = await makeStudyRecord();
  await assert.rejects(
    () => DB.exercises.create(record.id, { questionText: "", answerText: "R" }),
    /enunciado/i,
  );
});

test("DB.exercises.delete remove apenas o exercise; study_record e outros exercises intactos", async () => {
  const record = await makeStudyRecord();

  const ex1 = await DB.exercises.create(record.id, { questionText: "Q1", answerText: "R1" });
  const ex2 = await DB.exercises.create(record.id, { questionText: "Q2", answerText: "R2" });

  await DB.exercises.delete(ex1.id);

  const remaining = await DB.exercises.getAll(record.id);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].id, ex2.id);

  // study_record still exists
  const all = await DB.studyRecords.getAll();
  assert.ok(all.some((r) => r.id === record.id));
});

test("DELETE CASCADE: deletar study_record via subjects.deleteCascade remove seus exercises", async () => {
  const record = await makeStudyRecord();
  await DB.exercises.create(record.id, { questionText: "Q cascade", answerText: "R" });

  // deleteCascade by subject (removes study_records with subjectId)
  await DB.subjects.deleteCascade(record.subjectId);

  const remaining = await DB.exercises.getAll(record.id);
  assert.equal(remaining.length, 0);
});

test("exportAll inclui exercises; importAll roundtrip preserva exercises", async () => {
  const record = await makeStudyRecord();
  await DB.exercises.create(record.id, {
    questionText: "Q exportada",
    answerText: "R exportada",
    hintText: "Dica exportada",
  });

  const backup = await DB.exportAll();
  assert.ok(Array.isArray(backup.exercises));
  assert.ok(backup.exercises.some((e) => e.questionText === "Q exportada"));

  await DB.importAll(backup);

  const allRecords = await DB.studyRecords.getAll();
  const importedRecord = allRecords.find((r) => r.content === "Base de testes");
  assert.ok(importedRecord, "study_record deve existir após import");

  const imported = await DB.exercises.getAll(importedRecord.id);
  assert.ok(imported.some((e) => e.questionText === "Q exportada"));
});

test("importAll sem exercises importa com 0 exercises, sem erro", async () => {
  const record = await makeStudyRecord();
  await DB.exercises.create(record.id, { questionText: "Q a ser descartada", answerText: "R" });

  const backup = await DB.exportAll();
  const backupWithoutExercises = { ...backup };
  delete backupWithoutExercises.exercises;

  await DB.importAll(backupWithoutExercises);

  const allRecords = await DB.studyRecords.getAll();
  const importedRecord = allRecords.find((r) => r.content === "Base de testes");
  const imported = await DB.exercises.getAll(importedRecord.id);
  assert.equal(imported.length, 0);
});
