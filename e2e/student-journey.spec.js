import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildFixturePdf } from '../server/test/pdf-fixtures/build-fixture-pdf.js';

// GUI-05: ONE student journey through the whole product, in one profile and one database (real server,
// real UI, real PDF extraction; the model endpoint is a scripted local stub on the live-provider code
// path, so this proves the FLOW, not the quality of a model). Nothing is seeded through the API: every
// step is reached by the UI, and each step must leave the student a visible way forward.
//
//   material -> unit draft (Resumo Mestre + questions) -> review/accept -> Plano -> study (feedback)
//   -> redo -> prova (no feedback) -> correction -> registered result -> Estatisticas -> next action

const SERVER_PORT = 13985;
const STUB_PORT = 13986;
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));

const PAGE_1 = 'Filtração glomerular. A filtração glomerular é determinada pelo balanço entre a pressão hidrostática capilar glomerular de 60 mmHg, que favorece a filtração, e a soma da pressão oncótica capilar de 32 mmHg com a pressão hidrostática da cápsula de Bowman de 18 mmHg, que se opõem. A pressão efetiva de filtração resulta em 10 mmHg. A taxa de filtração glomerular normal é cerca de 125 mL/min.';
const PAGE_2 = 'Regulação da filtração. A arteríola aferente dilata e a eferente contrai para aumentar a taxa de filtração glomerular. A angiotensina II contrai preferencialmente a arteríola eferente, mantendo a pressão hidrostática glomerular quando a perfusão renal cai. Os inibidores da enzima conversora reduzem essa contração e podem diminuir a taxa de filtração glomerular na estenose bilateral da artéria renal.';

const QUESTIONS = [
  {
    question: 'Qual é a taxa de filtração glomerular normal?', questionType: 'RECALL', answer: 'Cerca de 125 mL/min.',
    explanation: 'Resulta do balanço entre a pressão hidrostática capilar, que favorece a filtração, e as pressões oncótica e da cápsula de Bowman, que se opõem.',
    hint: null, sourceSpans: [{ pageIndex: 1 }],
  },
  {
    question: 'O que a angiotensina II faz na arteríola eferente?', questionType: 'MECHANISM', answer: 'Contrai a arteríola eferente.',
    explanation: 'A eferente contraída mantém a pressão hidrostática glomerular quando a perfusão renal cai, sustentando a taxa de filtração glomerular.',
    hint: null, sourceSpans: [{ pageIndex: 2 }],
  },
  {
    question: 'Por que inibidores da enzima conversora podem diminuir a filtração na estenose bilateral da artéria renal?', questionType: 'APPLICATION',
    answer: 'Porque reduzem a contração da arteríola eferente.',
    explanation: 'Sem a contração da eferente a pressão hidrostática glomerular cai quando a perfusão renal já está baixa, e a taxa de filtração glomerular diminui.',
    hint: null, sourceSpans: [{ pageIndex: 2 }],
  },
];
const SUMMARY = 'A filtração glomerular resulta do balanço entre a pressão hidrostática capilar glomerular de 60 mmHg, que favorece a filtração, e a soma da pressão oncótica de 32 mmHg com a pressão da cápsula de Bowman de 18 mmHg, que se opõem; a pressão efetiva de filtração resulta em 10 mmHg. A taxa de filtração glomerular normal é cerca de 125 mL/min. A angiotensina II contrai a arteríola eferente, mantendo a pressão hidrostática glomerular.';

let stubServer;
let stubCalls;
let serverProcess;
let dataDir;

function startStub() {
  stubCalls = [];
  stubServer = createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const prompt = JSON.parse(Buffer.concat(chunks).toString()).messages[0].content;
      let reply;
      if (prompt.includes('strict medical content auditor')) {
        stubCalls.push('AUDIT');
        reply = { result: 'PASS', findings: [] };
      } else {
        stubCalls.push('GENERATE');
        reply = { summary: SUMMARY, summarySourceSpans: [{ pageIndex: 1 }, { pageIndex: 2 }], questions: QUESTIONS, modelVersion: 'stub-model-1', promptVersion: '3' };
      }
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(reply) }] }));
    });
  });
  return new Promise((resolve) => stubServer.listen(STUB_PORT, '127.0.0.1', resolve));
}

test.beforeAll(async () => {
  await startStub();
  dataDir = mkdtempSync(join(tmpdir(), 'sl-e2e-journey-'));
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: {
      ...process.env,
      SMARTLEARN_DB_PATH: join(dataDir, 'e2e.db'),
      SMARTLEARN_SOURCES_DIR: join(dataDir, 'sources'),
      PORT: String(SERVER_PORT),
      HOST: 'localhost',
      NODE_ENV: 'test',
      SMARTLEARN_ALLOWED_ORIGINS: 'http://localhost:5199',
      SMARTLEARN_AI_API_KEY: 'stub-key',
      SMARTLEARN_AI_MODEL: 'stub-model',
      SMARTLEARN_AI_CONSENT: 'true',
      SMARTLEARN_AI_BUDGET_CAP_USD: '5',
      SMARTLEARN_AI_API_URL: `http://127.0.0.1:${STUB_PORT}/v1/messages`,
    },
    stdio: 'ignore',
  });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${API_BASE}/health/ready`)).status === 200) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('journey E2E: real server did not become ready in time');
});

test.afterAll(async () => {
  serverProcess?.kill();
  await new Promise((r) => stubServer?.close(r));
  await new Promise((r) => setTimeout(r, 300));
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript((base) => {
    window.__SMARTLEARN_API_BASE__ = base;
    window.__SMARTLEARN_REMOTE_MODE__ = true;
    window.__SMARTLEARN_LOCAL_AUTHORITY__ = true;
  }, API_BASE);
  const email = `journey-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const password = 'a genuinely long test password 1';
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.locator('[data-screen="account"]').click();
  await page.locator('#account-show-register').click();
  await page.locator('#account-register-email').fill(email);
  await page.locator('#account-register-password').fill(password);
  await page.locator('#account-register-form button[type="submit"]').click();
  await expect(page.locator('#account-login-form')).toBeVisible({ timeout: 5000 });
  await page.locator('#account-login-email').fill(email);
  await page.locator('#account-login-password').fill(password);
  await page.locator('#account-login-form button[type="submit"]').click();
  await expect(page.locator('#account-logged-in-view')).toBeVisible({ timeout: 5000 });
});

const noHorizontalScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
const api = (page, path) => page.evaluate(async ({ base, path }) => (await fetch(`${base}${path}`, { credentials: 'include' })).json(), { base: API_BASE, path });

test('journey: PDF -> reviewed unit -> study with feedback -> exam with no feedback -> corrected result -> Estatisticas -> next action, at 1280 and 375', async ({ page }) => {
  // 1) MATERIAL -> UNIT: a PDF becomes a reviewable draft (summary + questions), accepted by a human
  await page.locator('[data-screen="materials"]').click();
  await page.setInputFiles('#sources-file-input', { name: 'fisiologia-renal.pdf', mimeType: 'application/pdf', buffer: buildFixturePdf([PAGE_1, PAGE_2]) });
  await expect(page.locator('#sources-message')).toContainText('trecho(s) proposto(s)', { timeout: 10000 });
  const item = page.locator('.source-proposal-item').first();
  await item.locator('[data-action="generate-draft"]').click();
  const panel = item.locator('.source-draft-panel');
  await expect(panel.locator('.source-draft-audit')).toBeVisible({ timeout: 15000 });
  await expect(panel.locator('.source-draft-question')).toHaveCount(3);
  await panel.locator('.source-draft-subject-input').fill('Fisiologia renal');
  await panel.locator('.source-draft-date-input').fill('2030-01-01');
  await panel.locator('[data-action="accept-draft"]').click();
  await expect(panel.locator('.source-draft-result')).toContainText('Aula criada', { timeout: 10000 });

  // 2) PLANO: the unit is there with its summary origin and questions; a way to study and to be examined
  await page.locator('[data-screen="plan"]').click();
  const row = page.locator('.plan-row', { hasText: 'fisiologia-renal' });
  await row.locator('.plan-expand-btn').click();
  await expect(row.locator('.summary-source')).toContainText('Origem do resumo', { timeout: 5000 });
  await expect(row.locator('.plan-exercise-item')).toHaveCount(3, { timeout: 5000 });
  await expect(row.locator('[data-action="plan-study-now"]')).toBeVisible();
  await expect(row.locator('[data-action="plan-exam"]')).toBeVisible();

  // 3) STUDY with feedback: reveal shows the answer and the WHY; the student misses the mechanism question
  await row.locator('[data-action="plan-study-now"]').click();
  await expect(page.locator('#screen-study-now')).toBeVisible();
  for (const outcome of ['correct', 'incorrect', 'correct']) {
    await page.locator('#study-now-reveal-btn').click();
    await expect(page.locator('#study-now-explanation-text')).toContainText('Por quê:');
    await page.locator(`#study-now-${outcome}-btn`).click();
  }
  await expect(page.locator('#study-now-result-card')).toBeVisible({ timeout: 8000 });
  const wrong = page.locator('#study-now-errors-list .study-now-error-item');
  await expect(wrong).toHaveCount(1);
  await expect(wrong.locator('.study-now-error-answer')).toHaveText('Contrai a arteríola eferente.');
  await expect(wrong.locator('.study-now-source')).toContainText('página 2');
  // the study result never strands the student: redo the error, or leave
  await expect(page.locator('#study-now-retest-btn')).toBeVisible();
  await expect(page.locator('#study-now-done-btn')).toBeVisible();
  expect(await noHorizontalScroll(page)).toBe(true);
  await page.setViewportSize({ width: 375, height: 800 });
  expect(await noHorizontalScroll(page)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });

  // 4) REVIEW: redo the error right away — recovery, not evidence
  await page.locator('#study-now-retest-btn').click();
  await page.locator('#study-now-reveal-btn').click();
  await page.locator('#study-now-correct-btn').click();
  await expect(page.locator('#study-now-result-text')).toHaveText('1/1 erros corrigidos', { timeout: 8000 });
  let evidence = (await api(page, '/v1/learning-evidence')).evidence;
  expect(evidence).toHaveLength(1);
  await page.locator('#study-now-done-btn').click();

  // 5) PROVA: measure first — no gabarito/why before submitting; the student answers the mechanism wrongly again
  await page.locator('[data-screen="plan"]').click();
  const row2 = page.locator('.plan-row', { hasText: 'fisiologia-renal' });
  await row2.locator('.plan-expand-btn').click();
  await row2.locator('[data-action="plan-exam"]').click();
  await expect(page.locator('#exam-progress')).toHaveText('Questão 1 de 3');
  const answers = ['cerca de 125', 'dilata a eferente', 'reduzem a contração'];
  for (let i = 0; i < 3; i += 1) {
    const text = await page.locator('#screen-exam').innerText();
    expect(text).not.toContain('Contrai a arteríola eferente');
    expect(text).not.toContain('Por quê');
    await page.locator('#exam-answer-input').fill(answers[i]);
    if (i < 2) await page.locator('#exam-next-btn').click();
  }
  await page.setViewportSize({ width: 375, height: 800 });
  expect(await noHorizontalScroll(page)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator('#exam-submit-btn').click();
  await page.locator('#exam-submit-confirm-btn').click();
  await expect(page.locator('#exam-submitted')).toBeVisible({ timeout: 8000 });

  // 6) RESULT teaches after measuring: own answer beside the gabarito, the why, the source; score only once judged
  const items = page.locator('.exam-review-item');
  await expect(items).toHaveCount(3);
  await expect(items.nth(1).locator('.exam-review-student')).toHaveText('dilata a eferente');
  await expect(items.nth(1).locator('.exam-review-correct')).toHaveText('Contrai a arteríola eferente.');
  await expect(items.nth(1).locator('.exam-review-why')).toContainText('mantém a pressão hidrostática glomerular');
  await expect(page.locator('#exam-result-score')).toBeHidden();
  await items.nth(0).locator('.exam-correct-btn').click();
  await items.nth(1).locator('.exam-wrong-btn').click();
  await items.nth(2).locator('.exam-correct-btn').click();
  await expect(page.locator('#exam-result-score')).toHaveText('2/3 corretas — 66,7%');
  await page.setViewportSize({ width: 375, height: 800 });
  expect(await noHorizontalScroll(page)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });

  // 7) EVIDENCE: registering the result adds exactly ONE row (study 2/3 + exam 2/3), the error is "para reforçar"
  await page.locator('#exam-finalize-btn').click();
  await expect(page.locator('#exam-final-note')).toContainText('Resultado registrado no seu histórico (2/3)');
  evidence = (await api(page, '/v1/learning-evidence')).evidence;
  expect(evidence).toHaveLength(2);
  expect(evidence.map((e) => `${e.correctCount}/${e.questionsCount}`).sort()).toEqual(['2/3', '2/3']);
  const reinforcement = Object.values((await api(page, '/v1/reinforcement')).byUnit).flat();
  expect(reinforcement).toHaveLength(1);

  // 8) NEXT ACTION from the student's own evidence: the result offers it, Hoje suggests it, Estatisticas shows it
  await expect(page.locator('#exam-retest-btn')).toHaveText('Refazer erros (1)');
  await page.locator('[data-screen="today"]').click();
  const weak = page.locator('#block-weak');
  await expect(weak).toBeVisible({ timeout: 8000 });
  await expect(weak.locator('.weak-practice-row', { hasText: 'fisiologia-renal' })).toContainText('1 exercício para reforçar');
  await page.setViewportSize({ width: 375, height: 800 });
  expect(await noHorizontalScroll(page)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.locator('[data-screen="stats"]').click();
  await page.locator('#tab-stats-unit').click();
  await expect(page.locator('#unit-stats-list')).toContainText('fisiologia-renal', { timeout: 8000 });
  await expect(page.locator('#unit-stats-empty')).toBeHidden();
  await page.setViewportSize({ width: 375, height: 800 });
  expect(await noHorizontalScroll(page)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });

  // ...and the suggestion leads back to the unit where the reinforcement happens (no dead end)
  await page.locator('[data-screen="today"]').click();
  await page.locator('#block-weak .weak-practice-row', { hasText: 'fisiologia-renal' }).getByRole('button', { name: 'Ver no Plano' }).click();
  const row3 = page.locator('.plan-row', { hasText: 'fisiologia-renal' });
  await expect(row3.locator('.plan-reinforce-chip')).toHaveText('1 para reforçar', { timeout: 8000 });

  // 9) persistence: a reload keeps the whole journey; the model was consulted only to PRODUCE the material
  await page.reload();
  await page.waitForLoadState('networkidle');
  expect((await api(page, '/v1/learning-evidence')).evidence).toHaveLength(2);
  expect((await api(page, '/v1/learning-units')).units).toHaveLength(1);
  expect(stubCalls).toEqual(['GENERATE', 'AUDIT']);
});
