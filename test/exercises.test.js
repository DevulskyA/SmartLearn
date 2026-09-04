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

async function makeLearningUnit() {
  await DB.init();
  const subject = await DB.subjects.create("Fisiologia");
  return DB.learningUnits.create({
    subjectId: subject.id,
    sourceText: "Guyton & Hall, cap. 1",
    studyDate: "2026-09-02",
    title: "Base de testes",
  });
}

test("DB.exercises.create persiste e getAll retorna o item", async () => {
  const unit = await makeLearningUnit();

  const exercise = await DB.exercises.create(unit.id, {
    questionText: "Qual é a lei de Frank-Starling?",
    answerText: "Mais estiramento → mais força de contração",
    hintText: "Pré-carga cardíaca",
    provenance: "SOURCE",
  });

  assert.ok(exercise.id > 0);
  assert.equal(exercise.questionText, "Qual é a lei de Frank-Starling?");
  assert.equal(exercise.hintText, "Pré-carga cardíaca");
  assert.equal(exercise.provenance, "SOURCE");
  assert.equal(exercise.unitId, unit.id);

  const all = await DB.exercises.getAll(unit.id);
  assert.equal(all.length, 1);
  assert.equal(all[0].id, exercise.id);
});

test("DB.exercises.create sem provenance lança erro", async () => {
  const unit = await makeLearningUnit();
  await assert.rejects(
    () => DB.exercises.create(unit.id, { questionText: "Q", answerText: "R" }),
    /provenance/i,
  );
});

test("DB.exercises.create com provenance inválido lança erro", async () => {
  const unit = await makeLearningUnit();
  await assert.rejects(
    () => DB.exercises.create(unit.id, { questionText: "Q", answerText: "R", provenance: "UNKNOWN" }),
    /provenance/i,
  );
});

test("DB.exercises.create aceita MANUAL, SOURCE, AI_GENERATED", async () => {
  const unit = await makeLearningUnit();
  const e1 = await DB.exercises.create(unit.id, { questionText: "Q1", answerText: "R", provenance: "MANUAL" });
  const e2 = await DB.exercises.create(unit.id, { questionText: "Q2", answerText: "R", provenance: "SOURCE" });
  const e3 = await DB.exercises.create(unit.id, { questionText: "Q3", answerText: "R", provenance: "AI_GENERATED" });
  assert.equal(e1.provenance, "MANUAL");
  assert.equal(e2.provenance, "SOURCE");
  assert.equal(e3.provenance, "AI_GENERATED");
});

test("DB.exercises.getAll retorna apenas exercises da unidade especificada", async () => {
  const unit1 = await makeLearningUnit();
  const subject2 = await DB.subjects.create("Bioquímica");
  const unit2 = await DB.learningUnits.create({
    subjectId: subject2.id,
    sourceText: "Lehninger, cap. 2",
    studyDate: "2026-09-03",
    title: "Outro estudo",
  });

  await DB.exercises.create(unit1.id, { questionText: "Q do estudo 1", answerText: "R1", provenance: "MANUAL" });
  await DB.exercises.create(unit2.id, { questionText: "Q do estudo 2", answerText: "R2", provenance: "MANUAL" });

  const all1 = await DB.exercises.getAll(unit1.id);
  const all2 = await DB.exercises.getAll(unit2.id);
  assert.equal(all1.length, 1);
  assert.equal(all2.length, 1);
  assert.equal(all1[0].questionText, "Q do estudo 1");
  assert.equal(all2[0].questionText, "Q do estudo 2");
});

test("DB.exercises.create com questionText vazio lança erro", async () => {
  const unit = await makeLearningUnit();
  await assert.rejects(
    () => DB.exercises.create(unit.id, { questionText: "", answerText: "R", provenance: "MANUAL" }),
    /enunciado/i,
  );
});

test("DB.exercises.delete remove apenas o exercise; learning_unit e outros exercises intactos", async () => {
  const unit = await makeLearningUnit();

  const ex1 = await DB.exercises.create(unit.id, { questionText: "Q1", answerText: "R1", provenance: "MANUAL" });
  const ex2 = await DB.exercises.create(unit.id, { questionText: "Q2", answerText: "R2", provenance: "MANUAL" });

  await DB.exercises.delete(ex1.id);

  const remaining = await DB.exercises.getAll(unit.id);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].id, ex2.id);

  const all = await DB.learningUnits.getAll();
  assert.ok(all.some((u) => u.id === unit.id));
});

test("deleteIfEmpty: subject com exercises não pode ser excluída (histórico protegido)", async () => {
  const unit = await makeLearningUnit();
  await DB.exercises.create(unit.id, { questionText: "Q cascade", answerText: "R", provenance: "MANUAL" });

  await assert.rejects(
    () => DB.subjects.deleteIfEmpty(unit.subjectId),
    /excluir|histórico|unidade|unit/i,
  );

  const remaining = await DB.exercises.getAll(unit.id);
  assert.equal(remaining.length, 1, "exercise deve ser preservado");
});

test("exportAll inclui exercises; importAll roundtrip preserva exercises e provenance", async () => {
  const unit = await makeLearningUnit();
  await DB.exercises.create(unit.id, {
    questionText: "Q exportada",
    answerText: "R exportada",
    hintText: "Dica exportada",
    provenance: "AI_GENERATED",
  });

  const backup = await DB.exportAll();
  assert.ok(Array.isArray(backup.exercises));
  assert.ok(backup.exercises.some((e) => e.questionText === "Q exportada" && e.provenance === "AI_GENERATED"));

  await DB.importAll(backup);

  const allUnits = await DB.learningUnits.getAll();
  const importedUnit = allUnits.find((u) => u.title === "Base de testes");
  assert.ok(importedUnit, "learning_unit deve existir após import");

  const imported = await DB.exercises.getAll(importedUnit.id);
  assert.ok(imported.some((e) => e.questionText === "Q exportada" && e.provenance === "AI_GENERATED"));
});

test("DB.exercises.update atualiza apenas os campos passados, preserva os demais", async () => {
  const unit = await makeLearningUnit();
  const exercise = await DB.exercises.create(unit.id, {
    questionText: "Qual é a Lei de Frank-Starling?",
    answerText: "Mais pré-carga → mais força",
    hintText: "Pré-carga",
    provenance: "SOURCE",
  });

  const updated = await DB.exercises.update(exercise.id, { answerText: "Estiramento → força" });

  assert.equal(updated.answerText, "Estiramento → força");
  assert.equal(updated.questionText, "Qual é a Lei de Frank-Starling?");
  assert.equal(updated.hintText, "Pré-carga");
  assert.equal(updated.provenance, "SOURCE");
});

test("DB.exercises.getAll retorna exercises em ordem de position ASC, id ASC", async () => {
  const unit = await makeLearningUnit();

  const ex1 = await DB.exercises.create(unit.id, { questionText: "Q pos 2", answerText: "R", position: 2, provenance: "MANUAL" });
  const ex2 = await DB.exercises.create(unit.id, { questionText: "Q pos 1", answerText: "R", position: 1, provenance: "MANUAL" });
  const ex3 = await DB.exercises.create(unit.id, { questionText: "Q pos 0", answerText: "R", position: 0, provenance: "MANUAL" });

  const all = await DB.exercises.getAll(unit.id);
  assert.equal(all.length, 3);
  assert.equal(all[0].id, ex3.id);
  assert.equal(all[1].id, ex2.id);
  assert.equal(all[2].id, ex1.id);
});

test("importAll com exercises como não-array trata como [] sem crash", async () => {
  await DB.init();
  const backup = await DB.exportAll();
  const corruptBackup = { ...backup, exercises: {} };

  await assert.doesNotReject(() => DB.importAll(corruptBackup));

  const allUnits = await DB.learningUnits.getAll();
  for (const u of allUnits) {
    const exs = await DB.exercises.getAll(u.id);
    assert.equal(exs.length, 0);
  }
});

test("importAll sem exercises importa com 0 exercises, sem erro", async () => {
  const unit = await makeLearningUnit();
  await DB.exercises.create(unit.id, { questionText: "Q a ser descartada", answerText: "R", provenance: "MANUAL" });

  const backup = await DB.exportAll();
  const backupWithoutExercises = { ...backup };
  delete backupWithoutExercises.exercises;

  await DB.importAll(backupWithoutExercises);

  const allUnits = await DB.learningUnits.getAll();
  const importedUnit = allUnits.find((u) => u.title === "Base de testes");
  const imported = await DB.exercises.getAll(importedUnit.id);
  assert.equal(imported.length, 0);
});
