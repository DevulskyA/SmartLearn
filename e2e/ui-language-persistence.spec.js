import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { VITE_ORIGIN, serverPort } from './support/ports.js';
import { waitForServerReady } from './support/wait-for-server.js';
import { signInRegistered } from './support/session.js';

const SERVER_PORT = serverPort(13981);
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));
let serverProcess;
let dbDir;
let dbPath;

function startServer() {
  return spawn(process.execPath, [MAIN_JS], {
    env: {
      ...process.env,
      SMARTLEARN_DB_PATH: dbPath,
      PORT: String(SERVER_PORT),
      HOST: 'localhost',
      NODE_ENV: 'test',
      SMARTLEARN_ALLOWED_ORIGINS: VITE_ORIGIN,
    },
    stdio: 'ignore',
  });
}

async function enableRemoteMode(page) {
  await page.addInitScript((base) => {
    window.__SMARTLEARN_API_BASE__ = base;
    window.__SMARTLEARN_REMOTE_MODE__ = true;
  }, API_BASE);
}

test.beforeAll(async () => {
  dbDir = mkdtempSync(join(tmpdir(), 'sl-e2e-ui-language-'));
  dbPath = join(dbDir, 'e2e.db');
  serverProcess = startServer();
  await waitForServerReady(API_BASE, { label: 'ui-language E2E' });
});

test.afterAll(async () => {
  serverProcess?.kill();
  await new Promise((resolve) => setTimeout(resolve, 300));
  if (dbDir) rmSync(dbDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test("local mode remembers the interface locale in localStorage without exposing generation settings", async ({ page }) => {
  await page.goto('/#settings');
  await expect(page.locator('#screen-settings')).toBeVisible();
  await expect(page.locator('#generation-language-card')).toBeHidden();
  const select = page.locator("#ui-language-select");
  await select.locator("xpath=..").locator(".ui-select-trigger").click();
  await page.getByRole("option", { name: "English", exact: true }).click();
  await page.locator("#ui-language-save").click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("#title-settings")).toHaveText("Settings");
  await expect(page.locator("#generation-language-card")).toBeHidden();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("#title-settings")).toHaveText("Settings");
  await expect(page.locator("#generation-language-card")).toBeHidden();
});

test('interface locale persists on the account and leaves the selected generation locale unchanged', async ({ page }) => {
  await enableRemoteMode(page);
  await signInRegistered(page, {
    email: `ui-locale-${randomUUID()}@example.com`,
    password: 'a genuinely long test password 1',
  });
  await page.locator('[data-screen="settings"]').click();
  await expect(page.locator('#screen-settings')).toBeVisible();

  const generationSelect = page.locator('#generation-language-select');
  await generationSelect.locator('xpath=..').locator('.ui-select-trigger').click();
  await page.getByRole('option', { name: 'Español', exact: true }).click();
  await page.locator('#generation-language-save').click();
  await expect(generationSelect).toHaveValue('es');

  const uiSelect = page.locator('#ui-language-select');
  await uiSelect.locator('xpath=..').locator('.ui-select-trigger').click();
  await page.getByRole('option', { name: 'English', exact: true }).click();
  await page.locator('#ui-language-save').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#title-settings')).toHaveText('Settings');
  await expect(generationSelect).toHaveValue('es');

  const saved = await page.evaluate(async (base) => {
    const response = await fetch(`${base}/v1/settings`, { credentials: 'include' });
    return (await response.json()).settings;
  }, API_BASE);
  expect(saved.uiLocale).toBe('en');
  expect(saved.generationLocale).toBe('es');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#title-settings')).toHaveText('Settings');
  await expect(page.locator('#generation-language-select')).toHaveValue('es');
});
