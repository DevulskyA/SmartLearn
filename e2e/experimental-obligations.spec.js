import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { VITE_ORIGIN, serverPort } from './support/ports.js';

// EXPERIMENTAL panel on Hoje (D-13/D-14 decided profile, pause, daily plan by minutes): off by default, on by a switch in Configurações,
// real server, throwaway database. The standard Hoje must be identical with the switch off.

const SERVER_PORT = serverPort(13959);
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));

let serverProcess;
let dataDir;

test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'sl-e2e-exp-'));
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: { ...process.env, SMARTLEARN_DB_PATH: join(dataDir, 'e2e.db'), PORT: String(SERVER_PORT), HOST: 'localhost', NODE_ENV: 'test', SMARTLEARN_ALLOWED_ORIGINS: VITE_ORIGIN },
    stdio: 'ignore',
  });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${API_BASE}/health/ready`)).status === 200) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('experiment E2E: real server did not become ready in time');
});

test.afterAll(async () => {
  serverProcess?.kill();
  await new Promise((r) => setTimeout(r, 300));
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript((base) => { window.__SMARTLEARN_API_BASE__ = base; window.__SMARTLEARN_REMOTE_MODE__ = true; }, API_BASE);
  const email = `exp-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const password = 'a genuinely long test password 1';
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(async () => {
    await page.locator('[data-screen="account"]').click();
    await expect(page.locator('#account-show-register')).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20000 });
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

const api = (page, path, body) => page.evaluate(async ({ base, path, body }) => {
  const me = await (await fetch(`${base}/v1/auth/me`, { credentials: 'include' })).json();
  const res = await fetch(`${base}${path}`, { method: body === undefined ? 'GET' : 'POST', credentials: 'include', headers: { 'content-type': 'application/json', 'x-csrf-token': me.csrfToken }, body: body === undefined ? undefined : JSON.stringify(body) });
  return res.json();
}, { base: API_BASE, path, body });

test('off by default; the switch shows the panel; doing a review re-dates from today (one stage), pausing hides the unit from the plan with a reason; off again restores the standard Hoje', async ({ page }) => {
  await api(page, '/v1/learning-units', { newSubjectName: 'Fisiologia', title: 'Aula experimento', studyDate: '2026-01-01' });

  await page.locator('[data-screen="today"]').click();
  await expect(page.locator('#experiment-host .experiment-panel')).toHaveCount(0);

  await page.locator('[data-screen="settings"]').click();
  await page.locator('#experiment-switch').check();
  await page.locator('[data-screen="today"]').click();
  const panel = page.locator('#experiment-host .experiment-panel');
  await expect(panel).toBeVisible({ timeout: 10000 });
  const unit = panel.locator('li', { hasText: 'Aula experimento' });
  await expect(unit.locator('.experiment-unit-status')).toContainText('Revisão da etapa de 1 dias');
  await expect(unit).toContainText('etapas atrasadas agrupadas');

  // plan: minutes are typed by the student; without minutes per review nothing is guessed
  await panel.locator('input[name="availableMinutes"]').fill('30');
  await panel.getByRole('button', { name: 'Montar plano' }).click();
  await expect(panel.locator('.experiment-deferred')).toContainText('sem estimativa de minutos');

  // pause: the unit is not asked for, still listed in the plan with its reason
  await unit.getByRole('button', { name: 'Pausar' }).click();
  await expect(panel.locator('li', { hasText: 'Aula experimento' }).locator('.experiment-unit-status')).toHaveText('Revisões pausadas.');
  await panel.locator('input[name="availableMinutes"]').fill('30');
  await panel.locator('input[name="perReviewMinutes"]').fill('10');
  await panel.getByRole('button', { name: 'Montar plano' }).click();
  await expect(panel.locator('.experiment-deferred')).toContainText('pausada por você');
  await panel.getByRole('button', { name: 'Retomar' }).click();

  // doing the review: ONE stage, the pile is re-dated from today, nothing else is owed today
  await panel.getByRole('button', { name: 'Fazer a revisão' }).click();
  await expect(panel.locator('li', { hasText: 'Aula experimento' }).locator('.experiment-unit-status')).toContainText('Nada a revisar hoje');
  const tasks = (await api(page, '/v1/review-tasks')).reviewTasks;
  expect(tasks.filter((t) => t.completedAt).length).toBe(1);
  const evidence = (await api(page, '/v1/learning-evidence')).evidence;
  expect(evidence).toHaveLength(0);

  await page.locator('[data-screen="settings"]').click();
  await page.locator('#experiment-switch').uncheck();
  await page.locator('[data-screen="today"]').click();
  await expect(page.locator('#experiment-host .experiment-panel')).toHaveCount(0);
});
