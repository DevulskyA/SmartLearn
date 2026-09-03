import test from "node:test";
import assert from "node:assert/strict";

// Polyfill localStorage for node:test environment
const store = {};
globalThis.localStorage = {
  getItem: (key) => store[key] ?? null,
  setItem: (key, value) => { store[key] = value; },
  removeItem: (key) => { delete store[key]; },
  clear: () => { for (const k of Object.keys(store)) delete store[k]; },
};

// Reset localStorage before each test
test.beforeEach(() => { localStorage.clear(); });

// createBrowserStore is not exported directly — we test via DB using the
// browser path (no Tauri runtime in node:test). We simulate by importing
// db.js after the polyfill is in place and calling DB.init() which detects
// the absence of __TAURI_INTERNALS__ and falls back to createBrowserStore().
// Note: DB is a singleton; we re-init via the internal init path by clearing
// the module cache indirectly — instead we test createBrowserStore logic
// by isolating it. Since it's not exported, we extract it via the DB facade.

const { DB } = await import("../src/db.js");

test("BrowserStore studyRecords.create persiste summaryBody não-nulo", async () => {
  await DB.init();

  const [subject] = await DB.subjects.getActive();
  const [source] = await DB.sources.getActive();

  const record = await DB.studyRecords.create({
    subjectId: subject.id,
    sourceId: source.id,
    studyDate: "2026-09-02",
    content: "Cardiology basics",
    summaryBody: "Frank-Starling law: more stretch → more force",
  });

  assert.equal(record.summaryBody, "Frank-Starling law: more stretch → more force");

  const all = await DB.studyRecords.getAll();
  const found = all.find((r) => r.id === record.id);
  assert.equal(found.summaryBody, "Frank-Starling law: more stretch → more force");
});

test("BrowserStore studyRecords.create persiste summaryBody nulo quando ausente", async () => {
  await DB.init();

  const [subject] = await DB.subjects.getActive();
  const [source] = await DB.sources.getActive();

  const record = await DB.studyRecords.create({
    subjectId: subject.id,
    sourceId: source.id,
    studyDate: "2026-09-02",
    content: "Sem resumo",
  });

  assert.equal(record.summaryBody, null);
});

test("BrowserStore studyRecords.update atualiza summaryBody", async () => {
  await DB.init();

  const [subject] = await DB.subjects.getActive();
  const [source] = await DB.sources.getActive();

  const record = await DB.studyRecords.create({
    subjectId: subject.id,
    sourceId: source.id,
    studyDate: "2026-09-02",
    content: "Conteúdo",
    summaryBody: null,
  });

  const updated = await DB.studyRecords.update(record.id, {
    summaryBody: "Resumo adicionado depois",
  });

  assert.equal(updated.summaryBody, "Resumo adicionado depois");
});

test("BrowserStore exportAll/importAll preserva summaryBody", async () => {
  await DB.init();

  const [subject] = await DB.subjects.getActive();
  const [source] = await DB.sources.getActive();

  await DB.studyRecords.create({
    subjectId: subject.id,
    sourceId: source.id,
    studyDate: "2026-09-02",
    content: "Backup test",
    summaryBody: "Resumo para backup",
  });

  const backup = await DB.exportAll();
  assert.ok(backup.studyRecords.some((r) => r.summaryBody === "Resumo para backup"));

  await DB.importAll(backup);

  const afterImport = await DB.studyRecords.getAll();
  assert.ok(afterImport.some((r) => r.summaryBody === "Resumo para backup"));
});

test("BrowserStore importAll com registro sem summaryBody usa null (backward compat)", async () => {
  await DB.init();

  const [subject] = await DB.subjects.getActive();
  const [source] = await DB.sources.getActive();

  const record = await DB.studyRecords.create({
    subjectId: subject.id,
    sourceId: source.id,
    studyDate: "2026-09-02",
    content: "Antigo",
  });

  const backup = await DB.exportAll();
  // Simulate old backup without summaryBody field
  const oldBackup = {
    ...backup,
    studyRecords: backup.studyRecords.map(({ summaryBody: _dropped, ...rest }) => rest),
  };

  await DB.importAll(oldBackup);

  const afterImport = await DB.studyRecords.getAll();
  const found = afterImport.find((r) => r.id === record.id);
  assert.equal(found.summaryBody, null);
});

test("BrowserStore studyRecords.create com summaryBody '' armazena null (AC5 LVN-01)", async () => {
  await DB.init();

  const [subject] = await DB.subjects.getActive();
  const [source] = await DB.sources.getActive();

  const record = await DB.studyRecords.create({
    subjectId: subject.id,
    sourceId: source.id,
    studyDate: "2026-09-02",
    content: "Conteúdo",
    summaryBody: "",
  });

  assert.equal(record.summaryBody, null);
});

test("BrowserStore getByDate retorna estudos com a data dada", async () => {
  await DB.init();

  const [subject] = await DB.subjects.getActive();
  const [source] = await DB.sources.getActive();

  await DB.studyRecords.create({
    subjectId: subject.id,
    sourceId: source.id,
    studyDate: "2026-09-02",
    content: "Estudo A",
  });
  await DB.studyRecords.create({
    subjectId: subject.id,
    sourceId: source.id,
    studyDate: "2026-09-02",
    content: "Estudo B",
  });
  await DB.studyRecords.create({
    subjectId: subject.id,
    sourceId: source.id,
    studyDate: "2026-09-03",
    content: "Outro dia",
  });

  const results = await DB.studyRecords.getByDate("2026-09-02");
  assert.equal(results.length, 2);
  assert.ok(results.every((r) => r.studyDate === "2026-09-02"));
});

test("BrowserStore getByDate retorna [] para data sem estudos", async () => {
  await DB.init();

  const results = await DB.studyRecords.getByDate("2099-01-01");
  assert.deepEqual(results, []);
});
