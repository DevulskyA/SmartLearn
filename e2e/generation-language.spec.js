import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { VITE_ORIGIN, serverPort } from './support/ports.js';
import { signInRegistered } from './support/session.js';

// Partial T-F10-06 (the full UI-language selector stays behind HG-13): the Configurações card exposes ONLY generationLocale,
// and the server owns it (R-13). Proves PT -> ES -> save -> reload against the real server, and that the card does not exist
// in the legacy local mode, where no server could honour the choice.

const SERVER_PORT = serverPort(13951);
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));

let serverProcess;
let dbDir;

test.beforeAll(async () => {
  dbDir = mkdtempSync(join(tmpdir(), 'sl-e2e-generation-language-'));
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: { ...process.env, SMARTLEARN_DB_PATH: join(dbDir, 'e2e.db'), PORT: String(SERVER_PORT), HOST: 'localhost', NODE_ENV: 'test', SMARTLEARN_ALLOWED_ORIGINS: VITE_ORIGIN },
    stdio: 'ignore',
  });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${API_BASE}/health/ready`)).status === 200) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('generation-language E2E: real server did not become ready in time');
});

test.afterAll(async () => {
  serverProcess?.kill();
  await new Promise((r) => setTimeout(r, 300));
  rmSync(dbDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test('the generation language starts in pt-BR, saves as es, and survives a reload', async ({ page }) => {
  await page.addInitScript((base) => {
    window.__SMARTLEARN_API_BASE__ = base;
    window.__SMARTLEARN_REMOTE_MODE__ = true;
  }, API_BASE);
  await signInRegistered(page, { email: `lang-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`, password: 'a genuinely long test password 1' });

  await page.locator('[data-screen="settings"]').click();
  const card = page.locator('#generation-language-card');
  await expect(card).toBeVisible();
  const native = page.locator('#generation-language-select');
  await expect(native).toHaveValue('pt-BR');

  const trigger = native.locator('xpath=..').locator('.ui-select-trigger');
  await trigger.click();
  await page.locator(`#${await trigger.getAttribute('aria-controls')}`).locator('li[role="option"]', { hasText: 'Español' }).click();
  await expect(native).toHaveValue('es');
  await page.locator('#generation-language-save').click();
  await expect(page.locator('#generation-language-message')).toContainText('Idioma salvo');

  // what the server stored, not what the page remembers
  const stored = await page.evaluate(async (base) => (await (await fetch(`${base}/v1/settings`, { credentials: 'include' })).json()).settings, API_BASE);
  expect(stored.generationLocale).toBe('es');

  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.locator('[data-screen="settings"]').click();
  await expect(page.locator('#generation-language-select')).toHaveValue('es');
});

test('the card stays hidden in the legacy local mode (no server to honour the choice)', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.locator('[data-screen="settings"]').click();
  await expect(page.locator('#generation-language-card')).toBeHidden();
});
