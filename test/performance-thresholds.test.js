import test from "node:test";
import assert from "node:assert/strict";
import {
  getState,
  PERFORMANCE_STATES,
  THRESHOLDS,
  SUBJECT_COLORS,
  SUBJECT_COLOR_KEYS,
  DEFAULT_SUBJECT_COLOR,
  colorVarForKey,
  performanceColor,
  PERFORMANCE_COLOR_NEUTRAL,
} from "../src/performance-thresholds.js";

import { subjectTrend, unitTrend, Analytics } from "../src/analytics.js";

test("getState retorna NO_EVIDENCE quando totalQuestions é zero", () => {
  assert.equal(getState(0, 0), PERFORMANCE_STATES.NO_EVIDENCE);
  assert.equal(getState(null, 0), PERFORMANCE_STATES.NO_EVIDENCE);
  assert.equal(getState(80, null), PERFORMANCE_STATES.NO_EVIDENCE);
});

test("getState retorna STRONG quando accuracy >= 80", () => {
  assert.equal(getState(80, 100), PERFORMANCE_STATES.STRONG);
  assert.equal(getState(100, 50), PERFORMANCE_STATES.STRONG);
});

test("getState retorna ADEQUATE quando accuracy entre 65 e 79", () => {
  assert.equal(getState(65, 50), PERFORMANCE_STATES.ADEQUATE);
  assert.equal(getState(79.9, 50), PERFORMANCE_STATES.ADEQUATE);
});

test("getState retorna ATTENTION quando accuracy entre 50 e 64", () => {
  assert.equal(getState(50, 50), PERFORMANCE_STATES.ATTENTION);
  assert.equal(getState(64.9, 50), PERFORMANCE_STATES.ATTENTION);
});

test("getState retorna CRITICAL quando accuracy < 50", () => {
  assert.equal(getState(0, 50), PERFORMANCE_STATES.CRITICAL);
  assert.equal(getState(49.9, 50), PERFORMANCE_STATES.CRITICAL);
});

test("SUBJECT_COLORS tem exatamente 12 entradas", () => {
  assert.equal(SUBJECT_COLOR_KEYS.length, 12);
});

test("SUBJECT_COLORS inclui DISC-BLUE e DISC-ROSE", () => {
  assert.ok(SUBJECT_COLORS['DISC-BLUE']);
  assert.ok(SUBJECT_COLORS['DISC-ROSE']);
});

test("DEFAULT_SUBJECT_COLOR é DISC-BLUE", () => {
  assert.equal(DEFAULT_SUBJECT_COLOR, 'DISC-BLUE');
});

test("colorVarForKey retorna variável CSS para chave válida", () => {
  const v = colorVarForKey('DISC-GREEN');
  assert.ok(v.startsWith('--disc-color-'));
});

test("colorVarForKey retorna default para chave inválida", () => {
  const v = colorVarForKey('INVALIDA');
  const vDefault = colorVarForKey('DISC-BLUE');
  assert.equal(v, vDefault);
});

// --- subjectTrend ---

test("subjectTrend retorna INSUFFICIENT quando janela tem < minQuestions", () => {
  const recent = [{ questionsCount: 5, correctCount: 4 }];
  const prev = [{ questionsCount: 5, correctCount: 3 }];
  const result = subjectTrend(recent, prev, 10);
  assert.equal(result.direction, 'INSUFFICIENT');
});

test("subjectTrend retorna IMPROVING quando delta > 0.03", () => {
  const recent = [{ questionsCount: 20, correctCount: 16 }]; // 80%
  const prev = [{ questionsCount: 20, correctCount: 12 }];   // 60%
  const result = subjectTrend(recent, prev, 10);
  assert.equal(result.direction, 'IMPROVING');
});

test("subjectTrend retorna DECLINING quando delta < -0.03", () => {
  const recent = [{ questionsCount: 20, correctCount: 10 }]; // 50%
  const prev = [{ questionsCount: 20, correctCount: 16 }];   // 80%
  const result = subjectTrend(recent, prev, 10);
  assert.equal(result.direction, 'DECLINING');
});

test("subjectTrend retorna STABLE quando delta pequeno", () => {
  const recent = [{ questionsCount: 20, correctCount: 14 }]; // 70%
  const prev = [{ questionsCount: 20, correctCount: 14 }];   // 70%
  const result = subjectTrend(recent, prev, 10);
  assert.equal(result.direction, 'STABLE');
});

// --- unitTrend ---

test("unitTrend retorna INSUFFICIENT quando menos de minN scores", () => {
  const result = unitTrend([70, 80], 3);
  assert.equal(result.direction, 'INSUFFICIENT');
});

test("unitTrend retorna IMPROVING quando último > primeiro em > threshold", () => {
  const result = unitTrend([50, 60, 80], 3);
  assert.equal(result.direction, 'IMPROVING');
});

test("unitTrend retorna DECLINING quando último < primeiro em > threshold", () => {
  const result = unitTrend([80, 70, 50], 3);
  assert.equal(result.direction, 'DECLINING');
});

test("unitTrend retorna STABLE quando diferença pequena", () => {
  const result = unitTrend([70, 72, 71], 3);
  assert.equal(result.direction, 'STABLE');
});

test("unitTrend usa últimos N da sequência quando há mais que minN", () => {
  // Primeiro muito baixo, mas últimos 3 crescendo
  const result = unitTrend([10, 10, 10, 50, 80], 3);
  assert.equal(result.direction, 'IMPROVING');
});

// --- performanceColor (SLICE 1 — discriminant fixture A..G) ---

function rgbComponents(css) {
  const match = css.match(/^rgb\((\d+), (\d+), (\d+)\)$/);
  assert.ok(match, `esperava um rgb(), recebi: ${css}`);
  return match.slice(1, 4).map(Number);
}

test("performanceColor: 0% é vermelho puro (stop inicial exato)", () => {
  assert.equal(performanceColor(0, 100), 'rgb(220, 38, 38)');
});

test("performanceColor: 60% é amarelo puro (stop exato no ponto)", () => {
  assert.equal(performanceColor(60, 100), 'rgb(234, 179, 8)');
});

test("performanceColor: 100% é verde puro (stop final exato)", () => {
  assert.equal(performanceColor(100, 100), 'rgb(22, 163, 74)');
});

test("performanceColor: A=20% interpola entre vermelho e amarelo", () => {
  assert.equal(performanceColor(20, 100), 'rgb(225, 85, 28)');
});

test("performanceColor: B=49% ainda no segmento vermelho->amarelo", () => {
  assert.equal(performanceColor(49, 100), 'rgb(231, 153, 14)');
});

test("performanceColor: D=70% interpola entre amarelo e verde", () => {
  assert.equal(performanceColor(70, 100), 'rgb(181, 175, 25)');
});

test("performanceColor: E=80% interpola entre amarelo e verde", () => {
  assert.equal(performanceColor(80, 100), 'rgb(128, 171, 41)');
});

test("performanceColor: F=95% próximo do verde (componente verde dominante)", () => {
  const [r, g, b] = rgbComponents(performanceColor(95, 100));
  assert.ok(g > r && g > b, `esperava verde dominante em 95%, recebi rgb(${r},${g},${b})`);
});

test("performanceColor: G sem evidência é neutro, nunca vermelho", () => {
  assert.equal(performanceColor(null, 0), PERFORMANCE_COLOR_NEUTRAL);
  assert.equal(performanceColor(50, null), PERFORMANCE_COLOR_NEUTRAL);
  assert.doesNotMatch(PERFORMANCE_COLOR_NEUTRAL, /^rgb\(/);
});

test("performanceColor: 20% é claramente pior que 95% (componente vermelho maior, verde menor)", () => {
  const [rA, gA] = rgbComponents(performanceColor(20, 100));
  const [rF, gF] = rgbComponents(performanceColor(95, 100));
  assert.ok(rA > rF, `vermelho de 20% (${rA}) deveria ser maior que o de 95% (${rF})`);
  assert.ok(gA < gF, `verde de 20% (${gA}) deveria ser menor que o de 95% (${gF})`);
});

test("performanceColor: subjectColor não altera performanceColor (mesma accuracy, cores de disciplina diferentes)", () => {
  const today = '2026-06-01';
  const subjects = [
    { id: 1, name: 'Fisiologia', color: 'DISC-RED' },
    { id: 2, name: 'Anatomia', color: 'DISC-GREEN' },
  ];
  const units = [
    { id: 1, subjectId: 1 },
    { id: 2, subjectId: 2 },
  ];
  const evidence = [
    { unitId: 1, questionsCount: 100, correctCount: 70, evidenceDate: today },
    { unitId: 2, questionsCount: 100, correctCount: 70, evidenceDate: today },
  ];
  const results = Analytics.bySubject(evidence, units, subjects, today);
  const [colorA, colorB] = results.map((r) => performanceColor(r.weightedAccuracy, r.totalQuestions));
  assert.equal(colorA, colorB);
  assert.notEqual(results[0].color, results[1].color);
});
