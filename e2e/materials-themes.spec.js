import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildFixturePdf } from '../server/test/pdf-fixtures/build-fixture-pdf.js';
import { VITE_ORIGIN, serverPort } from './support/ports.js';
import { waitForServerReady } from './support/wait-for-server.js';
import { signInRegistered } from './support/session.js';

// Materiais in every theme: the document library (search, order, pager, rows) and the lesson editor's Resumo/Fonte/Revisão tabs have no
// axe violations and no sideways scroll in any of the app's themes. Real server, fake provider, 30 documents faked at GET /v1/sources.

const SERVER_PORT = serverPort(13994);
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));

let serverProcess;
let dataDir;

test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'sl-e2e-mat-themes-'));
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: { ...process.env, SMARTLEARN_DB_PATH: join(dataDir, 'e2e.db'), SMARTLEARN_SOURCES_DIR: join(dataDir, 'sources'), PORT: String(SERVER_PORT), HOST: 'localhost', NODE_ENV: 'test', SMARTLEARN_ALLOWED_ORIGINS: VITE_ORIGIN },
    stdio: 'ignore',
  });
  await waitForServerReady(API_BASE, { label: 'materials-themes E2E' });
});
test.afterAll(async () => {
  serverProcess?.kill();
  await new Promise((r) => setTimeout(r, 300));
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

const sources = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, originalName: `Fisiologia Médica ${i + 1}.pdf`, pageCount: 200 - i, extractionStatus: 'EXTRACTED' }));

const setTheme = (page, id) => page.evaluate(async (themeId) => { (await import('/src/theme.js')).applyThemePreference(themeId); }, id);
const themeIds = (page) => page.evaluate(async () => (await import('/src/theme.js')).THEME_OPTIONS.map((o) => o.id));
const sideways = (page) => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);

test('every theme: library and editor tabs have no axe violations and no sideways scroll', async ({ page }) => {
  test.setTimeout(280000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript((base) => { window.__SMARTLEARN_API_BASE__ = base; window.__SMARTLEARN_REMOTE_MODE__ = true; window.__SMARTLEARN_LOCAL_AUTHORITY__ = true; }, API_BASE);
  await page.route('**/v1/sources', (route) => (route.request().method() === 'GET'
    ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sources }) })
    : route.continue()));
  await signInRegistered(page, { email: `themes-${Date.now()}@example.com`, password: 'a genuinely long test password 1' });
  await page.locator('[data-screen="materials"]').click();
  await expect(page.locator('#library-tools')).toBeVisible({ timeout: 5000 });
  const ids = await themeIds(page);
  expect(ids.length).toBeGreaterThanOrEqual(24);

  const problems = [];
  for (const id of ids) {
    await setTheme(page, id);
    const axe = await new AxeBuilder({ page }).include('#sources-existing').analyze();
    for (const v of axe.violations) problems.push(`${id} library: ${v.id} x${v.nodes.length} ${JSON.stringify(v.nodes.map((n) => n.target))}`);
    if (await sideways(page)) problems.push(`${id} library: sideways scroll`);
  }

  await page.unroute('**/v1/sources');
  await page.setInputFiles('#sources-file-input', { name: 'fisiologia-renal.pdf', mimeType: 'application/pdf', buffer: buildFixturePdf(['Fisiologia renal: filtração glomerular', 'Barreira de filtração e podócitos', 'Clearance de inulina mede a TFG']) });
  await expect(page.locator('#sources-message')).toContainText(/trechos? propostos?/, { timeout: 10000 });
  await page.locator('.source-proposal-item').first().locator('[data-action="generate-draft"]').click();
  await expect(page.locator('.lesson-editor')).toBeVisible({ timeout: 15000 });
  const tabs = page.locator('.lesson-tabs [role="tab"]');
  for (const tabIndex of [0, 2, 3]) {
    await tabs.nth(tabIndex).click();
    for (const id of ids) {
      await setTheme(page, id);
      const axe = await new AxeBuilder({ page }).include('.lesson-editor').analyze();
      for (const v of axe.violations) problems.push(`${id} editor tab ${tabIndex}: ${v.id} x${v.nodes.length} ${JSON.stringify(v.nodes.map((n) => n.target))}`);
      if (await sideways(page)) problems.push(`${id} editor tab ${tabIndex}: sideways scroll`);
    }
  }
  expect(problems).toEqual([]);
});
