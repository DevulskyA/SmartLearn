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

async function makeSubject() {
  await DB.init();
  return DB.subjects.create("Fisiologia");
}

test("learningUnits.create persiste title e sourceText", async () => {
  const subject = await makeSubject();
  const unit = await DB.learningUnits.create({
    subjectId: subject.id,
    sourceText: "Guyton & Hall, cap. 1",
    studyDate: "2026-09-02",
    title: "Organização funcional do corpo humano",
  });
  assert.equal(unit.title, "Organização funcional do corpo humano");
  assert.equal(unit.sourceText, "Guyton & Hall, cap. 1");
  assert.equal(unit.studyDate, "2026-09-02");
  assert.equal(unit.subjectId, subject.id);
});

test("learningUnits.create persiste summaryBody não-nulo", async () => {
  const subject = await makeSubject();
  const unit = await DB.learningUnits.create({
    subjectId: subject.id,
    sourceText: "Guyton & Hall, cap. 1",
    studyDate: "2026-09-02",
    title: "Homeostase",
    summaryBody: "Frank-Starling law: mais estiramento → mais força",
  });
  assert.equal(unit.summaryBody, "Frank-Starling law: mais estiramento → mais força");
  const all = await DB.learningUnits.getAll();
  const found = all.find((u) => u.id === unit.id);
  assert.equal(found.summaryBody, "Frank-Starling law: mais estiramento → mais força");
});

test("learningUnits.create persiste summaryBody nulo quando ausente", async () => {
  const subject = await makeSubject();
  const unit = await DB.learningUnits.create({
    subjectId: subject.id,
    sourceText: "Guyton & Hall, cap. 1",
    studyDate: "2026-09-02",
    title: "Sem resumo",
  });
  assert.equal(unit.summaryBody, null);
});

test("learningUnits.create com summaryBody '' armazena null", async () => {
  const subject = await makeSubject();
  const unit = await DB.learningUnits.create({
    subjectId: subject.id,
    sourceText: "Guyton & Hall, cap. 1",
    studyDate: "2026-09-02",
    title: "Conteúdo",
    summaryBody: "",
  });
  assert.equal(unit.summaryBody, null);
});

test("learningUnits.update atualiza title e summaryBody", async () => {
  const subject = await makeSubject();
  const unit = await DB.learningUnits.create({
    subjectId: subject.id,
    sourceText: "Guyton & Hall, cap. 1",
    studyDate: "2026-09-02",
    title: "Título inicial",
    summaryBody: null,
  });
  const updated = await DB.learningUnits.update(unit.id, {
    summaryBody: "Resumo adicionado depois",
  });
  assert.equal(updated.summaryBody, "Resumo adicionado depois");
});

test("learningUnits.getByDate retorna unidades com a data dada", async () => {
  const subject = await makeSubject();
  await DB.learningUnits.create({ subjectId: subject.id, sourceText: "", studyDate: "2026-09-02", title: "Unidade A" });
  await DB.learningUnits.create({ subjectId: subject.id, sourceText: "", studyDate: "2026-09-02", title: "Unidade B" });
  await DB.learningUnits.create({ subjectId: subject.id, sourceText: "", studyDate: "2026-09-03", title: "Outro dia" });
  const results = await DB.learningUnits.getByDate("2026-09-02");
  assert.equal(results.length, 2);
  assert.ok(results.every((u) => u.studyDate === "2026-09-02"));
});

test("learningUnits.getByDate retorna [] para data sem unidades", async () => {
  await DB.init();
  const results = await DB.learningUnits.getByDate("2099-01-01");
  assert.deepEqual(results, []);
});

test("exportAll inclui schemaVersion 2 e learningUnits", async () => {
  const subject = await makeSubject();
  await DB.learningUnits.create({
    subjectId: subject.id,
    sourceText: "Guyton & Hall, cap. 1",
    studyDate: "2026-09-02",
    title: "Backup test",
    summaryBody: "Resumo para backup",
  });
  const backup = await DB.exportAll();
  assert.equal(backup.schemaVersion, 3);
  assert.ok(Array.isArray(backup.learningUnits));
  assert.ok(backup.learningUnits.some((u) => u.title === "Backup test"));
  assert.ok(backup.learningUnits.some((u) => u.summaryBody === "Resumo para backup"));
});

test("importAll com schemaVersion incorreto lança erro fail-closed", async () => {
  await DB.init();
  const backup = await DB.exportAll();
  const corruptBackup = { ...backup, schemaVersion: 0 };
  await assert.rejects(() => DB.importAll(corruptBackup), /schemaVersion/i);
});

test("importAll sem schemaVersion lança erro fail-closed", async () => {
  await DB.init();
  const backup = await DB.exportAll();
  const { schemaVersion: _dropped, ...noVersion } = backup;
  await assert.rejects(() => DB.importAll(noVersion), /schemaVersion/i);
});

test("exportAll/importAll roundtrip preserva title e summaryBody", async () => {
  const subject = await makeSubject();
  await DB.learningUnits.create({
    subjectId: subject.id,
    sourceText: "Guyton & Hall, cap. 1",
    studyDate: "2026-09-02",
    title: "Organização funcional",
    summaryBody: "Homeostase",
  });
  const backup = await DB.exportAll();
  await DB.importAll(backup);
  const afterImport = await DB.learningUnits.getAll();
  assert.ok(
    afterImport.some((u) => u.title === "Organização funcional" && u.summaryBody === "Homeostase"),
  );
});

test("BrowserStore não tem seeds acadêmicos — subjects começa vazio", async () => {
  await DB.init();
  const subjects = await DB.subjects.getAll();
  assert.equal(subjects.length, 0);
});

// AC-010: single action creates discipline + unit + reviews atomically
test("createWithReviews newSubjectName cria disciplina + aula em uma chamada", async () => {
  await DB.init();
  const task = { reviewNumber: 1, dueDate: "2026-09-06", reviewDone: false, questionsDone: false };
  const unit = await DB.learningUnits.createWithReviews(
    { newSubjectName: "Semiologia Médica", newSubjectColor: "DISC-BLUE",
      sourceText: "", studyDate: "2026-09-05",
      title: "Ausculta Cardíaca — Bulhas e Sopros" },
    [task],
  );
  assert.equal(unit.title, "Ausculta Cardíaca — Bulhas e Sopros");
  const subjects = await DB.subjects.getActive();
  assert.equal(subjects.length, 1);
  assert.equal(subjects[0].name, "Semiologia Médica");
  assert.equal(unit.subjectId, subjects[0].id);
});

// AC-008: equivalent name reuses existing subject ID — no duplicate created
test("createWithReviews newSubjectName equivalente reutiliza subject existente", async () => {
  const existing = await makeSubject(); // "Fisiologia"
  const task = { reviewNumber: 1, dueDate: "2026-09-06", reviewDone: false, questionsDone: false };
  const unit = await DB.learningUnits.createWithReviews(
    { newSubjectName: "Fisiologia", newSubjectColor: "DISC-BLUE",
      sourceText: "", studyDate: "2026-09-05", title: "Aula duplicada" },
    [task],
  );
  const subjects = await DB.subjects.getActive();
  assert.equal(subjects.length, 1, "nenhuma disciplina duplicada criada");
  assert.equal(unit.subjectId, existing.id);
});

// AC-012 discrimination: storage failure before writeState leaves zero records
test("createWithReviews newSubjectName — falha de storage não cria registro parcial", async () => {
  await DB.init();
  const origSetItem = localStorage.setItem.bind(localStorage);
  let callCount = 0;
  localStorage.setItem = (key, value) => {
    callCount++;
    // fail on any write — simulates quota/storage error
    throw new Error("QuotaExceededError simulado");
  };
  const task = { reviewNumber: 1, dueDate: "2026-09-06", reviewDone: false, questionsDone: false };
  try {
    await assert.rejects(
      () => DB.learningUnits.createWithReviews(
        { newSubjectName: "Disciplina Órfã", newSubjectColor: "DISC-BLUE",
          sourceText: "", studyDate: "2026-09-05", title: "Deve rolar" },
        [task],
      ),
      /QuotaExceededError/,
    );
  } finally {
    localStorage.setItem = origSetItem;
  }
  // Restore readable state and verify no records were persisted
  const subjects = await DB.subjects.getAll();
  const units = await DB.learningUnits.getAll();
  assert.equal(subjects.length, 0, "nenhuma disciplina persistida após falha");
  assert.equal(units.length, 0, "nenhuma aula persistida após falha");
});
