import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

// T11: real server + real browser end-to-end auth journey. Boots the actual
// central server as a child process (not app.inject) against a TempDir DB,
// on a port distinct from other E2E suites, with CORS configured for the
// Playwright webServer origin (localhost:5199, per playwright.config.js).

const SERVER_PORT = 13950;
// Same hostname as the Playwright webServer origin (localhost:5199) is
// required: browsers treat 127.0.0.1 and localhost as different sites for
// cookie purposes even though they resolve to the same loopback address —
// a cookie set by 127.0.0.1 is never sent back to a localhost-origin fetch.
// Discovered via a failing E2E run before this fix (login returned 200 but
// the immediately following /auth/me returned 401 — the session cookie
// existed server-side but never reached the browser's cookie jar for reuse).
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));

let serverProcess;
let dbDir;

test.beforeAll(async () => {
  dbDir = mkdtempSync(join(tmpdir(), 'sl-e2e-auth-'));
  const dbPath = join(dbDir, 'e2e.db');

  serverProcess = spawn(process.execPath, [MAIN_JS], {
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

  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${API_BASE}/health/ready`);
      if (res.status === 200) return;
    } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error('Auth E2E: real server did not become ready in time');
});

test.afterAll(async () => {
  serverProcess?.kill();
  await new Promise(r => setTimeout(r, 300));
  rmSync(dbDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test.beforeEach(async ({ page }) => {
  // Injected before any page script runs, so auth-ui.js picks it up.
  await page.addInitScript((base) => { window.__SMARTLEARN_API_BASE__ = base; }, API_BASE);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.locator('[data-screen="account"]').click();
});

function uniqueEmail() {
  return `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

test('keyboard journey: register, then log in, then see the account view', async ({ page }) => {
  const email = uniqueEmail();
  const password = 'a genuinely long test password 42';

  await page.locator('#account-show-register').click();
  await page.locator('#account-register-email').fill(email);
  await page.locator('#account-register-password').fill(password);
  await page.keyboard.press('Enter');

  await expect(page.locator('#account-login-form')).toBeVisible({ timeout: 5000 });

  await page.locator('#account-login-email').fill(email);
  await page.locator('#account-login-password').fill(password);
  await page.keyboard.press('Enter');

  await expect(page.locator('#account-logged-in-view')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#account-logged-in-as')).toContainText(email);
});

test('wrong password shows an understandable error with no sensitive existence leak', async ({ page }) => {
  const email = uniqueEmail();
  await page.locator('#account-show-register').click();
  await page.locator('#account-register-email').fill(email);
  await page.locator('#account-register-password').fill('a genuinely long test password 42');
  await page.locator('#account-register-form button[type="submit"]').click();
  await expect(page.locator('#account-login-form')).toBeVisible({ timeout: 5000 });

  await page.locator('#account-login-email').fill(email);
  await page.locator('#account-login-password').fill('totally the wrong password here');
  await page.locator('#account-login-form button[type="submit"]').click();

  const message = page.locator('#account-login-message');
  await expect(message).toContainText(/incorretos/i, { timeout: 5000 });
  const text = await message.innerText();
  expect(text).not.toMatch(/exist|cadastrad|conta encontrada/i);
});

test('logout clears the session — reloading the account screen shows the logged-out view', async ({ page }) => {
  const email = uniqueEmail();
  const password = 'a genuinely long test password 42';
  await page.locator('#account-show-register').click();
  await page.locator('#account-register-email').fill(email);
  await page.locator('#account-register-password').fill(password);
  await page.locator('#account-register-form button[type="submit"]').click();
  await expect(page.locator('#account-login-form')).toBeVisible({ timeout: 5000 });
  await page.locator('#account-login-email').fill(email);
  await page.locator('#account-login-password').fill(password);
  await page.locator('#account-login-form button[type="submit"]').click();
  await expect(page.locator('#account-logged-in-view')).toBeVisible({ timeout: 5000 });

  await page.locator('#account-logout-btn').click();
  await expect(page.locator('#account-logged-out-view')).toBeVisible({ timeout: 5000 });

  await page.reload();
  await page.locator('[data-screen="account"]').click();
  await expect(page.locator('#account-logged-out-view')).toBeVisible({ timeout: 5000 });
});

test('password change via the real UI: old password stops working, new one logs in', async ({ page }) => {
  const email = uniqueEmail();
  const oldPassword = 'a genuinely long test password 42';
  const newPassword = 'a completely different long password 99';

  await page.locator('#account-show-register').click();
  await page.locator('#account-register-email').fill(email);
  await page.locator('#account-register-password').fill(oldPassword);
  await page.locator('#account-register-form button[type="submit"]').click();
  await expect(page.locator('#account-login-form')).toBeVisible({ timeout: 5000 });
  await page.locator('#account-login-email').fill(email);
  await page.locator('#account-login-password').fill(oldPassword);
  await page.locator('#account-login-form button[type="submit"]').click();
  await expect(page.locator('#account-logged-in-view')).toBeVisible({ timeout: 5000 });

  await page.locator('#account-current-password').fill(oldPassword);
  await page.locator('#account-new-password').fill(newPassword);
  await page.locator('#account-password-form button[type="submit"]').click();
  await expect(page.locator('#account-password-message')).toContainText(/sucesso/i, { timeout: 5000 });

  await page.locator('#account-logout-btn').click();
  await expect(page.locator('#account-logged-out-view')).toBeVisible({ timeout: 5000 });

  await page.locator('#account-login-email').fill(email);
  await page.locator('#account-login-password').fill(oldPassword);
  await page.locator('#account-login-form button[type="submit"]').click();
  await expect(page.locator('#account-login-message')).toContainText(/incorretos/i, { timeout: 5000 });

  await page.locator('#account-login-password').fill(newPassword);
  await page.locator('#account-login-form button[type="submit"]').click();
  await expect(page.locator('#account-logged-in-view')).toBeVisible({ timeout: 5000 });
});

test('learning screens remain reachable and independent of account login state', async ({ page }) => {
  // This spec never sets window.__SMARTLEARN_REMOTE_MODE__, so the app
  // stays on the default local BrowserStore path (src/app.js's REMOTE_MODE
  // switch, T21) — Hoje/Plano/etc. keep working without login regardless.
  // The remote-mode login gate is covered separately by
  // e2e/server-authority.spec.js.
  await page.locator('[data-screen="today"]').click();
  await expect(page.locator('#screen-today')).toBeVisible();
  await page.locator('[data-screen="plan"]').click();
  await expect(page.locator('#screen-plan')).toBeVisible();
});
