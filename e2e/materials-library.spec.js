import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { VITE_ORIGIN, serverPort } from './support/ports.js';
import { waitForServerReady } from './support/wait-for-server.js';
import { signInRegistered } from './support/session.js';

// Materiais > "Documentos já enviados": search, order and pages over the list the server returns.
// The list is faked at the network edge (GET /v1/sources) so 30 documents cost no 30 uploads; sign-in and everything else is the real server.

const SERVER_PORT = serverPort(13992);
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));

let serverProcess;
let dataDir;

test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'sl-e2e-library-'));
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
  await waitForServerReady(API_BASE, { label: 'materials-library E2E' });
});

test.afterAll(async () => {
  serverProcess?.kill();
  await new Promise((r) => setTimeout(r, 300));
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

const fakeSources = (n) => Array.from({ length: n }, (_, i) => ({
  id: i + 1,
  originalName: i < 5 ? `Anatomia ${i + 1}.pdf` : `Fisiologia Médica ${i + 1}.pdf`,
  pageCount: 200 - i, // the first document has the most pages, so "Mais páginas" differs from Z-A
  extractionStatus: 'EXTRACTED',
}));

async function openMaterials(page, sources) {
  await page.addInitScript((base) => {
    window.__SMARTLEARN_API_BASE__ = base;
    window.__SMARTLEARN_REMOTE_MODE__ = true;
    window.__SMARTLEARN_LOCAL_AUTHORITY__ = true;
  }, API_BASE);
  await page.route('**/v1/sources', (route) => (route.request().method() === 'GET'
    ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sources }) })
    : route.continue()));
  await signInRegistered(page, { email: `library-${Date.now()}-${randomUUID()}@example.com`, password: 'a genuinely long test password 1' });
  await page.locator('[data-screen="materials"]').click();
  await expect(page.locator('#sources-existing')).toBeVisible({ timeout: 5000 });
}

test('with 30 documents: count is the real total, 12 per page, every page reachable, last item shown', async ({ page }) => {
  await openMaterials(page, fakeSources(30));
  await expect(page.locator('#library-tools')).toBeVisible();
  await expect(page.locator('#library-count')).toHaveText('30 de 30 materiais · 1–12 exibidos');
  await expect(page.locator('.source-existing-item')).toHaveCount(12);
  await expect(page.locator('#library-prev')).toHaveAttribute('aria-disabled', 'true');

  await page.locator('#library-next').click();
  await expect(page.locator('#library-page-label')).toHaveText('Página 2 de 3');
  await page.locator('#library-next').click();
  await expect(page.locator('#library-page-label')).toHaveText('Página 3 de 3');
  await expect(page.locator('.source-existing-item')).toHaveCount(6);
  await expect(page.locator('#library-count')).toHaveText('30 de 30 materiais · 25–30 exibidos');
  await expect(page.locator('.source-existing-item').last()).toContainText('Fisiologia Médica 30.pdf');
  await expect(page.locator('#library-next')).toHaveAttribute('aria-disabled', 'true');
  // the open/remove actions still sit on the real ids
  await expect(page.locator('.source-existing-item').last().locator('[data-action="open-source"]')).toHaveAttribute('data-source-id', '30');
});

test('search ignores accents and case, counts before paging and goes back to page 1; order Z-A changes the first row', async ({ page }) => {
  await openMaterials(page, fakeSources(30));
  await page.locator('#library-next').click();
  await expect(page.locator('#library-page-label')).toHaveText('Página 2 de 3');

  await page.locator('#library-search').fill('FISIOLOGIA medica');
  await expect(page.locator('#library-count')).toHaveText('25 de 30 materiais · 1–12 exibidos');
  await expect(page.locator('#library-page-label')).toHaveText('Página 1 de 3');

  await page.locator('#library-search').fill('nada disso existe');
  await expect(page.locator('#library-count')).toHaveText('Nenhum material corresponde à busca.');
  await expect(page.locator('.source-existing-item')).toHaveCount(0);
  await expect(page.locator('#library-pager')).toBeHidden();

  await page.locator('#library-search').fill('');
  await page.locator('#library-sort').selectOption('name-desc');
  // natural order: "30" comes after "9", so Z-A starts at 30
  await expect(page.locator('.source-existing-item').first()).toContainText('Fisiologia Médica 30.pdf');
  await page.locator('#library-sort').selectOption('pages-desc');
  await expect(page.locator('.source-existing-item').first()).toContainText('Anatomia 1.pdf');
});

test('F5 straight on Materiais (nobody clicks the nav button) still lists the library', async ({ page }) => {
  await openMaterials(page, fakeSources(3));
  await page.reload();
  await expect(page.locator('#screen-materials')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('.source-existing-item')).toHaveCount(3, { timeout: 10000 });
});

test('with few documents the search and order controls are there (approved V6 design), the list is complete and there is no pager', async ({ page }) => {
  await openMaterials(page, fakeSources(3));
  await expect(page.locator('.source-existing-item')).toHaveCount(3);
  await expect(page.locator('#library-tools')).toBeVisible();
  await expect(page.locator('#library-count')).toHaveText('3 de 3 materiais · 1–3 exibidos');
  await expect(page.locator('#library-pager')).toBeHidden();
});

test('library tools and rows have no axe violations', async ({ page }) => {
  await openMaterials(page, fakeSources(30));
  const results = await new AxeBuilder({ page }).include('#sources-existing').analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
});

test('clicking the NAME of a document opens it once, like its button; the name adds no tab stop', async ({ page }) => {
  const opened = [];
  await page.route('**/v1/sources/1/proposals*', (route) => { opened.push(route.request().url()); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ proposals: [] }) }); });
  await openMaterials(page, fakeSources(3));
  const row = page.locator('.source-existing-item').first();
  await row.locator('.source-existing-name').click();
  await expect.poll(() => opened.length).toBe(1);
  // the name is not focusable: one control per action for keyboard and screen readers
  await expect(row.locator('.source-existing-name')).not.toHaveAttribute('tabindex', /.*/);
  await expect(row.locator('[data-action="open-source"]')).toHaveCount(1);
});
