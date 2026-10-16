import test from "node:test";
import assert from "node:assert/strict";

import { Analytics, verdictText } from "../src/analytics.js";

// Characterization of the exact pt-BR sentences analytics.js produces (they come from the i18n catalog).

const counts = (over = {}) => ({ improving: 0, declining: 0, stable: 0, insufficient: 0, noEvidence: 0, ...over });
const volumes = (over = {}) => ({ improving: 0, declining: 0, stable: 0, compared: 0, ...over });
const verdict = (state, over = {}) => ({ state, counts: counts(), volumes: volumes(), totalQuestions: 0, attention: null, ...over });

test("verdictText: no evidence", () => {
  assert.deepEqual(verdictText(verdict("NO_EVIDENCE")), {
    headline: "Ainda não há evidência para dizer se seu estudo está funcionando.",
    detail: "Registre questões ou faça revisões para começar a medir.",
  });
});

test("verdictText: insufficient history counts the registered questions (singular at 1, plural otherwise, no thousands dot)", () => {
  assert.deepEqual(verdictText(verdict("INSUFFICIENT", { totalQuestions: 1 })), {
    headline: "Ainda não há histórico suficiente para comparar.",
    detail: "Há 1 questão registrada, mas cada período precisa de pelo menos 10 para indicar uma tendência.",
  });
  assert.equal(verdictText(verdict("INSUFFICIENT", { totalQuestions: 4 })).detail,
    "Há 4 questões registradas, mas cada período precisa de pelo menos 10 para indicar uma tendência.");
  assert.equal(verdictText(verdict("INSUFFICIENT", { totalQuestions: 1020 })).detail,
    "Há 1020 questões registradas, mas cada período precisa de pelo menos 10 para indicar uma tendência.");
});

test("verdictText: the four headlines", () => {
  const headline = (state) => verdictText(verdict(state, { counts: counts({ stable: 1 }), volumes: volumes({ stable: 20 }) })).headline;
  assert.equal(headline("IMPROVING"), "Seu desempenho está melhorando.");
  assert.equal(headline("DECLINING"), "Seu desempenho está piorando.");
  assert.equal(headline("STABLE"), "Seu desempenho está estável.");
  assert.equal(headline("MIXED"), "Resultado misto: melhorando em umas áreas e piorando em outras.");
});

test("verdictText: per-direction detail shows each volume, with the thousands dot and singular/plural agreement", () => {
  const v = verdict("MIXED", {
    counts: counts({ improving: 2, declining: 1, stable: 1, insufficient: 3, noEvidence: 4 }),
    volumes: volumes({ improving: 1020, declining: 1, stable: 25 }),
  });
  assert.equal(verdictText(v).detail,
    "Disciplinas: 2 melhorando (1.020 questões) · 1 piorando (1 questão) · 1 estável (25 questões) · 3 com evidência insuficiente · 4 sem evidência.");
  const many = verdict("STABLE", { counts: counts({ stable: 3 }), volumes: volumes({ stable: 1234567 }) });
  assert.equal(verdictText(many).detail, "Disciplinas: 3 estáveis (1.234.567 questões).");
  const one = verdict("STABLE", { counts: counts({ stable: 1 }), volumes: volumes({ stable: 1 }) });
  assert.equal(verdictText(one).detail, "Disciplinas: 1 estável (1 questão).");
});

test("verdictText: a zero volume still reads as plural (only exactly 1 is singular)", () => {
  const v = verdict("IMPROVING", { counts: counts({ improving: 1 }), volumes: volumes({ improving: 0 }) });
  assert.equal(verdictText(v).detail, "Disciplinas: 1 melhorando (0 questões).");
});

test("byUnit: a unit whose subject is unknown is labelled 'Sem disciplina'", () => {
  const [row] = Analytics.byUnit([], [{ id: 1, subjectId: 99, title: "Aula" }], []);
  assert.equal(row.subjectName, "Sem disciplina");
});
