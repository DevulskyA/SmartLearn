import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

// CONTENT-QUALITY CQ-3: feedback that teaches. An exercise with an explanation shows it together with
// the answer (Study Now practice, and the error card at the end of a block); one without shows nothing
// extra (never an invented "why"). Real server, real UI.

const SERVER_PORT = 13981;
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));

let serverProcess;
let dbDir;

test.beforeAll(async () => {
  dbDir = mkdtempSync(join(tmpdir(), 'sl-e2e-explanation-'));
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: { ...process.env, SMARTLEARN_DB_PATH: join(dbDir, 'e2e.db'), PORT: String(SERVER_PORT), HOST: 'localhost', NODE_ENV: 'test', SMARTLEARN_ALLOWED_ORIGINS: 'http://localhost:5199' },
    stdio: 'ignore',
  });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${API_BASE}/health/ready`)).status === 200) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('exercise-explanation E2E: real server did not become ready in time');
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
  const email = `expl-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
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

test('the answer comes with its WHY in Study Now, and a wrong item shows the WHY on the error card; an exercise without one shows nothing extra', async ({ page }) => {
  const { unit } = await apiCall(page, '/v1/learning-units', { newSubjectName: 'Renal Why', title: 'Filtração Why', studyDate: '2026-04-01' });
  await apiCall(page, `/v1/learning-units/${unit.id}/exercises`, {
    question: 'Qual a taxa de filtração glomerular normal?', answer: 'Cerca de 125 mL/min.',
    explanation: 'Resulta do balanço entre a pressão hidrostática, que favorece a filtração, e as pressões oncótica e da cápsula, que se opõem.',
    provenance: 'AI_GENERATED',
  });
  await apiCall(page, `/v1/learning-units/${unit.id}/exercises`, { question: 'Pergunta manual?', answer: 'Resposta manual', provenance: 'MANUAL' });

  await page.locator('[data-screen="plan"]').click();
  const row = page.locator('.plan-row', { hasText: 'Filtração Why' });
  await row.locator('.plan-expand-btn').click();
  await expect(row.locator('.plan-exercise-item')).toHaveCount(2, { timeout: 5000 });
  await row.locator('[data-action="plan-study-now"]').click();

  // 1st question: the answer and its explanation appear together, only after the reveal
  await expect(page.locator('#study-now-question-text')).toHaveText('Qual a taxa de filtração glomerular normal?');
  await expect(page.locator('#study-now-explanation-text')).toBeHidden();
  await page.locator('#study-now-reveal-btn').click();
  await expect(page.locator('#study-now-answer-text')).toHaveText('Cerca de 125 mL/min.');
  await expect(page.locator('#study-now-explanation-text')).toBeVisible();
  await expect(page.locator('#study-now-explanation-text')).toContainText('Por quê: Resulta do balanço entre a pressão hidrostática');
  await page.locator('#study-now-incorrect-btn').click();

  // 2nd question is manual: no explanation, no empty "Por quê"
  await expect(page.locator('#study-now-question-text')).toHaveText('Pergunta manual?');
  await expect(page.locator('#study-now-explanation-text')).toBeHidden();
  await page.locator('#study-now-reveal-btn').click();
  await expect(page.locator('#study-now-explanation-text')).toBeHidden();
  await page.locator('#study-now-correct-btn').click();

  // the wrong item on the result card teaches too
  const wrong = page.locator('#study-now-errors .study-now-error-item, .study-now-error-item').first();
  await expect(wrong).toBeVisible({ timeout: 8000 });
  await expect(wrong.locator('.study-now-error-why')).toContainText('Resulta do balanço entre a pressão hidrostática');
});
