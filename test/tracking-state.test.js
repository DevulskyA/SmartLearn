import test from "node:test";
import assert from "node:assert/strict";
import { getTrackingState } from "../src/tracking-state.js";

const TODAY = "2026-09-04";
const YESTERDAY = "2026-09-03";
const TOMORROW = "2026-09-05";
const NEXT_7 = "2026-09-11";
const NEXT_8 = "2026-09-12";

function task(opts) {
  return { unitId: 1, id: opts.id ?? 1, reviewDone: opts.done ?? false, dueDate: opts.due, ...opts };
}
function ev(context = "INITIAL_PRACTICE") {
  return { unitId: 1, context, questionsCount: 10, correctCount: 8 };
}

// --- Sensor A: sem evidence + review futura => SEM_EVIDENCIA ---
test("A: sem evidence + review futura => SEM_EVIDENCIA", () => {
  assert.equal(getTrackingState(1, [task({ due: TOMORROW })], [], TODAY), "SEM_EVIDENCIA");
});

// --- Sensor B: sem evidence + review vencida => ATRASADO (wins over SEM_EVIDENCIA) ---
test("B: sem evidence + review vencida => ATRASADO (ATRASADO vence SEM_EVIDENCIA)", () => {
  assert.equal(getTrackingState(1, [task({ due: YESTERDAY })], [], TODAY), "ATRASADO");
});

// --- Sensor C: INITIAL_PRACTICE + review hoje => EM_REVISAO ---
test("C: INITIAL_PRACTICE + review hoje => EM_REVISAO", () => {
  assert.equal(getTrackingState(1, [task({ due: TODAY })], [ev("INITIAL_PRACTICE")], TODAY), "EM_REVISAO");
});

// --- Sensor D: INITIAL_PRACTICE + primeira review futura => EM_ESTUDO ---
test("D: INITIAL_PRACTICE + review futura => EM_ESTUDO", () => {
  assert.equal(getTrackingState(1, [task({ due: TOMORROW })], [ev("INITIAL_PRACTICE")], TODAY), "EM_ESTUDO");
});

// --- Sensor E: REVIEW evidence + próxima review futura => EM_DIA ---
test("E: REVIEW evidence + review futura => EM_DIA", () => {
  const tasks = [task({ id: 1, done: true, due: YESTERDAY }), task({ id: 2, due: TOMORROW })];
  const evidence = [ev("INITIAL_PRACTICE"), ev("REVIEW")];
  assert.equal(getTrackingState(1, tasks, evidence, TODAY), "EM_DIA");
});

// --- Sensor F: evidence + nenhuma task pendente => EM_DIA ---
test("F: evidence + todas tasks concluídas => EM_DIA", () => {
  assert.equal(getTrackingState(1, [task({ done: true, due: YESTERDAY })], [ev("INITIAL_PRACTICE")], TODAY), "EM_DIA");
});

// --- Sensor G: review amanhã NÃO vira EM_REVISAO apenas por proximidade ---
test("G: review amanhã (dueDate = hoje+1) => EM_ESTUDO, não EM_REVISAO", () => {
  assert.equal(getTrackingState(1, [task({ due: TOMORROW })], [ev("INITIAL_PRACTICE")], TODAY), "EM_ESTUDO");
});

// --- Sensor H: review em 7 dias e 8 dias sem tratamento especial (ambos EM_ESTUDO) ---
test("H1: review em 7 dias => EM_ESTUDO (não EM_REVISAO)", () => {
  assert.equal(getTrackingState(1, [task({ due: NEXT_7 })], [ev("INITIAL_PRACTICE")], TODAY), "EM_ESTUDO");
});
test("H2: review em 8 dias => EM_ESTUDO (igual ao de 7 dias, sem tratamento especial)", () => {
  assert.equal(getTrackingState(1, [task({ due: NEXT_8 })], [ev("INITIAL_PRACTICE")], TODAY), "EM_ESTUDO");
});

// --- Sensor I: overdue vence todos os outros estados ---
test("I1: overdue com evidence => ATRASADO (não EM_DIA)", () => {
  const tasks = [task({ id: 1, due: YESTERDAY }), task({ id: 2, done: true, due: "2026-08-01" })];
  assert.equal(getTrackingState(1, tasks, [ev("REVIEW")], TODAY), "ATRASADO");
});
test("I2: overdue sem evidence => ATRASADO (não SEM_EVIDENCIA)", () => {
  assert.equal(getTrackingState(1, [task({ due: YESTERDAY })], [], TODAY), "ATRASADO");
});

// --- Extra: EM_DIA com EXTERNAL evidence (sem REVIEW) e sem pending => EM_DIA ---
test("EXTERNAL evidence + sem pending => EM_DIA", () => {
  assert.equal(getTrackingState(1, [], [ev("EXTERNAL")], TODAY), "EM_DIA");
});

// --- Extra: EM_ESTUDO requer ausência de REVIEW evidence ---
test("REVIEW evidence + future pending => EM_DIA (não EM_ESTUDO)", () => {
  assert.equal(getTrackingState(1, [task({ due: NEXT_7 })], [ev("REVIEW")], TODAY), "EM_DIA");
});

// =============================================================================
// DISCRIMINATION: reintroducing the old <=7 day rule must FAIL the sensors above
// =============================================================================

function buggyWith7DayRule(unitId, allTasks, allEvidence, today) {
  const tasks = allTasks.filter((t) => t.unitId === unitId);
  if (tasks.length === 0) return "SEM_EVIDENCIA";
  if (tasks.some((t) => !t.reviewDone && t.dueDate < today)) return "ATRASADO";
  const pending = tasks.filter((t) => !t.reviewDone).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  if (pending.length > 0) {
    const msPerDay = 86400000;
    const days = Math.round((new Date(pending[0].dueDate) - new Date(today)) / msPerDay);
    return days <= 7 ? "EM_REVISAO" : "EM_ESTUDO";
  }
  return "EM_DIA";
}

test("DISCRIMINATION: buggy <=7-day rule makes sensor A fail (tasks.length=0 check masks SEM_EVIDENCIA with evidence)", () => {
  // Sensor A: sem evidence + review futura => SEM_EVIDENCIA.
  // Buggy version checks tasks.length === 0, not evidence length.
  // With 1 task + 0 evidence, buggy returns EM_REVISAO (if <= 7) not SEM_EVIDENCIA.
  const result = buggyWith7DayRule(1, [task({ due: TOMORROW })], [], TODAY);
  // Buggy: dueDate tomorrow = 1 day, <= 7 → EM_REVISAO. Should be SEM_EVIDENCIA.
  assert.notEqual(result, "SEM_EVIDENCIA", "buggy function gives wrong result for sensor A");
});

test("DISCRIMINATION: buggy <=7-day rule makes sensor G fail (NEXT_7 becomes EM_REVISAO not EM_ESTUDO)", () => {
  const result = buggyWith7DayRule(1, [task({ due: NEXT_7 })], [ev("INITIAL_PRACTICE")], TODAY);
  // Buggy: 7 days <= 7 → EM_REVISAO. Correct: EM_ESTUDO (only today counts as EM_REVISAO).
  assert.equal(result, "EM_REVISAO", "buggy function incorrectly returns EM_REVISAO for 7-day-out task");
  // The correct function returns EM_ESTUDO — discrimination confirmed.
  assert.equal(getTrackingState(1, [task({ due: NEXT_7 })], [ev("INITIAL_PRACTICE")], TODAY), "EM_ESTUDO");
});

test("DISCRIMINATION: buggy function: task due today treated same as <=7 day (EM_REVISAO) but semantics wrong", () => {
  // Both give EM_REVISAO for today — agrees here but for wrong reason (days=0 <= 7).
  // The critical difference is tomorrow: correct = EM_ESTUDO, buggy = EM_REVISAO.
  const buggy = buggyWith7DayRule(1, [task({ due: TOMORROW })], [ev("INITIAL_PRACTICE")], TODAY);
  assert.equal(buggy, "EM_REVISAO", "buggy: tomorrow wrongly EM_REVISAO");
  const correct = getTrackingState(1, [task({ due: TOMORROW })], [ev("INITIAL_PRACTICE")], TODAY);
  assert.equal(correct, "EM_ESTUDO", "correct: tomorrow is EM_ESTUDO");
});
