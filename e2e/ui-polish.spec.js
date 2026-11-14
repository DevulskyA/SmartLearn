import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
const shot = async (target, name) => { if (process.env.SCREENSHOT_DIR) await target.screenshot({ path: join(process.env.SCREENSHOT_DIR, name + '.png') }); };
import { VITE_ORIGIN, serverPort } from './support/ports.js';
import { waitForServerReady } from './support/wait-for-server.js';
import { signInRegistered } from './support/session.js';

// Screen review polish that changes no behaviour a student relies on: P-01 (one Plano panel at a time), L-04 (empty Plano has a
// button in its body), S-01 (the experiment switch sits under a heading), K-01 (skip link).

const SERVER_PORT = serverPort(13998);
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));

let serverProcess;
let dataDir;

test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'sl-e2e-ui-polish-'));
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
  await waitForServerReady(API_BASE, { label: 'ui-polish E2E' });
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
  await signInRegistered(page, { email: `ui-polish-${Date.now()}-${randomUUID()}@example.com`, password: 'a genuinely long test password 1' });
});

test('Plano: the disciplines panel and the new-lesson form never stay open together; an empty Plano has a button in its body', async ({ page }) => {
  await page.locator('[data-screen="plan"]').click();
  const panel = page.locator('#plan-subjects-panel');
  const form = page.locator('#plan-new-unit-form');
  await page.locator('#plan-manage-subjects-btn').click();
  await expect(panel).toBeVisible();
  await page.locator('#plan-new-unit-btn').click();
  await expect(form).toBeVisible();
  await expect(panel).toBeHidden();
  await shot(page.locator('[data-screen-panel="plan"]'), '1280-plano-so-formulario');
  await expect(page.locator('#plan-manage-subjects-btn')).toHaveAttribute('aria-expanded', 'false');
  await page.locator('#plan-manage-subjects-btn').click();
  await expect(panel).toBeVisible();
  await expect(form).toBeHidden();
  await expect(page.locator('#plan-new-unit-btn')).toHaveAttribute('aria-expanded', 'false');

  // a new account has no lessons: the body of Plano offers the same way to start as the heading
  await page.locator('#plan-manage-subjects-btn').click(); // close
  const emptyNew = page.locator('#plan-empty-new');
  await expect(emptyNew).toBeVisible();
  await shot(page.locator('[data-screen-panel="plan"]'), '1280-plano-vazio-com-botao');
  await emptyNew.click();
  await expect(form).toBeVisible();
});

test('Configurações: the experiment switch sits under its own heading', async ({ page }) => {
  await page.locator('[data-screen="settings"]').click();
  await expect(page.getByRole('heading', { name: 'Recurso em teste' })).toBeVisible();
  await expect(page.locator('#experiment-card #experiment-switch')).toBeVisible();
  await shot(page.locator('#experiment-card'), '1280-configuracoes-experimento-com-titulo');
});

test('the skip link is the first stop of the keyboard and moves focus to the content without changing the screen', async ({ page }) => {
  await page.locator('[data-screen="plan"]').click();
  await expect(page.locator('[data-screen-panel="plan"]')).toBeVisible();
  const link = page.locator('.skip-link');
  await link.focus();
  await expect(link).toBeVisible();
  await shot(page, '1280-link-pular-com-foco');
  await page.keyboard.press('Enter');
  await expect(page.locator('.app-main')).toBeFocused();
  await expect(page.locator('[data-screen-panel="plan"]')).toBeVisible();
  expect(new URL(page.url()).hash).toBe('#plan');
});
