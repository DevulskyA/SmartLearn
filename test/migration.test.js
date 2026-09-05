import test from "node:test";
import assert from "node:assert/strict";

import { buildMigrationStatements, BROWSER_STORE_KEY } from "../src/migration.js";

function makeBrowserState({ subjects = [], sources = [], studyRecords = [], reviewTasks = [] } = {}) {
  return { subjects, sources, studyRecords, reviewTasks };
}

test("BROWSER_STORE_KEY is the canonical localStorage key", () => {
  assert.equal(BROWSER_STORE_KEY, "smartlearn:browser-db");
});

test("buildMigrationStatements returns empty array for empty state", () => {
  const stmts = buildMigrationStatements(makeBrowserState());
  assert.equal(stmts.length, 0);
});

test("buildMigrationStatements generates one INSERT per subject", () => {
  const state = makeBrowserState({
    subjects: [{ id: 1, name: "Matemática", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", isActive: true, sortOrder: 0 }],
  });
  const stmts = buildMigrationStatements(state);
  assert.equal(stmts.length, 1);
  assert.ok(stmts[0].sql.startsWith("INSERT OR REPLACE INTO subjects"), "wrong table");
  assert.deepEqual(stmts[0].params, [1, "Matemática", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z", 1, 0]);
});

test("buildMigrationStatements maps isActive false to 0", () => {
  const state = makeBrowserState({
    subjects: [{ id: 2, name: "Arquivologia", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", isActive: false, sortOrder: 1 }],
  });
  const stmts = buildMigrationStatements(state);
  assert.equal(stmts[0].params[4], 0, "isActive false must map to 0");
});

test("buildMigrationStatements generates one INSERT per source", () => {
  const state = makeBrowserState({
    sources: [{ id: 1, name: "Grancursos", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", isActive: true, sortOrder: 0 }],
  });
  const stmts = buildMigrationStatements(state);
  assert.equal(stmts.length, 1);
  assert.ok(stmts[0].sql.startsWith("INSERT OR REPLACE INTO sources"), "wrong table");
});

test("buildMigrationStatements generates one INSERT per study record", () => {
  const state = makeBrowserState({
    studyRecords: [{
      id: 1, subjectId: 1, sourceId: 1,
      studyDate: "2026-06-01", content: "Funções quadráticas",
      createdAt: "2026-06-01T10:00:00.000Z", updatedAt: "2026-06-01T10:00:00.000Z",
    }],
  });
  const stmts = buildMigrationStatements(state);
  assert.equal(stmts.length, 1);
  assert.ok(stmts[0].sql.startsWith("INSERT OR REPLACE INTO study_records"), "wrong table");
  assert.deepEqual(stmts[0].params, [1, 1, 1, "2026-06-01", "Funções quadráticas", "2026-06-01T10:00:00.000Z", "2026-06-01T10:00:00.000Z"]);
});

test("buildMigrationStatements generates one INSERT per review task with null coalescing", () => {
  const state = makeBrowserState({
    reviewTasks: [{
      id: 1, studyRecordId: 1, reviewNumber: 1, dueDate: "2026-06-02",
      completedAt: null, reviewDone: false, questionsDone: false,
      questionsCount: null, correctCount: null, scorePercent: null,
      comment: null, createdAt: "2026-06-01T10:00:00.000Z", updatedAt: "2026-06-01T10:00:00.000Z",
    }],
  });
  const stmts = buildMigrationStatements(state);
  assert.equal(stmts.length, 1);
  assert.ok(stmts[0].sql.startsWith("INSERT OR REPLACE INTO review_tasks"), "wrong table");
  const p = stmts[0].params;
  assert.equal(p[4], null, "completedAt null must stay null");
  assert.equal(p[5], 0, "reviewDone false must be 0");
  assert.equal(p[6], 0, "questionsDone false must be 0");
  assert.equal(p[7], null, "questionsCount null must stay null");
});

test("buildMigrationStatements orders statements: subjects then sources then study_records then review_tasks", () => {
  const state = makeBrowserState({
    subjects: [{ id: 1, name: "A", createdAt: "t", updatedAt: "t", isActive: true, sortOrder: 0 }],
    sources: [{ id: 1, name: "G", createdAt: "t", updatedAt: "t", isActive: true, sortOrder: 0 }],
    studyRecords: [{ id: 1, subjectId: 1, sourceId: 1, studyDate: "d", content: "c", createdAt: "t", updatedAt: "t" }],
    reviewTasks: [{ id: 1, studyRecordId: 1, reviewNumber: 1, dueDate: "d", completedAt: null, reviewDone: false, questionsDone: false, questionsCount: null, correctCount: null, scorePercent: null, comment: null, createdAt: "t", updatedAt: "t" }],
  });
  const stmts = buildMigrationStatements(state);
  assert.equal(stmts.length, 4);
  assert.ok(stmts[0].sql.includes("subjects"));
  assert.ok(stmts[1].sql.includes("sources"));
  assert.ok(stmts[2].sql.includes("study_records"));
  assert.ok(stmts[3].sql.includes("review_tasks"));
});

test("buildMigrationStatements all SQL statements start with INSERT OR REPLACE", () => {
  const state = makeBrowserState({
    subjects: [{ id: 1, name: "A", createdAt: "t", updatedAt: "t", isActive: true, sortOrder: 0 }],
    sources: [{ id: 1, name: "B", createdAt: "t", updatedAt: "t", isActive: true, sortOrder: 0 }],
  });
  for (const stmt of buildMigrationStatements(state)) {
    assert.ok(stmt.sql.startsWith("INSERT OR REPLACE"), `unexpected SQL prefix: ${stmt.sql.slice(0, 30)}`);
  }
});
