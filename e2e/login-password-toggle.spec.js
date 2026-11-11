import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { VITE_ORIGIN, serverPort } from './support/ports.js';
import { waitForServerReady } from './support/wait-for-server.js';

// Real sign-in through the real form (real clicks, so a covered or clipped button fails), in four themes at desktop and phone width,
// plus the eye button on every password field. Real server, throwaway database.

const SERVER_PORT = serverPort(13996);
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));
const PASSWORD = 'a genuinely long test password 1';
let serverProcess;
let dataDir;

test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'sl-e2e-login-toggle-'));
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: { ...process.env, SMARTLEARN_DB_PATH: join(dataDir, 'e2e.db'), SMARTLEARN_SOURCES_DIR: join(dataDir, 'sources'), PORT: String(SERVER_PORT), HOST: 'localhost', NODE_ENV: 'test', SMARTLEARN_ALLOWED_ORIGINS: VITE_ORIGIN },
    stdio: 'ignore',
  });
  await waitForServerReady(API_BASE, { label: 'login-password-toggle E2E' });
});
test.afterAll(async () => {
  serverProcess?.kill();
  await new Promise((r) => setTimeout(r, 300));
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

async function openAccount(page) {
  await page.addInitScript((base) => { window.__SMARTLEARN_API_BASE__ = base; window.__SMARTLEARN_REMOTE_MODE__ = true; window.__SMARTLEARN_LOCAL_AUTHORITY__ = true; }, API_BASE);
  await page.goto('/');
  await page.waitForFunction(() => window.location.hash.length > 1);
  const more = page.locator('#mobile-more-toggle');
  if (await more.isVisible()) await more.click();
  await page.locator('[data-screen="account"]:visible').click();
  await expect(page.locator('#account-login-form')).toBeVisible();
}

const setTheme = (page, id) => page.evaluate(async (themeId) => { (await import('/src/theme.js')).applyThemePreference(themeId); }, id);

for (const [width, height] of [[1280, 800], [390, 844]]) {
  for (const theme of ['paper', 'sepia', 'night', 'contrast']) {
    test(`sign-in with the eye button works in ${theme} at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      const email = `toggle-${theme}-${width}-${Date.now()}@example.com`;
      await openAccount(page);
      await setTheme(page, theme);
      const registered = await page.request.post(`${API_BASE}/v1/auth/register`, { data: { email, password: PASSWORD }, headers: { Origin: VITE_ORIGIN } });
      expect(registered.ok()).toBeTruthy();

      const field = page.locator('#account-login-password');
      const eye = page.locator('#account-login-form .password-toggle');
      await page.locator('#account-login-email').fill(email);
      await field.fill(PASSWORD);
      await expect(field).toHaveAttribute('type', 'password');
      await expect(eye).toHaveAttribute('aria-pressed', 'false');
      expect((await eye.boundingBox()).height).toBeGreaterThanOrEqual(44);
      expect((await eye.boundingBox()).width).toBeGreaterThanOrEqual(44);

      await eye.click();
      await expect(field).toHaveAttribute('type', 'text');
      await expect(field).toHaveValue(PASSWORD);
      await expect(eye).toHaveAttribute('aria-pressed', 'true');
      await eye.click();
      await expect(field).toHaveAttribute('type', 'password');

      await page.locator('#account-login-form button[type="submit"]').click();
      await expect(page.locator('#account-logged-in-view')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('#account-logged-in-as')).toContainText(email);
    });
  }
}

test('every password field has a keyboard-operable eye button and hides again after a reset', async ({ page }) => {
  await openAccount(page);
  await page.locator('#account-show-register').click();
  const field = page.locator('#account-register-password');
  const eye = page.locator('#account-register-form .password-toggle');
  await expect(eye).toHaveAccessibleName('Mostrar senha');
  await field.fill(PASSWORD);
  await eye.focus();
  await page.keyboard.press('Enter');
  await expect(field).toHaveAttribute('type', 'text');
  await page.locator('#account-register-form').evaluate((form) => form.reset());
  await expect(field).toHaveAttribute('type', 'password');
  await expect(eye).toHaveAttribute('aria-pressed', 'false');
  // login, register, current and new password: four buttons in the page
  await expect(page.locator('.password-toggle')).toHaveCount(4);
});

test('a wrong password shows the generic message and keeps what was typed', async ({ page }) => {
  await openAccount(page);
  await page.locator('#account-login-email').fill('nobody@example.com');
  await page.locator('#account-login-password').fill('wrong password here');
  await page.locator('#account-login-form button[type="submit"]').click();
  await expect(page.locator('#account-login-message')).toContainText(/incorret/i, { timeout: 8000 });
  await expect(page.locator('#account-login-password')).toHaveValue('wrong password here');
});
