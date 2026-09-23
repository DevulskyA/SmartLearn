import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildFixturePdf } from '../server/test/pdf-fixtures/build-fixture-pdf.js';

// CQ-7: a REALISTICALLY LARGE draft (50 questions, 2 of them flagged) can be reviewed, corrected and accepted without
// losing context or edits. The content is deliberately synthetic (Zeta/Omega terms): this measures the review
// experience at scale, not medical quality. The model endpoint is a local stub on the live-provider path.

const SERVER_PORT = 13985;
const STUB_PORT = 13986;
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
  const item = page.locator('.source-proposal-item').first();
  const started = Date.now();
  await item.locator('[data-action="generate-draft"]').click();
  const panel = item.locator('.source-draft-panel');
  await expect(panel.locator('.source-draft-audit')).toBeVisible({ timeout: 20000 });
  console.log(`[CQ-7] generate -> reviewable draft (50 questions): ${Date.now() - started} ms`);

  // everything arrived: 50 questions, 2 flagged, and each flag says WHICH question
  await expect(panel.locator('.source-draft-questions > li')).toHaveCount(N);
  await expect(panel.locator('.source-draft-audit-head')).toContainText('para verificar antes de aceitar');
  await expect(panel.locator('.source-draft-audit-issue', { hasText: `Questão ${FLAG_THIN} ·` }).first()).toBeVisible();
  await expect(panel.locator('.source-draft-audit-issue', { hasText: `Questão ${FLAG_VALUE} ·` }).first()).toBeVisible();

  // the reviewer must be able to REACH a flagged item without scrolling through 50 blocks
  const goThin = panel.locator('[data-action="goto-draft-question"][data-index="' + (FLAG_THIN - 1) + '"]').first();
  await expect(goThin).toBeVisible();
  await goThin.click();
  const thinGroup = panel.locator(`.source-draft-edit-question[data-index="${FLAG_THIN - 1}"]`);
  await expect(thinGroup.locator('.source-draft-edit-a')).toBeFocused();
  expect(await inViewport(thinGroup.locator('.source-draft-edit-a'))).toBe(true);
  // and the flagged question is marked where it is read, so a skim finds it too
  await expect(panel.locator('.source-draft-questions > li.is-flagged')).toHaveCount(2);

  // fix #1 (bare answer -> real answer + explanation), and ALSO edit an unflagged question in the middle to prove nothing is lost
  await thinGroup.locator('.source-draft-edit-a').fill(`O parâmetro Omega${FLAG_THIN}.`);
  await thinGroup.locator('.source-draft-edit-e').fill(`O marcador Zeta${FLAG_THIN} eleva o parâmetro Omega${FLAG_THIN} durante a fase experimental.`);
  const midGroup = panel.locator('.source-draft-edit-question[data-index="9"]');
  await midGroup.locator('.source-draft-edit-q').fill('O que o marcador Zeta10 eleva, segundo a página?');
  await panel.locator('[data-action="save-draft"]').click();
  await expect(page.locator('#sources-message')).toContainText('Correções salvas', { timeout: 15000 });
  // the fixed question's findings are gone; the other flagged question's remain
  await expect(panel.locator('.source-draft-audit-issue', { hasText: `Questão ${FLAG_THIN} ·` })).toHaveCount(0);
  await expect(panel.locator('.source-draft-audit-issue', { hasText: `Questão ${FLAG_VALUE} ·` }).first()).toBeVisible();
  await expect(panel.locator('.source-draft-questions > li')).toHaveCount(N);

  // the edit made BEFORE the re-render is still there, and the editor for the remaining flag is one click away
  await expect(panel.locator('.source-draft-questions > li').nth(9)).toContainText('O que o marcador Zeta10 eleva, segundo a página?');
  await panel.locator('[data-action="goto-draft-question"][data-index="' + (FLAG_VALUE - 1) + '"]').first().click();
  const valueGroup = panel.locator(`.source-draft-edit-question[data-index="${FLAG_VALUE - 1}"]`);
  await expect(valueGroup.locator('.source-draft-edit-a')).toBeFocused();
  await valueGroup.locator('.source-draft-edit-e').fill(`O marcador Zeta${FLAG_VALUE} eleva o parâmetro Omega${FLAG_VALUE} durante a fase experimental.`);
  await panel.locator('[data-action="save-draft"]').click();
  // the summary was flagged too (words the source never uses): same one-step path to it
  await expect(panel.locator('.source-draft-audit-issue', { hasText: 'Resumo ·' }).first()).toBeVisible({ timeout: 15000 });
  await panel.locator('[data-action="goto-draft-question"][data-index="summary"]').first().click();
  await expect(panel.locator('.source-draft-edit-summary')).toBeFocused();
  await panel.locator('.source-draft-edit-summary').fill('O marcador Zeta eleva o parâmetro Omega durante a fase experimental em cada uma das páginas.');
  await panel.locator('[data-action="save-draft"]').click();
  await expect(panel.locator('.source-draft-audit')).toHaveAttribute('data-result', 'PASS', { timeout: 15000 });

  // mobile: the reviewed panel at 375px has no horizontal page scroll
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
