import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildFixturePdf } from '../server/test/pdf-fixtures/build-fixture-pdf.js';

// Real keyboard / screen-reader / text-size sweep of Materiais with a multi-trecho PDF (found running a real 28-page
// textbook chapter with 11 trechos): the title field of every trecho had NO accessible name, the repeated
// "Salvar título" / "Ver trecho da fonte" / "Gerar rascunho" buttons could not be told apart, the field was a 27px
// target, and with the browser text size at 200% the whole page scrolled horizontally (html/body min-width in rem).

const SERVER_PORT = 13978;
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));
const OUTLINE = [{ title: 'Definicao clinica', page: 1 }, { title: 'Epidemiologia', page: 3 }];
const PAGES = ['Definicao um', 'Definicao dois', 'Epidemiologia um', 'Epidemiologia dois'];

let serverProcess;
let dataDir;

test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'sl-e2e-a11y-'));
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: {
      ...process.env,
      SMARTLEARN_DB_PATH: join(dataDir, 'e2e.db'),
      SMARTLEARN_SOURCES_DIR: join(dataDir, 'sources'),
      PORT: String(SERVER_PORT),
      HOST: 'localhost',
      NODE_ENV: 'test',
      SMARTLEARN_ALLOWED_ORIGINS: 'http://localhost:5199',
    },
    stdio: 'ignore',
  });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${API_BASE}/health/ready`)).status === 200) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('materials-a11y E2E: real server did not become ready in time');
});

test.afterAll(async () => {
  serverProcess?.kill();
  await new Promise((r) => setTimeout(r, 300));
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

async function openMateriaisWithTrechos(page) {
  await page.addInitScript((base) => {
    window.__SMARTLEARN_API_BASE__ = base;
    window.__SMARTLEARN_REMOTE_MODE__ = true;
    window.__SMARTLEARN_LOCAL_AUTHORITY__ = true;
  }, API_BASE);
  const email = `a11y-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
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
  await page.locator('[data-screen="materials"]').click();
  await expect(page.locator('#sources-card')).toBeVisible({ timeout: 5000 });
  await page.setInputFiles('#sources-file-input', { name: 'aula.pdf', mimeType: 'application/pdf', buffer: buildFixturePdf(PAGES, { outline: OUTLINE }) });
  await expect(page.locator('#sources-message')).toContainText('trecho(s) proposto(s)', { timeout: 10000 });
  await expect(page.locator('.source-proposal-item')).toHaveCount(2);
}

test('every trecho has a title field with its own accessible name, and its buttons say which trecho they act on', async ({ page }) => {
  await openMateriaisWithTrechos(page);
  await expect(page.getByRole('textbox', { name: 'Título do trecho, páginas 1–2' })).toHaveCount(1);
  await expect(page.getByRole('textbox', { name: 'Título do trecho, páginas 3–4' })).toHaveCount(1);

  // the visible label of each button stays as it is; the trecho it belongs to is its accessible description
  const described = await page.evaluate(() => [...document.querySelectorAll('.source-proposal-item')].map((item) => (
    [...item.querySelectorAll(':scope > button')].map((b) => document.getElementById(b.getAttribute('aria-describedby') ?? '')?.textContent?.trim() ?? null)
  )));
  expect(described[0].every((d) => d === 'Páginas 1–2')).toBe(true);
  expect(described[1].every((d) => d === 'Páginas 3–4')).toBe(true);
  expect(new Set(described.flat()).size).toBe(2);
});

test('the title field is a comfortable target (at least 40px tall) with a visible focus ring, at 375px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await openMateriaisWithTrechos(page);
  const input = page.locator('.source-proposal-title-input').first();
  const box = await input.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(40);
  await input.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab'); // a keyboard focus, so :focus-visible applies
  const ring = await input.evaluate((el) => { const cs = getComputedStyle(el); return { style: cs.outlineStyle, width: parseFloat(cs.outlineWidth) }; });
  expect(ring.style).not.toBe('none');
  expect(ring.width).toBeGreaterThanOrEqual(2);
});

test('with the browser text size at 200% the page does not scroll horizontally at a 375px viewport (reflow)', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await openMateriaisWithTrechos(page);
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  const overflow = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(overflow.scroll).toBeLessThanOrEqual(overflow.client);
});
