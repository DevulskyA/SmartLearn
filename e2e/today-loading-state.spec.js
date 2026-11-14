import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { VITE_ORIGIN, serverPort } from './support/ports.js';
import { waitForServerReady } from './support/wait-for-server.js';
import { signInRegistered } from './support/session.js';

// The screen review (L-01/L-02) found that Hoje said "Nenhuma revisão cadastrada. Envie um PDF" while the answer was still on its way
// and, with the server down, said it right under the error banner: to a student who HAS reviews, both are false. The empty state may
// only speak after the data has arrived and really is empty.

const SERVER_PORT = serverPort(13999);
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));
const EMPTY = /Nenhuma revisão cadastrada/;

let serverProcess;
let dataDir;

test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'sl-e2e-today-loading-'));
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: {
      ...process.env,
      SMARTLEARN_DB_PATH: join(dataDir, 'e2e.db'),
      SMARTLEARN_SOURCES_DIR: join(dataDir, 'sources'),
      PORT: String(SERVER_PORT),
      HOST: 'localhost',
      NODE_ENV: 'test',
      SMARTLEARN_ALLOWED_ORIGINS: VITE_ORIGIN,
    },
    stdio: 'ignore',
  });
  await waitForServerReady(API_BASE, { label: 'today-loading E2E' });
});

test.afterAll(async () => {
  serverProcess?.kill();
  await new Promise((r) => setTimeout(r, 300));
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript((base) => {
    window.__SMARTLEARN_API_BASE__ = base;
    window.__SMARTLEARN_REMOTE_MODE__ = true;
    window.__SMARTLEARN_LOCAL_AUTHORITY__ = true;
  }, API_BASE);
  await signInRegistered(page, { email: `today-loading-${Date.now()}-${randomUUID()}@example.com`, password: 'a genuinely long test password 1' });
});

test('while the first answer is on its way Hoje says it is loading, never "no reviews"', async ({ page }) => {
  // a fresh page (the session cookie survives the reload): the first look at Hoje has no earlier render to lean on
  await page.route('**/v1/**', async (route) => {
    if (!route.request().url().includes('/v1/auth/')) await new Promise((r) => setTimeout(r, 2500));
    await route.continue();
  });
  await page.reload();
  await page.locator('[data-screen="today"]').click();
  await expect(page.locator('#today-loading')).toBeVisible();
  await expect(page.locator('#today-empty-state')).toBeHidden();
  await expect(page.locator('[data-screen-panel="today"]')).not.toContainText(EMPTY, { useInnerText: true }); // innerText: hidden elements do not count
  await page.unroute('**/v1/**');
  // once the data is here and really is empty, the empty state takes over
  await expect(page.locator('#today-empty-state')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('#today-loading')).toBeHidden();
});

test('with the server down Hoje shows the error and not the empty state under it', async ({ page }) => {
  // fresh page, session intact (auth calls pass), everything else refused: Hoje's first render fails
  await page.route('**/v1/**', (route) => (route.request().url().includes('/v1/auth/') ? route.continue() : route.abort('connectionrefused')));
  await page.reload();
  await page.locator('[data-screen="today"]').click();
  await expect(page.locator('[data-screen-panel="today"]')).toContainText('Não foi possível carregar esta tela', { timeout: 8000 });
  await expect(page.locator('#today-empty-state')).toBeHidden();
  await expect(page.locator('#today-loading')).toBeHidden();
  await expect(page.locator('[data-screen-panel="today"]')).not.toContainText(EMPTY, { useInnerText: true }); // innerText: hidden elements do not count
});
