import test from "node:test";
import assert from "node:assert/strict";
import ptBR from "../src/i18n/locales/pt-BR.js";
import {
  getState,
  PERFORMANCE_STATES,
  SUBJECT_COLORS,
  SUBJECT_COLOR_KEYS,
  DEFAULT_SUBJECT_COLOR,
  colorVarForKey,
  performanceColor,
  PERFORMANCE_COLOR_NEUTRAL,
  volumeBarWidth,
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

test("SUBJECT_COLORS: as 12 identidades originais continuam as primeiras e há mais 6 (18 no total)", () => {
  assert.deepEqual(SUBJECT_COLOR_KEYS.slice(0, 12), ['DISC-BLUE', 'DISC-GREEN', 'DISC-PURPLE', 'DISC-ORANGE', 'DISC-RED', 'DISC-TEAL', 'DISC-PINK', 'DISC-INDIGO', 'DISC-LIME', 'DISC-AMBER', 'DISC-CYAN', 'DISC-ROSE']);
  assert.equal(SUBJECT_COLOR_KEYS.length, 18);
  assert.equal(new Set(Object.values(SUBJECT_COLORS).map((c) => c.light)).size, 18, 'nenhuma cor clara repetida');
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
// unitTrend takes the unit's evidence rows (ANALYTICS-2): older half of the distinct days vs
// newer half, pooled correct/questions, min 10 questions per half. Full contract (weighting,
// order, outliers, same-day rows): test/longitudinal-trend.test.js.
const evRow = (evidenceDate, questionsCount, correctCount) => ({ evidenceDate, questionsCount, correctCount });

test("unitTrend retorna INSUFFICIENT sem histórico comparável (< 2 dias ou metade com < minQuestions)", () => {
  assert.equal(unitTrend([]).direction, 'INSUFFICIENT');
  assert.equal(unitTrend([evRow('2026-01-01', 30, 20)]).direction, 'INSUFFICIENT');
  assert.equal(unitTrend([evRow('2026-01-01', 30, 20), evRow('2026-02-01', 5, 5)]).direction, 'INSUFFICIENT');
});

test("unitTrend retorna IMPROVING quando a metade recente supera a antiga além do threshold", () => {
  assert.equal(unitTrend([evRow('2026-01-01', 10, 5), evRow('2026-02-01', 10, 8)]).direction, 'IMPROVING');
});

test("unitTrend retorna DECLINING quando a metade recente fica abaixo da antiga além do threshold", () => {
  assert.equal(unitTrend([evRow('2026-01-01', 10, 8), evRow('2026-02-01', 10, 5)]).direction, 'DECLINING');
});

test("unitTrend retorna STABLE quando a diferença agregada é pequena", () => {
  assert.equal(unitTrend([evRow('2026-01-01', 40, 28), evRow('2026-02-01', 40, 29)]).direction, 'STABLE');
});

test("unitTrend usa TODO o histórico (metade antiga vs metade recente), não só os últimos pontos", () => {
  // início muito baixo e depois alto: a metade antiga (1ª e 2ª datas) puxa a média para baixo
  const rows = [evRow('2026-01-01', 10, 1), evRow('2026-01-10', 10, 1), evRow('2026-02-01', 10, 5), evRow('2026-03-01', 10, 8)];
  assert.equal(unitTrend(rows).direction, 'IMPROVING'); // 10% -> 65%
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

test("performanceColor: 50% é laranja e 65% é âmbar (stops exatos do contrato V7.2)", () => {
  assert.equal(performanceColor(50, 100), 'rgb(234, 88, 12)');
  assert.equal(performanceColor(65, 100), 'rgb(245, 158, 11)');
});

test("performanceColor: 100% é azul-escuro (stop final exato)", () => {
  assert.equal(performanceColor(100, 100), 'rgb(30, 58, 138)');
});

test("performanceColor: A=20% interpola entre vermelho e laranja", () => {
  assert.equal(performanceColor(20, 100), 'rgb(226, 58, 28)');
});

test("performanceColor: B=49% ainda no segmento vermelho->laranja, quase no laranja", () => {
  assert.equal(performanceColor(49, 100), 'rgb(234, 87, 13)');
});

test("performanceColor: D=70% e 79% evoluem de âmbar a amarelo (sem verde entre amarelo e azul)", () => {
  assert.equal(performanceColor(70, 100), 'rgb(241, 165, 10)');
  assert.equal(performanceColor(79, 100), 'rgb(235, 178, 8)');
  assert.equal(performanceColor(79.99, 100), 'rgb(234, 179, 8)');
});

test("performanceColor: E=80% começa o azul-claro e 90% é o azul médio", () => {
  assert.equal(performanceColor(80, 100), 'rgb(96, 165, 250)');
  assert.equal(performanceColor(90, 100), 'rgb(37, 99, 235)');
});

test("performanceColor: tema escuro usa os stops do contrato para fundo escuro", () => {
  const dark = { dark: true };
  assert.equal(performanceColor(0, 100, dark), 'rgb(248, 113, 113)');
  assert.equal(performanceColor(50, 100, dark), 'rgb(251, 146, 60)');
  assert.equal(performanceColor(65, 100, dark), 'rgb(251, 191, 36)');
  assert.equal(performanceColor(79.99, 100, dark), 'rgb(253, 224, 71)');
  assert.equal(performanceColor(80, 100, dark), 'rgb(147, 197, 253)');
  assert.equal(performanceColor(90, 100, dark), 'rgb(96, 165, 250)');
  assert.equal(performanceColor(100, 100, dark), 'rgb(59, 130, 246)');
});

test("performanceColor: 1 a 9 questões é amostra insuficiente (neutro), 10 já colore", () => {
  assert.equal(performanceColor(90, 9), PERFORMANCE_COLOR_NEUTRAL);
  assert.notEqual(performanceColor(90, 10), PERFORMANCE_COLOR_NEUTRAL);
});

test("performanceColor: F=95% é azul (componente azul dominante) e mais escuro que 80%", () => {
  const [r, g, b] = rgbComponents(performanceColor(95, 100));
  assert.ok(b > r && b > g, `esperava azul dominante em 95%, recebi rgb(${r},${g},${b})`);
  assert.ok(b < 250, 'azul a 95% deve ser mais escuro que o de 80%');
});

test("performanceColor: nenhuma nota de 0 a 100 produz verde dominante", () => {
  for (let pct = 0; pct <= 100; pct += 1) {
    const [r, g, b] = rgbComponents(performanceColor(pct, 100));
    assert.ok(!(g > r && g > b), `${pct}% resultou em verde dominante rgb(${r},${g},${b})`);
  }
});

test("performanceColor: G sem evidência é neutro, nunca vermelho", () => {
  assert.equal(performanceColor(null, 0), PERFORMANCE_COLOR_NEUTRAL);
  assert.equal(performanceColor(50, null), PERFORMANCE_COLOR_NEUTRAL);
  assert.doesNotMatch(PERFORMANCE_COLOR_NEUTRAL, /^rgb\(/);
});

test("performanceColor: 20% é claramente pior que 95% (mais vermelho, menos azul)", () => {
  const [rA, , bA] = rgbComponents(performanceColor(20, 100));
  const [rF, , bF] = rgbComponents(performanceColor(95, 100));
  assert.ok(rA > rF, `vermelho de 20% (${rA}) deveria ser maior que o de 95% (${rF})`);
  assert.ok(bA < bF, `azul de 20% (${bA}) deveria ser menor que o de 95% (${bF})`);
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

// --- SLICE 2: performance x volume independence (fixture A..G, heterogeneous volume) ---

test("volumeBarWidth: escala relativa ao maior volume exibido, fixture A..G", () => {
  const maxVolume = 200; // A's volume
  assert.equal(volumeBarWidth(200, maxVolume), 100); // A
  assert.equal(volumeBarWidth(20, maxVolume), 10);   // B
  assert.equal(volumeBarWidth(100, maxVolume), 50);  // C
  assert.equal(volumeBarWidth(50, maxVolume), 25);   // D
  assert.equal(volumeBarWidth(10, maxVolume), 5);    // E
  assert.equal(volumeBarWidth(5, maxVolume), 2.5);   // F
  assert.equal(volumeBarWidth(0, maxVolume), 0);     // G
});

test("volumeBarWidth: com maxVolume zero (nenhuma disciplina praticada) não divide por zero", () => {
  assert.equal(volumeBarWidth(0, 0), 0);
});

test("performanceColor não muda com o volume (a partir do mínimo de amostra): 20% com 200 questões é igual a 20% com 10", () => {
  assert.equal(performanceColor(20, 200), performanceColor(20, 10));
});

test("performanceColor: amostra abaixo do mínimo é neutra (1 erro em 1 questão não é 'vermelho'); no mínimo já tem cor", () => {
  assert.equal(performanceColor(0, 1), PERFORMANCE_COLOR_NEUTRAL);
  assert.equal(performanceColor(100, 9), PERFORMANCE_COLOR_NEUTRAL);
  assert.equal(performanceColor(0, 10), 'rgb(220, 38, 38)');
});

test("performanceColor não muda com o volume: 60% é a mesma cor com 10, 100 ou 100000 questões", () => {
  const expected = performanceColor(60, 100);
  assert.equal(performanceColor(60, 10), expected);
  assert.equal(performanceColor(60, 100000), expected);
});

test("SLICE 2 discriminante: A (20%/200q) é pior desempenho e maior volume; F (95%/20q) é melhor desempenho e menor volume", () => {
  // Fixture com questionsCount/correctCount inteiros e REALIZÁVEIS — a
  // versão anterior derivava correctCount de um percentual via
  // Math.round (ex.: 49% de 20 = 9,8 → arredondava para 10 = 50% real,
  // não 49% como o nome afirmava). Aqui cada linha já é o par exato.
  const today = '2026-06-01';
  const fixture = [
    { name: 'A', q: 200, correct: 40, pct: 20 },
    { name: 'B', q: 100, correct: 49, pct: 49 },
    { name: 'C', q: 80, correct: 48, pct: 60 },
    { name: 'D', q: 60, correct: 42, pct: 70 },
    { name: 'E', q: 40, correct: 32, pct: 80 },
    { name: 'F', q: 20, correct: 19, pct: 95 },
    { name: 'G', q: 0, correct: 0, pct: null },
  ];
  const subjects = fixture.map((f, i) => ({ id: i + 1, name: f.name, color: 'DISC-BLUE' }));
  const units = fixture.map((f, i) => ({ id: i + 1, subjectId: i + 1 }));
  const evidence = fixture
    .filter((f) => f.q > 0)
    .map((f, i) => ({
      unitId: fixture.indexOf(f) + 1,
      questionsCount: f.q,
      correctCount: f.correct,
      evidenceDate: today,
    }));

  const results = Analytics.bySubject(evidence, units, subjects, today);
  const byName = Object.fromEntries(results.map((r) => [r.subjectName, r]));
  const maxVolume = Math.max(...results.map((r) => r.totalQuestions));

  // Fidelidade: o percentual calculado bate exatamente com o que o
  // fixture afirma para cada disciplina com evidência.
  for (const f of fixture) {
    if (f.pct == null) continue;
    assert.equal(byName[f.name].weightedAccuracy, f.pct, `${f.name} deveria ter exatamente ${f.pct}%`);
  }

  // A: pior desempenho, maior volume.
  assert.equal(byName.A.totalQuestions, 200);
  assert.ok(byName.A.weightedAccuracy < byName.F.weightedAccuracy);
  assert.ok(volumeBarWidth(byName.A.totalQuestions, maxVolume) > volumeBarWidth(byName.F.totalQuestions, maxVolume));

  // F: melhor desempenho, menor volume (exceto G, que não tem evidência).
  const withEvidence = results.filter((r) => r.totalQuestions > 0);
  const minVolume = Math.min(...withEvidence.map((r) => r.totalQuestions));
  assert.equal(byName.F.totalQuestions, minVolume);
  assert.equal(volumeBarWidth(byName.A.totalQuestions, maxVolume), 100);
  assert.equal(volumeBarWidth(byName.F.totalQuestions, maxVolume), 10);

  // C: laranja-âmbar (60%) em performance, independentemente de ter 80 questões.
  assert.equal(performanceColor(byName.C.weightedAccuracy, byName.C.totalQuestions), 'rgb(241, 135, 11)');

  // G: sem evidência, nunca "0% vermelho".
  assert.equal(byName.G.weightedAccuracy, null);
  assert.equal(byName.G.totalQuestions, 0);
  assert.equal(performanceColor(byName.G.weightedAccuracy, byName.G.totalQuestions), PERFORMANCE_COLOR_NEUTRAL);
  assert.equal(volumeBarWidth(byName.G.totalQuestions, maxVolume), 0);

  // Volume não altera performanceColor: mesma accuracy de C, volumes bem
  // diferentes, cor idêntica. performanceColor nem recebe correctCount, e
  // volumeBarWidth nem recebe accuracy — a independência é estrutural, não
  // só observada neste fixture.
  assert.equal(performanceColor(60, 80), performanceColor(60, 10));
});

test("every discipline colour in the palette has a readable name in the catalog (picker aria-labels)", () => {
  for (const key of SUBJECT_COLOR_KEYS) {
    const label = ptBR[`subject.color.${key.replace("DISC-", "").toLowerCase()}`];
    assert.match(label ?? "", /^[A-ZÀ-Ý]/, key);
  }
});
