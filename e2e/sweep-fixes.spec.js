import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { VITE_ORIGIN, serverPort } from './support/ports.js';
import { signInRegistered } from './support/session.js';

// Functional / accessibility / text-correctness defects found by a Playwright + axe sweep of the real UI (empty account, then
// a seeded one). One test per defect, on the REAL server and UI. The interface itself is frozen: these assert behavior and text.

const SERVER_PORT = serverPort(13991);
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));
const PASSWORD = 'a genuinely long test password 1';

let serverProcess;
let dataDir;

test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'sl-e2e-sweep-'));
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
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${API_BASE}/health/ready`)).status === 200) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('sweep-fixes E2E: real server did not become ready in time');
});

test.afterAll(async () => {
  serverProcess?.kill();
  await new Promise((r) => setTimeout(r, 300));
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

const uniqueEmail = () => `sweep-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;

async function signIn(page, email = uniqueEmail()) {
  await page.addInitScript((base) => {
    window.__SMARTLEARN_API_BASE__ = base;
    window.__SMARTLEARN_REMOTE_MODE__ = true;
    window.__SMARTLEARN_LOCAL_AUTHORITY__ = true;
  }, API_BASE);
  await signInRegistered(page, { email, password: PASSWORD });
  return email;
}

async function apiCall(page, path, body) {
  return page.evaluate(async ({ base, path, body }) => {
    const me = await (await fetch(`${base}/v1/auth/me`, { credentials: 'include' })).json();
    const res = await fetch(`${base}${path}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': me.csrfToken }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`${path} -> ${res.status}: ${await res.text()}`);
    return res.json();
  }, { base: API_BASE, path, body });
}

const openScreen = async (page, id) => {
  await page.locator(`.app-nav [data-screen="${id}"]:visible, [data-screen="${id}"]:visible`).first().click();
  await expect(page.locator(`#screen-${id}`)).toBeVisible();
};

test('Estatísticas: an account with no answered question shows a dash, not a 0,0% average', async ({ page }) => {
  await signIn(page);
  await openScreen(page, 'stats');
  await expect(page.locator('#metric-average')).toHaveText('—');
});

test('Backup: after an export the screen shows the date and not the "none" text, and it survives a reload', async ({ page }) => {
  const warnings = [];
  page.on('console', (msg) => { if (msg.type() === 'warning') warnings.push(msg.text()); });
  await signIn(page);
  await openScreen(page, 'settings');
  await expect(page.locator('#last-backup-label')).toHaveText('Nenhum backup exportado.');
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#export-backup').click()]);
  expect(download.suggestedFilename()).toMatch(/^smartlearn-backup-\d{4}-\d{2}-\d{2}\.json$/);
  await expect(page.locator('#backup-message')).toHaveText('Backup exportado com sucesso.');
  await expect(page.locator('#last-backup-label')).toContainText('Último backup:');
  await expect(page.locator('#last-backup-label')).not.toContainText('Nenhum backup');
  expect(warnings.filter((w) => w.includes('último backup'))).toEqual([]);
  // a reload keeps it (same device, same account)
  await page.reload();
  await page.waitForLoadState('networkidle');
  await openScreen(page, 'settings');
  await expect(page.locator('#last-backup-label')).toContainText('Último backup:');
});

test('Acompanhar > Ver no Plano: a Plano subject filter that hides the unit is relaxed and the unit opens expanded', async ({ page }) => {
  await signIn(page);
  const a = await apiCall(page, '/v1/learning-units', { newSubjectName: 'Fisiologia Renal', title: 'Filtração glomerular', studyDate: '2026-08-01' });
  const b = await apiCall(page, '/v1/learning-units', { newSubjectName: 'Cardiologia', title: 'Ciclo cardíaco', studyDate: '2026-08-02' });
  await openScreen(page, 'plan');
  await expect(page.locator('#plan-list .plan-row')).toHaveCount(2);
  // filter the Plano down to the OTHER discipline (what a student does before leaving the screen)
  await page.evaluate((subjectId) => {
    const select = document.querySelector('#plan-filter-subject');
    select.value = String(subjectId);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }, b.unit.subjectId);
  await expect(page.locator('#plan-list .plan-row')).toHaveCount(1);
  await openScreen(page, 'tracking');
  const card = page.locator('.tracking-card', { hasText: 'Filtração glomerular' });
  await card.getByRole('button', { name: 'Ver no Plano' }).click();
  await expect(page.locator('#screen-plan')).toBeVisible();
  const row = page.locator(`#plan-list .plan-row[data-unit-id="${a.unit.id}"]`);
  await expect(row).toBeVisible();
  await expect(row.locator('.plan-expand-btn')).toHaveAttribute('aria-expanded', 'true');
  await expect(row.locator('.plan-row-detail')).toBeVisible();
});

test('Disciplinas > Editar: the name field has an accessible name (axe "label")', async ({ page }) => {
  await signIn(page);
  await apiCall(page, '/v1/learning-units', { newSubjectName: 'Fisiologia Renal', title: 'Filtração glomerular', studyDate: '2026-08-01' });
  await openScreen(page, 'subjects');
  const card = page.locator('.subject-catalog-card', { hasText: 'Fisiologia Renal' });
  await card.getByRole('button', { name: 'Editar' }).click();
  await expect(card.getByRole('textbox', { name: 'Nome da disciplina' })).toBeVisible();
  const result = await new AxeBuilder({ page }).include('#screen-subjects').withRules(['label']).analyze();
  expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
});
