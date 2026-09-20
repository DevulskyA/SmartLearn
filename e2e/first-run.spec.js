import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

// FIRSTRUN-1: a brand-new account lands on Hoje with nothing registered. That first screen must say what to do and
// offer the action (send a PDF / create a lesson), not just say "nothing here". Real server, real UI, empty account.

const SERVER_PORT = 13992;
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));

let serverProcess;
let dbDir;

test.beforeAll(async () => {
  dbDir = mkdtempSync(join(tmpdir(), 'sl-e2e-firstrun-'));
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: { ...process.env, SMARTLEARN_DB_PATH: join(dbDir, 'e2e.db'), SMARTLEARN_SOURCES_DIR: join(dbDir, 'sources'), PORT: String(SERVER_PORT), HOST: 'localhost', NODE_ENV: 'test', SMARTLEARN_ALLOWED_ORIGINS: 'http://localhost:5199' },
    stdio: 'ignore',
  });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${API_BASE}/health/ready`)).status === 200) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('first-run E2E: real server did not become ready in time');
});

test.afterAll(async () => {
  serverProcess?.kill();
  await new Promise((r) => setTimeout(r, 300));
  rmSync(dbDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

async function signUp(page, { localAuthority }) {
  await page.addInitScript(({ base, local }) => {
    window.__SMARTLEARN_API_BASE__ = base;
    window.__SMARTLEARN_REMOTE_MODE__ = true;
    if (local) window.__SMARTLEARN_LOCAL_AUTHORITY__ = true;
  }, { base: API_BASE, local: localAuthority });
  const email = `first-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
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
}

const noHorizontalScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test('new account with PDF authority: Hoje offers "Enviar um PDF" (opens Materiais) and "Criar uma aula" (opens the new-lesson form)', async ({ page }) => {
  await signUp(page, { localAuthority: true });
  await page.locator('[data-screen="today"]').click();
  const empty = page.locator('#today-empty-state');
  await expect(empty).toBeVisible({ timeout: 5000 });
  await expect(empty.locator('[data-action="first-upload"]')).toHaveText('Enviar um PDF de aula');
  await expect(empty.locator('[data-action="first-create"]')).toHaveText('Criar uma aula');

  await empty.locator('[data-action="first-upload"]').click();
  await expect(page.locator('#screen-materials')).toBeVisible();
  await expect(page.locator('#sources-file-input')).toBeAttached();

  await page.locator('[data-screen="today"]').click();
  await page.locator('#today-empty-state [data-action="first-create"]').click();
  await expect(page.locator('#screen-plan')).toBeVisible();
  await expect(page.locator('#plan-new-unit-form')).toBeVisible();
  await expect(page.locator('#plan-empty')).toContainText('Materiais'); // the empty Plano also points to the PDF path
});

test('new account WITHOUT PDF authority: no dead "Enviar um PDF" button, the lesson button is there', async ({ page }) => {
  await signUp(page, { localAuthority: false });
  await page.locator('[data-screen="today"]').click();
  const empty = page.locator('#today-empty-state');
  await expect(empty).toBeVisible({ timeout: 5000 });
  await expect(empty.locator('[data-action="first-upload"]')).toBeHidden();
  await expect(empty.locator('[data-action="first-create"]')).toBeVisible();
});

test('mobile 375: the first-run actions fit and are touch-sized', async ({ page }) => {
  await signUp(page, { localAuthority: true });
  await page.setViewportSize({ width: 375, height: 800 });
  await page.locator('[data-screen="today"]:visible').first().click();
  const empty = page.locator('#today-empty-state');
  await expect(empty).toBeVisible({ timeout: 5000 });
  expect(await noHorizontalScroll(page)).toBe(true);
  for (const sel of ['[data-action="first-upload"]', '[data-action="first-create"]']) {
    expect((await empty.locator(sel).boundingBox()).height).toBeGreaterThanOrEqual(44);
  }
});
