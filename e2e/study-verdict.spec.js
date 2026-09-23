import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

// ANALYTICS-3: Estatísticas answers "Meu estudo está funcionando?" in plain text from
// observable evidence — a headline (melhorando / piorando / misto / estável / sem histórico),
// per-subject counts, and the ONE unit that deserves attention with a link to the Plano.
// Domain rules (pooling, minimums, no mastery) are pinned in test/study-verdict.test.js and
// test/longitudinal-trend.test.js; this proves the real screen, real server, mobile.

const SERVER_PORT = 13979;
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));

let serverProcess;
let dbDir;

test.beforeAll(async () => {
  dbDir = mkdtempSync(join(tmpdir(), 'sl-e2e-study-verdict-'));
  const dbPath = join(dbDir, 'e2e.db');
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: { ...process.env, SMARTLEARN_DB_PATH: dbPath, PORT: String(SERVER_PORT), HOST: 'localhost', NODE_ENV: 'test', SMARTLEARN_ALLOWED_ORIGINS: 'http://localhost:5199' },
    stdio: 'ignore',
  });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${API_BASE}/health/ready`)).status === 200) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('study-verdict E2E: real server did not become ready in time');
});

test.afterAll(async () => {
  serverProcess?.kill();
  await new Promise((r) => setTimeout(r, 300));
  rmSync(dbDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript((base) => {
    window.__SMARTLEARN_API_BASE__ = base;
    window.__SMARTLEARN_REMOTE_MODE__ = true;
  }, API_BASE);
  const email = `verdict-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
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

async function apiCall(page, path, body) {
  return page.evaluate(async ({ base, path, body }) => {
    const me = await (await fetch(`${base}/v1/auth/me`, { credentials: 'include' })).json();
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': me.csrfToken },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${path} -> ${res.status}: ${await res.text()}`);
    return res.json();
  }, { base: API_BASE, path, body });
}

const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

async function unitWithEvidence(page, subject, title, rows) {
  const { unit } = await apiCall(page, '/v1/learning-units', { newSubjectName: subject, title, studyDate: daysAgo(70) });
  for (const [ago, questionsCount, correctCount] of rows) {
    await apiCall(page, '/v1/learning-evidence', { unitId: unit.id, type: 'EXTERNAL', questionsCount, correctCount, evidenceDate: daysAgo(ago) });
  }
  return unit;
}

test('mixed areas: says so, counts them apart, names the falling unit with old -> recent accuracy and its items to reinforce, and opens it in the Plano', async ({ page }) => {
  await unitWithEvidence(page, 'Cardio Verdict', 'Ritmo cardíaco', [[45, 20, 8], [5, 20, 16]]); // 40% -> 80%
  const falling = await unitWithEvidence(page, 'Renal Verdict', 'Filtração glomerular', [[45, 20, 16], [5, 20, 8]]); // 80% -> 40%
  const { exercise } = await apiCall(page, `/v1/learning-units/${falling.id}/exercises`, { question: 'Qual a TFG normal?', answer: '90-120', provenance: 'MANUAL' });
  const { attempt } = await apiCall(page, `/v1/exercises/${exercise.id}/attempts`, {});
  await apiCall(page, `/v1/attempts/${attempt.id}/submit`, { outcome: 'INCORRECT', assessmentMethod: 'SELF_REPORT' });

  await page.locator('[data-screen="stats"]').click();
  const verdict = page.locator('#stats-verdict');
  await expect(verdict).toBeVisible({ timeout: 8000 });
  await expect(verdict).toHaveAttribute('role', 'status');
  await expect(page.locator('#stats-verdict-headline')).toHaveText(/Resultado misto/);
  await expect(page.locator('#stats-verdict-detail')).toContainText('1 melhorando · 1 piorando');
  const attention = page.locator('#stats-verdict-attention-text');
  await expect(attention).toContainText('Filtração glomerular');
  await expect(attention).toContainText('de 80% para 40%');
  await expect(attention).toContainText('1 exercício para reforçar');
  // never a mastery/score claim
  expect(await verdict.innerText()).not.toMatch(/dom[ií]n|mastery|reten[cç][aã]o|score/i);

  await page.locator('#stats-verdict-attention-btn').click();
  await expect(page.locator('#screen-plan')).toBeVisible();
  const row = page.locator('.plan-row', { hasText: 'Filtração glomerular' });
  await expect(row.locator('.plan-expand-btn')).toHaveAttribute('aria-expanded', 'true', { timeout: 8000 });
  await expect(row.locator('.plan-reinforce-chip')).toHaveText('1 para reforçar');
});

test('low volume is "sem histórico suficiente", never a bad verdict; a subject with no data is not counted as weak', async ({ page }) => {
  await unitWithEvidence(page, 'Pouco Volume', 'Aula curta', [[5, 4, 1]]); // 4 questions only
  await apiCall(page, '/v1/learning-units', { newSubjectName: 'Sem Dados', title: 'Aula vazia', studyDate: daysAgo(3) });

  await page.locator('[data-screen="stats"]').click();
  await expect(page.locator('#stats-verdict')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('#stats-verdict-headline')).toHaveText(/histórico suficiente/);
  await expect(page.locator('#stats-verdict-detail')).toContainText('4 questões');
  await expect(page.locator('#stats-verdict-attention')).toBeHidden();
});

test('no evidence at all: says there is not enough evidence to answer, no 0%', async ({ page }) => {
  await page.locator('[data-screen="stats"]').click();
  await expect(page.locator('#stats-verdict')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('#stats-verdict-headline')).toHaveText(/Ainda não há evidência/);
  expect(await page.locator('#stats-verdict').innerText()).not.toMatch(/0%/);
});

test('mobile 375: the answer fits without horizontal page scroll and the action stays reachable', async ({ page }) => {
  await unitWithEvidence(page, 'Cardio Mobile', 'Ritmo', [[45, 20, 16], [5, 20, 8]]); // falling
  await page.setViewportSize({ width: 375, height: 800 });
  await page.locator('[data-screen="stats"]:visible').first().click();
  await expect(page.locator('#stats-verdict-headline')).toHaveText(/piorando/, { timeout: 8000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const btn = page.locator('#stats-verdict-attention-btn');
  await expect(btn).toBeVisible();
  const box = await btn.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(44);
});
