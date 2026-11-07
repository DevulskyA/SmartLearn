// spec: specs/ui-fast-pilot.plan.md
// seed: e2e/seed.spec.ts
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { VITE_ORIGIN, serverPort } from './support/ports.js';
import { waitForServerReady } from './support/wait-for-server.js';

const SERVER_PORT = serverPort(13994);
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));
let serverProcess;
let dbDir;

test.beforeAll(async () => {
  dbDir = mkdtempSync(join(tmpdir(), 'sl-e2e-ui-fast-'));
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: {
      ...process.env,
      SMARTLEARN_DB_PATH: join(dbDir, 'e2e.db'),
      SMARTLEARN_SOURCES_DIR: join(dbDir, 'sources'),
      PORT: String(SERVER_PORT),
      HOST: 'localhost',
      NODE_ENV: 'test',
      SMARTLEARN_ALLOWED_ORIGINS: VITE_ORIGIN,
    },
    stdio: 'ignore',
  });
  await waitForServerReady(API_BASE, { label: 'UI Fast pilot' });
});

test.afterAll(async () => {
  serverProcess?.kill();
  await new Promise((resolve) => setTimeout(resolve, 300));
  rmSync(dbDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test('new account opens the new lesson form from the empty Today state', async ({ page }) => {
  // 1. Configure a remote test account against a disposable API database.
  await page.addInitScript(({ base }) => {
    window.__SMARTLEARN_API_BASE__ = base;
    window.__SMARTLEARN_REMOTE_MODE__ = true;
    window.__SMARTLEARN_LOCAL_AUTHORITY__ = true;
  }, { base: API_BASE });

  const email = `ui-fast-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const password = 'a genuinely long test password 1';
  // 2. Register and authenticate a fresh account.
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.locator('[data-screen="account"]').click();
  await page.locator('#account-show-register').click();
  await page.locator('#account-register-email').fill(email);
  await page.locator('#account-register-password').fill(password);
  await page.locator('#account-register-form button[type="submit"]').click();
  await expect(page.locator('#account-login-form')).toBeVisible({ timeout: 15000 });
  await page.locator('#account-login-email').fill(email);
  await page.locator('#account-login-password').fill(password);
  await page.locator('#account-login-form button[type="submit"]').click();
  await expect(page.locator('#account-logged-in-view')).toBeVisible({ timeout: 15000 });

  // 3. Open Hoje and verify the empty state offers the expected action.
  await page.locator('[data-screen="today"]').click();
  const empty = page.locator('#today-empty-state');
  await expect(empty).toBeVisible({ timeout: 5000 });
  await expect(empty.locator('[data-action="first-create"]')).toHaveText('Criar uma aula');
  // 4. Open the new lesson form and verify the destination.
  await empty.locator('[data-action="first-create"]').click();
  await expect(page.locator('#screen-plan')).toBeVisible();
  await expect(page.locator('#plan-new-unit-form')).toBeVisible();
});
