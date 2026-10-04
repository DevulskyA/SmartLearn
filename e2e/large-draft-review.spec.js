import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildFixturePdf } from '../server/test/pdf-fixtures/build-fixture-pdf.js';
import { VITE_ORIGIN, serverPort } from './support/ports.js';

// CQ-7: a REALISTICALLY LARGE draft (50 questions, 2 of them flagged) can be reviewed, corrected and accepted without
// losing context or edits. The content is deliberately synthetic (Zeta/Omega terms): this measures the review
// experience at scale, not medical quality. The model endpoint is a local stub on the live-provider path.

const SERVER_PORT = serverPort(13985);
const STUB_PORT = serverPort(13986);
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));

const N = 50;
const sentence = (i) => `O marcador Zeta${i} eleva o parâmetro Omega${i} durante a fase experimental.`;
const PAGES = Array.from({ length: 5 }, (_, p) => Array.from({ length: 10 }, (_, k) => sentence(p * 10 + k + 1)).join(' '));
const question = (i) => ({
  question: `O que o marcador Zeta${i} eleva?`,
  questionType: 'RECALL',
  answer: `O parâmetro Omega${i}.`,
  explanation: `O marcador Zeta${i} eleva o parâmetro Omega${i} durante a fase experimental.`,
  hint: null,
  sourceSpans: [{ pageIndex: Math.floor((i - 1) / 10) + 1 }],
});
const FLAG_THIN = 30; // 1-based: bare answer, no explanation  -> HIGH
const FLAG_VALUE = 41; // explanation with a value the page never states -> HIGH
const questions = Array.from({ length: N }, (_, k) => {
  const i = k + 1;
  const q = question(i);
  if (i === FLAG_THIN) return { ...q, answer: '7', explanation: null };
  if (i === FLAG_VALUE) return { ...q, explanation: `${q.explanation} Ele chega a 999 unidades.` };
  return q;
});
const SUMMARY = 'O marcador Zeta eleva o parâmetro Omega durante a fase experimental em cada uma das páginas do documento, com cinquenta itens de conferência.';
const DRAFT = { summary: SUMMARY, summarySourceSpans: [{ pageIndex: 1 }, { pageIndex: 2 }, { pageIndex: 3 }, { pageIndex: 4 }, { pageIndex: 5 }], questions, modelVersion: 'stub-model-1', promptVersion: '3' };

let stubServer;
let serverProcess;
let dataDir;

function startStub() {
  stubServer = createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const prompt = JSON.parse(Buffer.concat(chunks).toString()).messages[0].content;
      // generation and "repair" both return the same flagged draft (the repair does not fix it); the audit finds nothing extra
      const reply = prompt.includes('strict medical content auditor') ? { result: 'PASS', findings: [] } : DRAFT;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(reply) }] }));
    });
  });
  return new Promise((resolve) => stubServer.listen(STUB_PORT, '127.0.0.1', resolve));
}

test.beforeAll(async () => {
  await startStub();
  dataDir = mkdtempSync(join(tmpdir(), 'sl-e2e-large-draft-'));
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: {
      ...process.env,
      SMARTLEARN_DB_PATH: join(dataDir, 'e2e.db'),
      SMARTLEARN_SOURCES_DIR: join(dataDir, 'sources'),
      PORT: String(SERVER_PORT),
      HOST: 'localhost',
      NODE_ENV: 'test',
      SMARTLEARN_ALLOWED_ORIGINS: VITE_ORIGIN,
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
  throw new Error('large-draft E2E: real server did not become ready in time');
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
  const email = `large-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
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
const inViewport = (locator) => locator.evaluate((el) => {
  const r = el.getBoundingClientRect();
  return r.top >= 0 && r.bottom <= window.innerHeight;
});

test('a 50-question draft: find the flagged items from the findings, fix them, keep every other edit, accept, and get exactly what was reviewed', async ({ page }) => {
  await page.locator('[data-screen="materials"]').click();
  await page.setInputFiles('#sources-file-input', { name: 'grande.pdf', mimeType: 'application/pdf', buffer: buildFixturePdf(PAGES) });
  await expect(page.locator('#sources-message')).toContainText('trecho(s) proposto(s)', { timeout: 15000 });
  const started = Date.now();
  await page.locator('.source-proposal-item').first().locator('[data-action="generate-draft"]').click();
  const panel = page.locator('.lesson-editor');
  await expect(panel).toBeVisible({ timeout: 20000 });
  console.log(`[CQ-7] generate -> reviewable draft (50 questions): ${Date.now() - started} ms`);

  // everything arrived: 50 questions, 2 flagged, and each flag says WHICH question
  await panel.getByRole('tab', { name: /Questões/ }).click();
  await expect(panel.locator('.lesson-qitem')).toHaveCount(N);
  await expect(panel.locator('.lesson-qitem[data-state="flagged"]')).toHaveCount(2);
  await expect(panel.locator('.lesson-qitem').nth(FLAG_THIN - 1)).toContainText('Sinalizada');
  await expect(panel.locator('.lesson-qitem').nth(FLAG_VALUE - 1)).toContainText('Sinalizada');
  await panel.getByRole('tab', { name: /Revisão/ }).click();
  const review = panel.locator('[data-panel="review"]');
  await expect(review.locator('.lesson-review-name', { hasText: `Questão ${FLAG_THIN}` })).toBeVisible();
  await expect(review.locator('.lesson-review-name', { hasText: `Questão ${FLAG_VALUE}` })).toBeVisible();

  // the reviewer must be able to REACH a flagged item without scrolling through 50 blocks: one click from the review
  await review.locator('summary', { hasText: `Questão ${FLAG_THIN}` }).click();
  await review.locator('[data-action="goto-entity"]', { hasText: `questão ${FLAG_THIN}` }).first().click();
  await expect(panel.locator('[role="tab"][aria-selected="true"]')).toContainText('Questões');
  await expect(panel.locator('.lesson-qitem').nth(FLAG_THIN - 1)).toHaveAttribute('aria-current', 'true');
  await expect(panel.locator('.lesson-qeditor textarea').first()).toBeFocused();
  expect(await inViewport(panel.locator('.lesson-qeditor textarea').first())).toBe(true);
  // and the flagged question's own findings are shown WITH it, not poured into the content
  await expect(panel.locator('.lesson-qeditor .lesson-findings')).toContainText('Resposta sem explicação suficiente');

  // fix #1 (bare answer -> real answer + explanation), and ALSO edit an unflagged question in the middle to prove nothing is lost
  await panel.locator('.lesson-qeditor textarea').nth(1).fill(`O parâmetro Omega${FLAG_THIN}.`);
  await panel.locator('.lesson-qeditor textarea').nth(2).fill(`O marcador Zeta${FLAG_THIN} eleva o parâmetro Omega${FLAG_THIN} durante a fase experimental.`);
  await panel.locator('[data-action="save-question"]').click();
  await expect(panel.locator('.lesson-qeditor .lesson-message')).toContainText('Questão salva', { timeout: 15000 });
  await panel.locator('.lesson-qitem').nth(9).click();
  await panel.locator('.lesson-qeditor textarea').first().fill('O que o marcador Zeta10 eleva, segundo a página?');
  await panel.locator('[data-action="save-question"]').click();
  await expect(panel.locator('.lesson-qeditor .lesson-message')).toContainText('Questão salva', { timeout: 15000 });
  // the fixed question is no longer flagged; the other flagged question still is; nothing else moved
  await expect(panel.locator('.lesson-qitem[data-state="flagged"]')).toHaveCount(1);
  await expect(panel.locator('.lesson-qitem').nth(FLAG_VALUE - 1)).toContainText('Sinalizada');
  await expect(panel.locator('.lesson-qitem')).toHaveCount(N);

  // the edit made BEFORE the next save is still there, and the remaining flag is one click away
  await panel.locator('.lesson-qitem').nth(9).click();
  await expect(panel.locator('.lesson-qeditor textarea').first()).toHaveValue('O que o marcador Zeta10 eleva, segundo a página?');
  await panel.locator('.lesson-qitem').nth(FLAG_VALUE - 1).click();
  await panel.locator('.lesson-qeditor textarea').nth(2).fill(`O marcador Zeta${FLAG_VALUE} eleva o parâmetro Omega${FLAG_VALUE} durante a fase experimental.`);
  await panel.locator('[data-action="save-question"]').click();
  await expect(panel.locator('.lesson-qeditor .lesson-message')).toContainText('Questão salva', { timeout: 15000 });
  await expect(panel.locator('.lesson-qitem[data-state="flagged"]')).toHaveCount(0);

  // the summary was flagged too (words the source never uses): fixed in its own area, without touching a question
  await panel.getByRole('tab', { name: /Revisão/ }).click();
  await expect(review.locator('.lesson-review-name', { hasText: 'Resumo' })).toBeVisible({ timeout: 15000 });
  await review.locator('summary', { hasText: 'Resumo' }).click();
  await review.locator('[data-action="goto-entity"]', { hasText: 'resumo' }).first().click();
  await expect(panel.locator('.lesson-summary-input')).toBeFocused();
  await panel.locator('.lesson-summary-input').fill('O marcador Zeta eleva o parâmetro Omega durante a fase experimental em cada uma das páginas.');
  await panel.locator('[data-action="save-summary"]').click();
  await expect(panel.locator('[data-panel="summary"] .lesson-message')).toContainText('Resumo salvo', { timeout: 15000 });
  await panel.getByRole('tab', { name: /Revisão/ }).click();
  await expect(review).toContainText('Nada sinalizado', { timeout: 15000 });

  // mobile: the reviewed lesson at 375px has no horizontal page scroll
  await page.setViewportSize({ width: 375, height: 800 });
  expect(await noHorizontalScroll(page)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });

  // accept: the unit is EXACTLY what was reviewed (50 exercises, both fixes, the unrelated edit, nothing else changed)
  await panel.locator('.source-draft-subject-input').fill('Grande CQ7');
  await panel.locator('.source-draft-date-input').fill('2026-05-01');
  await panel.locator('[data-action="accept-draft"]').click();
  await expect(panel.locator('.source-draft-result')).toContainText('50 exercício(s)', { timeout: 20000 });
  const exercises = await page.evaluate(async (base) => {
    const units = await (await fetch(`${base}/v1/learning-units`, { credentials: 'include' })).json();
    const res = await fetch(`${base}/v1/learning-units/${units.units[0].id}/exercises`, { credentials: 'include' });
    return (await res.json()).exercises.map((e) => e.currentVersion);
  }, API_BASE);
  expect(exercises).toHaveLength(N);
  expect(exercises[FLAG_THIN - 1]).toMatchObject({ answer: `O parâmetro Omega${FLAG_THIN}.` });
  expect(exercises[FLAG_THIN - 1].explanation).toContain(`Zeta${FLAG_THIN}`);
  expect(exercises[FLAG_VALUE - 1].explanation).not.toContain('999');
  expect(exercises[9].question).toBe('O que o marcador Zeta10 eleva, segundo a página?');
  expect(exercises[0].question).toBe('O que o marcador Zeta1 eleva?');
  expect(exercises[N - 1].question).toBe(`O que o marcador Zeta${N} eleva?`);
});
