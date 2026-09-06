import test from "node:test";
import assert from "node:assert/strict";

import { Stats } from "../src/stats.js";

test("Stats.calculate usa média ponderada por disciplina", () => {
  const reviewTasks = [
    { id: 1, unitId: 10, dueDate: "2026-06-27", reviewDone: true },
    { id: 2, unitId: 11, dueDate: "2026-06-27", reviewDone: true },
  ];
  const evidence = [
    { id: 1, unitId: 10, questionsCount: 1, correctCount: 1, scorePercent: 100, evidenceDate: "2026-06-27", completedAt: "2026-06-27T10:00:00.000Z" },
    { id: 2, unitId: 11, questionsCount: 99, correctCount: 59, scorePercent: 59.6, evidenceDate: "2026-06-27", completedAt: "2026-06-27T11:00:00.000Z" },
  ];
  const learningUnits = [
    { id: 10, subjectId: 7 },
    { id: 11, subjectId: 7 },
  ];
  const subjects = [{ id: 7, name: "Disciplina X" }];

  const stats = Stats.calculate(reviewTasks, evidence, learningUnits, subjects, "2026-06-27");

  assert.equal(stats.totalQuestions, 100);
  assert.equal(stats.totalCorrect, 60);
  assert.equal(stats.avgScore, 60);
  assert.equal(stats.avgBySubject.length, 1);
  assert.equal(stats.avgBySubject[0].avgScore, 60);
});

test("Stats.calculate só cobra revisões não feitas que vencem hoje", () => {
  const reviewTasks = [
    {
      id: 1,
      unitId: 10,
      dueDate: "2026-06-27",
      reviewDone: false,
      questionsDone: false,
      questionsCount: null,
      correctCount: null,
      scorePercent: null,
      completedAt: null,
    },
    {
      id: 2,
      unitId: 10,
      dueDate: "2026-06-26",
      reviewDone: false,
      questionsDone: false,
      questionsCount: null,
      correctCount: null,
      scorePercent: null,
      completedAt: null,
    },
    {
      id: 3,
      unitId: 10,
      dueDate: "2026-06-28",
      reviewDone: false,
      questionsDone: false,
      questionsCount: null,
      correctCount: null,
      scorePercent: null,
      completedAt: null,
    },
  ];

  const stats = Stats.calculate(reviewTasks, [], [{ id: 10, subjectId: 7 }], [{ id: 7, name: "Disciplina X" }], "2026-06-27");

  assert.equal(stats.reviewsPending, 1);
  assert.equal(stats.reviewsOverdue, 1);
});

test("Stats.calculate com subjects vazio não lança erro e retorna estrutura válida", () => {
  const reviewTasks = [
    {
      id: 1,
      unitId: 1,
      dueDate: "2026-09-02",
      reviewDone: false,
      questionsDone: false,
      questionsCount: null,
      correctCount: null,
      scorePercent: null,
      completedAt: null,
    },
  ];

  const stats = Stats.calculate(reviewTasks, [], [{ id: 1, subjectId: 99 }], [], "2026-09-02");

  assert.equal(typeof stats.avgScore, "number");
  assert.equal(stats.reviewsPending, 1);
  assert.equal(stats.reviewsOverdue, 0);
  assert.equal(stats.avgBySubject.length, 0);
});

test("Stats.calculate com todas as revisões feitas retorna pending e overdue zero", () => {
  const reviewTasks = [
    {
      id: 1,
      unitId: 1,
      dueDate: "2026-09-01",
      reviewDone: true,
      questionsDone: false,
      questionsCount: null,
      correctCount: null,
      scorePercent: null,
      completedAt: "2026-09-01T10:00:00.000Z",
    },
  ];

  const stats = Stats.calculate(
    reviewTasks,
    [],
    [{ id: 1, subjectId: 1 }],
    [{ id: 1, name: "Disciplina X" }],
    "2026-09-02",
  );

  assert.equal(stats.reviewsPending, 0);
  assert.equal(stats.reviewsOverdue, 0);
  assert.equal(stats.reviewsDone, 1);
});

// P1-4 discrimination: EXTERNAL + INITIAL_PRACTICE evidence counted; review_tasks score ignored
test("Stats.calculate conta evidence de todos os contextos (REVIEW, EXTERNAL, INITIAL_PRACTICE)", () => {
  const reviewTasks = [{ id: 1, unitId: 1, dueDate: "2026-09-04", reviewDone: true }];
  const evidence = [
    { id: 1, unitId: 1, context: "REVIEW",            questionsCount: 20, correctCount: 15, scorePercent: 75, evidenceDate: "2026-09-04", completedAt: "2026-09-04T10:00:00.000Z" },
    { id: 2, unitId: 1, context: "EXTERNAL",          questionsCount: 40, correctCount: 30, scorePercent: 75, evidenceDate: "2026-09-04", completedAt: "2026-09-04T11:00:00.000Z" },
    { id: 3, unitId: 1, context: "INITIAL_PRACTICE",  questionsCount: 10, correctCount: 5,  scorePercent: 50, evidenceDate: "2026-09-04", completedAt: "2026-09-04T12:00:00.000Z" },
  ];
  const stats = Stats.calculate(reviewTasks, evidence, [{ id: 1, subjectId: 1 }], [{ id: 1, name: "Fisiologia" }], "2026-09-04");
  // 70 questions total (20+40+10), 50 correct (15+30+5) ≈ 71.43%
  assert.equal(stats.totalQuestions, 70);
  assert.equal(stats.totalCorrect, 50);
  assert.ok(Math.abs(stats.avgScore - (50 / 70) * 100) < 0.01);
});
