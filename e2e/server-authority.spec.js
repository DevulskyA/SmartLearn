import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

// T21: proves the server-authoritative cutover with a real server, a real
// browser, and the REMOTE_MODE flag actually flipped on (never the default
// — see src/app.js's REMOTE_MODE comment). Every other E2E spec leaves the
// flag off and keeps exercising the local BrowserStore path unmodified;
// this file is the one place the new authority is actually driven end to
// end, per tasks.md T21's own required evidence: two contexts/accounts,
// server restart persistence, and a network-loss write failure with no
// silent BrowserStore fallback.

const SERVER_PORT = 13960;
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));

let serverProcess;
let dbDir;
let dbPath;

async function waitForReady(deadlineMs = 8000) {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${API_BASE}/health/ready`);
      if (res.status === 200) return;
    } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error('server-authority E2E: real server did not become ready in time');
}

function startServer() {
  return spawn(process.execPath, [MAIN_JS], {
    env: {
      ...process.env,
      SMARTLEARN_DB_PATH: dbPath,
      PORT: String(SERVER_PORT),
      HOST: 'localhost',
      NODE_ENV: 'test',
      SMARTLEARN_ALLOWED_ORIGINS: 'http://localhost:5199',
    },
    stdio: 'ignore',
  });
}

test.beforeAll(async () => {
  dbDir = mkdtempSync(join(tmpdir(), 'sl-e2e-server-authority-'));
  dbPath = join(dbDir, 'e2e.db');
  serverProcess = startServer();
  await waitForReady();
});

test.afterAll(async () => {
  serverProcess?.kill();
  await new Promise(r => setTimeout(r, 300));
  rmSync(dbDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

async function enableRemoteMode(page) {
  await page.addInitScript((base) => {
    window.__SMARTLEARN_API_BASE__ = base;
    window.__SMARTLEARN_REMOTE_MODE__ = true;
  }, API_BASE);
}

function uniqueEmail(label) {
  return `sa-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

async function registerAndLogin(page, email, password) {
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
}

async function createUnit(page, { subjectName, title, studyDate }) {
  await page.locator('[data-screen="plan"]').click();
  await page.locator('#plan-new-unit-btn').click();
  await page.locator('#plan-show-subject-form').click();
  await page.locator('#plan-new-subject-input').fill(subjectName);
  await page.locator('#plan-study-date').fill(studyDate);
  await page.locator('#plan-study-title').fill(title);
  await page.locator('#plan-unit-save-btn').click();
}

test('an unauthenticated visitor is redirected to the login screen instead of seeing an empty agenda', async ({ page }) => {
  await enableRemoteMode(page);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#account-logged-out-view')).toBeVisible({ timeout: 5000 });
});

test('two browser contexts logged in as the SAME account observe the exact same server-authoritative state', async ({ browser }) => {
  const email = uniqueEmail('shared');
  const password = 'a genuinely long test password 1';

  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();
  await enableRemoteMode(pageA);
  await registerAndLogin(pageA, email, password);
  await expect(pageA.locator('#account-logged-in-view')).toBeVisible({ timeout: 5000 });

  await createUnit(pageA, { subjectName: 'Cardiologia E2E', title: 'Debito Cardiaco E2E', studyDate: '2020-01-01' });
  await pageA.locator('[data-screen="today"]').click();
  await expect(pageA.locator('[data-review-list="overdue"] .review-row').first()).toBeVisible({ timeout: 5000 });

  // A second, independent browser context — its own cookie jar, its own
  // process-level page — logging in as the SAME account must see the
  // SAME data, because the server (not either browser) is the authority.
  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  await enableRemoteMode(pageB);
  await pageB.goto('/');
  await pageB.waitForLoadState('networkidle');
  await pageB.locator('[data-screen="account"]').click();
  await pageB.locator('#account-login-email').fill(email);
  await pageB.locator('#account-login-password').fill(password);
  await pageB.locator('#account-login-form button[type="submit"]').click();
  await expect(pageB.locator('#account-logged-in-view')).toBeVisible({ timeout: 5000 });

  await pageB.locator('[data-screen="today"]').click();
  await expect(pageB.locator('[data-review-list="overdue"] .review-row').first()).toContainText('Debito Cardiaco E2E', { timeout: 5000 });

  // Complete the review from context B; context A must observe the change
  // after its own next refresh (state lives on the server, not in either
  // browser's local storage).
  await pageB.locator('[data-review-list="overdue"] [data-action="review-done"]').first().check();
  await expect(pageB.locator('text=1 feita')).toBeVisible({ timeout: 5000 });

  await pageA.locator('[data-screen="plan"]').click();
  await pageA.locator('[data-screen="today"]').click();
  await expect(pageA.locator('text=1 feita')).toBeVisible({ timeout: 5000 });

  await contextA.close();
  await contextB.close();
});

test('a second, different account never sees the first account\'s data', async ({ browser }) => {
  const emailA = uniqueEmail('isoA');
  const emailB = uniqueEmail('isoB');
  const password = 'a genuinely long test password 1';

  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();
  await enableRemoteMode(pageA);
  await registerAndLogin(pageA, emailA, password);
  await expect(pageA.locator('#account-logged-in-view')).toBeVisible({ timeout: 5000 });
  await createUnit(pageA, { subjectName: 'Isolamento A', title: 'Conteudo Exclusivo De A', studyDate: '2026-01-01' });
  await pageA.locator('[data-screen="plan"]').click();
  await expect(pageA.locator('#screen-plan').getByText('Conteudo Exclusivo De A')).toBeVisible({ timeout: 5000 });

  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  await enableRemoteMode(pageB);
  await registerAndLogin(pageB, emailB, password);
  await expect(pageB.locator('#account-logged-in-view')).toBeVisible({ timeout: 5000 });
  await pageB.locator('[data-screen="plan"]').click();
  await expect(pageB.locator('text=Nenhuma aula cadastrada')).toBeVisible({ timeout: 5000 });
  await expect(pageB.locator('body')).not.toContainText('Conteudo Exclusivo De A');

  await contextA.close();
  await contextB.close();
});

test('data created before a server restart is still there after it comes back up (server, not the browser, is the authority)', async ({ page }) => {
  const email = uniqueEmail('restart');
  const password = 'a genuinely long test password 1';

  await enableRemoteMode(page);
  await registerAndLogin(page, email, password);
  await expect(page.locator('#account-logged-in-view')).toBeVisible({ timeout: 5000 });
  await createUnit(page, { subjectName: 'Persistencia E2E', title: 'Sobrevive Ao Restart', studyDate: '2026-01-01' });
  await page.locator('[data-screen="plan"]').click();
  await expect(page.locator('#screen-plan').getByText('Sobrevive Ao Restart')).toBeVisible({ timeout: 5000 });

  serverProcess.kill();
  await new Promise(r => setTimeout(r, 300));
  serverProcess = startServer();
  await waitForReady();

  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.locator('[data-screen="plan"]').click();
  await expect(page.locator('#screen-plan').getByText('Sobrevive Ao Restart')).toBeVisible({ timeout: 5000 });
});

test('network loss during a write produces a clear, visible failure — never a silent local success and never a BrowserStore fallback', async ({ page, context }) => {
  const email = uniqueEmail('offline');
  const password = 'a genuinely long test password 1';

  await enableRemoteMode(page);
  await registerAndLogin(page, email, password);
  await expect(page.locator('#account-logged-in-view')).toBeVisible({ timeout: 5000 });

  await page.locator('[data-screen="plan"]').click();
  await page.locator('#plan-new-unit-btn').click();
  await page.locator('#plan-show-subject-form').click();
  await page.locator('#plan-new-subject-input').fill('Rede Offline E2E');
  await page.locator('#plan-study-date').fill('2026-01-01');
  await page.locator('#plan-study-title').fill('Nao Deve Ser Salvo Offline');

  await context.setOffline(true);
  await page.locator('#plan-unit-save-btn').click();

  await expect(page.locator('#plan-unit-form-message')).toContainText(/não foi possível|falha|erro/i, { timeout: 5000 });
  // The form must still be open with the typed draft intact, not silently
  // "succeeded" into a local-only row that vanishes on reload.
  await expect(page.locator('#plan-study-title')).toHaveValue('Nao Deve Ser Salvo Offline');

  await context.setOffline(false);
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.locator('[data-screen="plan"]').click();
  await expect(page.locator('#screen-plan').getByText('Nao Deve Ser Salvo Offline')).not.toBeVisible();
});
