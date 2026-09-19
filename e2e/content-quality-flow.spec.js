import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildFixturePdf } from '../server/test/pdf-fixtures/build-fixture-pdf.js';

// CONTENT-QUALITY CQ-4: one medical unit through the WHOLE product, on the LIVE-provider code path
// (real server, real UI, real PDF extraction) with the model endpoint replaced by a local stub that
// returns a flawed first draft, a semantic audit finding, and a targeted repair. The stub is a
// scripted double: it proves the PIPELINE (audit -> one repair -> revalidate -> DRAFT -> human accept
// -> study -> feedback -> evidence), NOT the quality of a real model.
//
//   PDF -> pages -> proposal -> draft (invented value + semantic contradiction) -> audit -> repair
//   -> reviewer sees flags + sources -> accept -> Plano shows the summary origin -> Study Now with
//   the WHY -> a wrong item -> error card -> redo -> exactly ONE evidence row (a redo is not evidence)

const SERVER_PORT = 13983;
const STUB_PORT = 13984;
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));

const PAGE_1 = 'Filtração glomerular. A filtração glomerular é determinada pelo balanço entre a pressão hidrostática capilar glomerular de 60 mmHg, que favorece a filtração, e a soma da pressão oncótica capilar de 32 mmHg com a pressão hidrostática da cápsula de Bowman de 18 mmHg, que se opõem. A pressão efetiva de filtração resulta em 10 mmHg. A taxa de filtração glomerular normal é cerca de 125 mL/min.';
const PAGE_2 = 'Regulação da filtração. A arteríola aferente dilata e a eferente contrai para aumentar a taxa de filtração glomerular. A angiotensina II contrai preferencialmente a arteríola eferente, mantendo a pressão hidrostática glomerular quando a perfusão renal cai. Os inibidores da enzima conversora reduzem essa contração e podem diminuir a taxa de filtração glomerular na estenose bilateral da artéria renal.';

const Q1 = {
  question: 'Qual é a taxa de filtração glomerular normal?', questionType: 'RECALL', answer: 'Cerca de 125 mL/min.',
  explanation: 'Resulta do balanço entre a pressão hidrostática capilar, que favorece a filtração, e as pressões oncótica e da cápsula de Bowman, que se opõem.',
  hint: 'Pense na ordem de grandeza por minuto.', sourceSpans: [{ pageIndex: 1 }],
};
const Q2_WRONG = {
  question: 'O que a angiotensina II faz na arteríola eferente?', questionType: 'MECHANISM', answer: 'Dilata a arteríola eferente, reduzindo a filtração.',
  explanation: 'A dilatação da eferente reduz a pressão hidrostática glomerular e a taxa de filtração glomerular.', hint: null, sourceSpans: [{ pageIndex: 2 }],
};
const Q2_RIGHT = {
  ...Q2_WRONG, answer: 'Contrai a arteríola eferente.',
  explanation: 'A eferente contraída mantém a pressão hidrostática glomerular quando a perfusão renal cai, sustentando a taxa de filtração glomerular.',
};
const Q3 = {
  question: 'Por que inibidores da enzima conversora podem diminuir a filtração na estenose bilateral da artéria renal?', questionType: 'APPLICATION',
  answer: 'Porque reduzem a contração da arteríola eferente.',
  explanation: 'Sem a contração da eferente a pressão hidrostática glomerular cai quando a perfusão renal já está baixa, e a taxa de filtração glomerular diminui.',
  hint: null, sourceSpans: [{ pageIndex: 2 }],
};
const SUMMARY_WRONG = 'A filtração glomerular resulta do balanço entre a pressão hidrostática capilar glomerular de 60 mmHg, que favorece a filtração, e a soma da pressão oncótica de 32 mmHg com a pressão da cápsula de Bowman de 18 mmHg, que se opõem; a pressão efetiva de filtração resulta em 25 mmHg. A taxa de filtração glomerular normal é cerca de 125 mL/min. A angiotensina II contrai a arteríola eferente, mantendo a pressão hidrostática glomerular.';
const SUMMARY_RIGHT = SUMMARY_WRONG.replace('25 mmHg', '10 mmHg');
const draft = (summary, q2) => ({ summary, summarySourceSpans: [{ pageIndex: 1 }, { pageIndex: 2 }], questions: [Q1, q2, Q3], modelVersion: 'stub-model-1', promptVersion: '3' });

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
        reply = { result: 'REPAIR', findings: [{ issue: 'ANSWER_CONTRADICTS_SOURCE', severity: 'HIGH', scope: 'question:1', generatedClaim: 'Dilata a arteríola eferente', sourceEvidence: 'A angiotensina II contrai preferencialmente a arteríola eferente.', repair: 'A angiotensina II contrai a arteríola eferente.' }] };
      } else if (prompt.includes('repairing a study draft')) {
        stubCalls.push('REPAIR');
        reply = draft(SUMMARY_RIGHT, Q2_RIGHT);
      } else {
        stubCalls.push('GENERATE');
        reply = draft(SUMMARY_WRONG, Q2_WRONG);
      }
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(reply) }] }));
    });
  });
  return new Promise((resolve) => stubServer.listen(STUB_PORT, '127.0.0.1', resolve));
}

test.beforeAll(async () => {
  await startStub();
  dataDir = mkdtempSync(join(tmpdir(), 'sl-e2e-cq-flow-'));
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: {
      ...process.env,
      SMARTLEARN_DB_PATH: join(dataDir, 'e2e.db'),
      SMARTLEARN_SOURCES_DIR: join(dataDir, 'sources'),
      PORT: String(SERVER_PORT),
      HOST: 'localhost',
      NODE_ENV: 'test',
      SMARTLEARN_ALLOWED_ORIGINS: 'http://localhost:5199',
      // the live path is gated on ALL of these; the endpoint is the local stub, never the network
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
  throw new Error('content-quality E2E: real server did not become ready in time');
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
  const email = `cq-flow-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
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

// Optional visual evidence for a human: SCREENSHOT_DIR=... npx playwright test e2e/content-quality-flow.spec.js
const shot = async (target, name) => { if (process.env.SCREENSHOT_DIR) await target.screenshot({ path: join(process.env.SCREENSHOT_DIR, `${name}.png`) }); };
const noHorizontalScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test('medical PDF -> audited draft -> human accept -> summary origin -> study with the WHY -> error card -> redo -> exactly one evidence row', async ({ page }) => {
  // 1) material -> pages -> proposal -> draft on the live path
  await page.locator('[data-screen="materials"]').click();
  await page.setInputFiles('#sources-file-input', { name: 'fisiologia-renal.pdf', mimeType: 'application/pdf', buffer: buildFixturePdf([PAGE_1, PAGE_2]) });
  await expect(page.locator('#sources-message')).toContainText('trecho(s) proposto(s)', { timeout: 10000 });
  const item = page.locator('.source-proposal-item').first();
  await item.locator('[data-action="generate-draft"]').click();
  const panel = item.locator('.source-draft-panel');
  await expect(panel.locator('.source-draft-audit')).toBeVisible({ timeout: 15000 });

  // 2) the production gate ran exactly: generate -> independent audit -> ONE repair (never a loop)
  expect(stubCalls).toEqual(['GENERATE', 'AUDIT', 'REPAIR']);

  // 3) what the reviewer sees is the REPAIRED draft, marked as such, still a DRAFT for a human
  await expect(panel.locator('.source-draft-caveat')).toContainText('não verificado');
  await expect(panel.locator('.source-draft-audit')).toContainText('corrigido uma vez automaticamente');
  await expect(panel.locator('.source-draft-audit')).toHaveAttribute('data-result', 'PASS'); // the repaired draft re-screens clean
  await expect(panel.locator('.source-draft-summary')).toContainText('10 mmHg');
  await expect(panel.locator('.source-draft-summary')).not.toContainText('25 mmHg');
  await expect(panel.locator('.source-draft-answer').nth(1)).toContainText('Contrai a arteríola eferente');
  await expect(panel.locator('.source-draft-question')).toHaveCount(3);
  await expect(panel.locator('.source-draft-question-type').first()).toHaveText('Recordação');
  await expect(panel.locator('.source-draft-explanation').first()).toContainText('Por quê: Resulta do balanço');

  await shot(panel, '1280-draft-review');

  // 4) the reviewer can verify: source pages beside the summary and each question, text one click away
  const summaryOrigin = panel.locator('.summary-source', { hasText: 'Fonte do resumo' });
  await expect(summaryOrigin).toContainText('páginas 1–2');
  await summaryOrigin.locator('summary').click();
  await expect(summaryOrigin.locator('.study-now-source-text').first()).toContainText('pressão efetiva de filtração resulta em 10 mmHg');
  await expect(panel.locator('.summary-source', { hasText: 'Fonte da questão' })).toHaveCount(3);

  // 5) mobile: the review panel fits a 375px screen without horizontal page scroll
  await page.setViewportSize({ width: 375, height: 800 });
  expect(await noHorizontalScroll(page)).toBe(true);
  await shot(panel, '375-draft-review');
  await page.setViewportSize({ width: 1280, height: 900 });

  // 6) human acceptance: only now does a unit exist
  await panel.locator('.source-draft-subject-input').fill('Fisiologia renal');
  await panel.locator('.source-draft-date-input').fill('2026-04-01');
  await panel.locator('[data-action="accept-draft"]').click();
  await expect(panel.locator('.source-draft-result')).toContainText('Aula criada', { timeout: 10000 });

  // 7) the accepted unit keeps its summary origin where the student reads the summary
  await page.locator('[data-screen="plan"]').click();
  const row = page.locator('.plan-row', { hasText: 'fisiologia-renal' });
  await row.locator('.plan-expand-btn').click();
  await expect(row.locator('.summary-source')).toContainText('Origem do resumo · fisiologia-renal.pdf, páginas 1–2', { timeout: 5000 });
  await expect(row.locator('.plan-exercise-item')).toHaveCount(3, { timeout: 5000 });
  await shot(row, '1280-plano-origem');

  // 8) study: 3 questions, each answer with its WHY after the reveal; the semantic-error item is judged wrong
  await row.locator('[data-action="plan-study-now"]').click();
  await expect(page.locator('#screen-study-now')).toBeVisible();
  const outcomes = ['correct', 'incorrect', 'correct'];
  for (let i = 0; i < 3; i += 1) {
    await expect(page.locator('#study-now-explanation-text')).toBeHidden();
    await page.locator('#study-now-reveal-btn').click();
    await expect(page.locator('#study-now-explanation-text')).toContainText('Por quê:');
    await page.locator(`#study-now-${outcomes[i]}-btn`).click();
  }

  // 9) the result: 2/3, the wrong item teaches (answer, WHY, exact source excerpt), and offers the redo
  await expect(page.locator('#study-now-result-card')).toBeVisible({ timeout: 8000 });
  const wrong = page.locator('#study-now-errors-list .study-now-error-item');
  await expect(wrong).toHaveCount(1);
  await expect(wrong.locator('.study-now-error-answer')).toHaveText('Contrai a arteríola eferente.');
  await expect(wrong.locator('.study-now-error-why')).toContainText('mantém a pressão hidrostática glomerular');
  await expect(wrong.locator('.study-now-source')).toContainText('Trecho do material · fisiologia-renal.pdf, página 2');
  expect(await noHorizontalScroll(page)).toBe(true);
  await shot(page.locator('#study-now-result-card'), '1280-study-result');
  await page.setViewportSize({ width: 375, height: 800 });
  expect(await noHorizontalScroll(page)).toBe(true);
  await shot(page.locator('#study-now-result-card'), '375-study-result');
  await page.setViewportSize({ width: 1280, height: 900 });

  // 10) redo the wrong item correctly -> "erros corrigidos", but a redo is recovery, NOT evidence
  await page.locator('#study-now-retest-btn').click();
  await page.locator('#study-now-reveal-btn').click();
  await page.locator('#study-now-correct-btn').click();
  await expect(page.locator('#study-now-result-text')).toHaveText('1/1 erros corrigidos', { timeout: 8000 });

  const evidence = await page.evaluate(async (base) => {
    const units = await (await fetch(`${base}/v1/learning-units`, { credentials: 'include' })).json();
    const res = await fetch(`${base}/v1/learning-evidence?unitId=${units.units[0].id}`, { credentials: 'include' });
    return res.json();
  }, API_BASE);
  expect(evidence.evidence).toHaveLength(1);
  expect(evidence.evidence[0]).toMatchObject({ type: 'INITIAL_PRACTICE', questionsCount: 3, correctCount: 2 });

  // 11) the model was consulted only to PRODUCE the material: studying and redoing added no model call
  expect(stubCalls).toEqual(['GENERATE', 'AUDIT', 'REPAIR']);
});
