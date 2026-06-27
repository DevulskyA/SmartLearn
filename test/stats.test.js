import test from "node:test";
import assert from "node:assert/strict";

import { Stats } from "../src/stats.js";

test("Stats.calculate usa média ponderada por disciplina", () => {
  const reviewTasks = [
    {
      id: 1,
      studyRecordId: 10,
      dueDate: "2026-06-27",
      reviewDone: true,
      questionsDone: true,
      questionsCount: 1,
      correctCount: 1,
      scorePercent: 100,
      completedAt: "2026-06-27T10:00:00.000Z",
    },
    {
      id: 2,
      studyRecordId: 11,
      dueDate: "2026-06-27",
      reviewDone: true,
      questionsDone: true,
      questionsCount: 99,
      correctCount: 59,
      scorePercent: 59.6,
      completedAt: "2026-06-27T11:00:00.000Z",
    },
  ];
  const studyRecords = [
    { id: 10, subjectId: 7 },
    { id: 11, subjectId: 7 },
  ];
  const subjects = [{ id: 7, name: "Disciplina X" }];

  const stats = Stats.calculate(reviewTasks, studyRecords, subjects, "2026-06-27");

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
      studyRecordId: 10,
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
      studyRecordId: 10,
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
      studyRecordId: 10,
      dueDate: "2026-06-28",
      reviewDone: false,
      questionsDone: false,
      questionsCount: null,
      correctCount: null,
      scorePercent: null,
      completedAt: null,
    },
  ];

  const stats = Stats.calculate(reviewTasks, [{ id: 10, subjectId: 7 }], [{ id: 7, name: "Disciplina X" }], "2026-06-27");

  assert.equal(stats.reviewsPending, 1);
  assert.equal(stats.reviewsOverdue, 1);
});
