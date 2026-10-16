import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { VITE_ORIGIN, serverPort } from './support/ports.js';
import { signInRegistered } from './support/session.js';

// T30: proves the item-level attempt ledger (T29's schema, T30's service
// wired into the existing review-exercise reveal/judge UI) is populated by
// a real practice interaction, not just by direct service calls (already
// covered by server/test/attempts.test.js). Same real-server-child-process
// pattern as e2e/feature-parity.spec.js.

const SERVER_PORT = serverPort(13973);
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));

let serverProcess;
let dbDir;

test.beforeAll(async () => {
  dbDir = mkdtempSync(join(tmpdir(), 'sl-e2e-plan-study-'));
  const dbPath = join(dbDir, 'e2e.db');
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: { ...process.env, SMARTLEARN_DB_PATH: dbPath, PORT: String(SERVER_PORT), HOST: 'localhost', NODE_ENV: 'test', SMARTLEARN_ALLOWED_ORIGINS: VITE_ORIGIN },
    stdio: 'ignore',
  });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${API_BASE}/health/ready`)).status === 200) return; } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error('practice E2E: real server did not become ready in time');
});

test.afterAll(async () => {
  serverProcess?.kill();
  await new Promise(r => setTimeout(r, 300));
  rmSync(dbDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript((base) => {
    window.__SMARTLEARN_API_BASE__ = base;
    window.__SMARTLEARN_REMOTE_MODE__ = true;
  }, API_BASE);
  const email = `practice-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const password = 'a genuinely long test password 1';
  await signInRegistered(page, { email: email, password: password });
});

test('Plano: a unit with exercises but no first practice can start "Estudar agora" on demand, once', async ({ page }) => {
  await page.goto('/#register');
  await page.waitForLoadState('networkidle');
  await page.locator('#show-subject-form').click();
  await page.locator('#new-subject-input').fill('Plano Subject');
  await page.locator('#new-subject-form button[type="submit"]').click();
  await page.locator('#study-date').fill('2026-04-01');
  await page.locator('#study-content').fill('Plano Unit');
  await page.locator('#study-form button[type="submit"]').click();
  await expect(page.locator('#study-message')).toContainText('salvo', { timeout: 5000 });
  const studyRow = page.locator('.study-row', { hasText: 'Plano Unit' });
  await studyRow.getByRole('button', { name: 'Exercícios' }).click();
  await studyRow.locator('.exercise-question-input').fill('Pergunta Plano?');
  await studyRow.locator('.exercise-answer-input').fill('Resposta Plano');
  await studyRow.getByRole('button', { name: 'Adicionar exercício' }).click();
  await expect(studyRow.getByText('Pergunta Plano?')).toBeVisible({ timeout: 5000 });

  const openPlanRow = async () => {
    await page.locator('[data-screen="plan"]').click();
    const row = page.locator('.plan-row', { hasText: 'Plano Unit' });
    await expect(row).toBeVisible({ timeout: 5000 });
    await row.locator('.plan-expand-btn').click();
    await expect(row.locator('.plan-exercise-item')).toHaveCount(1, { timeout: 5000 });
    return row;
  };

  let row = await openPlanRow();
  await row.locator('[data-action="plan-study-now"]').click();
  await expect(page.locator('#screen-study-now')).toBeVisible();
  await expect(page.locator('#study-now-question-text')).toHaveText('Pergunta Plano?');
  await page.locator('#study-now-reveal-btn').click();
  await page.locator('#study-now-incorrect-btn').click();
  await expect(page.locator('#study-now-result-text')).toContainText('0/1');
  await expect(page.locator('#study-now-retest-btn')).toHaveText('Refazer erros (1)');

  // The pass is now recorded as INITIAL_PRACTICE: not offered a second time.
  row = await openPlanRow();
  await expect(row.locator('[data-action="plan-study-now"]')).toHaveCount(0);
});

test('saving a lesson right after creating a subject waits for the subject and keeps what was typed meanwhile', async ({ page }) => {
  // the subject request is slow on purpose: the user has already typed the lesson and saved before it answers
  await page.route('**/v1/subjects', async (route) => {
    if (route.request().method() === 'POST') await new Promise((resolve) => setTimeout(resolve, 600));
    await route.continue();
  });
  await page.goto('/#register');
  await page.waitForLoadState('networkidle');
  await page.locator('#show-subject-form').click();
  await page.locator('#new-subject-input').fill('Disciplina Lenta');
  await page.locator('#new-subject-form button[type="submit"]').click();
  await page.locator('#study-date').fill('2026-04-02');
  await page.locator('#study-content').fill('Aula durante a criacao');
  await page.locator('#study-form button[type="submit"]').click();
  await expect(page.locator('#study-message')).toContainText('salvo', { timeout: 5000 });
  await expect(page.locator('#study-date')).toHaveValue(/^(2026-04-02|)$/);
  await expect(page.locator('.study-row', { hasText: 'Aula durante a criacao' })).toBeVisible();
});
