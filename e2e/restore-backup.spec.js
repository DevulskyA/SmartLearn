import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { VITE_ORIGIN, serverPort } from './support/ports.js';

// IMPORT-1: the student's own backup, restored into a NEW account through the real UI.
//   account A (has data) -> "Exportar backup" (a real browser download) -> account B (empty)
//   -> "Restaurar ou migrar backup" -> preview -> confirm -> the study is there, survives a
//   reload, and B's own export carries the same content as A's.
// And the safety side: A cannot restore its own file back into itself (the account is not empty).
// Same real-server-child-process pattern as e2e/migration.spec.js; synthetic accounts only.

const SERVER_PORT = serverPort(13968);
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));
const FIXTURE_PATH = fileURLToPath(new URL('../server/test/import-fixtures/v3-schema.json', import.meta.url));

let serverProcess;
let dbDir;

test.beforeAll(async () => {
  dbDir = mkdtempSync(join(tmpdir(), 'sl-e2e-restore-'));
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: { ...process.env, SMARTLEARN_DB_PATH: join(dbDir, 'e2e.db'), PORT: String(SERVER_PORT), HOST: 'localhost', NODE_ENV: 'test', SMARTLEARN_ALLOWED_ORIGINS: VITE_ORIGIN },
    stdio: 'ignore',
  });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${API_BASE}/health/ready`)).status === 200) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('restore E2E: real server did not become ready in time');
});

test.afterAll(async () => {
  serverProcess?.kill();
  await new Promise((r) => setTimeout(r, 300));
  rmSync(dbDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

async function registerAndLogin(page) {
  const email = `restore-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const password = 'a genuinely long test password 1';
  await page.addInitScript((base) => {
    window.__SMARTLEARN_API_BASE__ = base;
    window.__SMARTLEARN_REMOTE_MODE__ = true;
  }, API_BASE);
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
}

const exportViaApi = (page) => page.evaluate(async (base) => (await fetch(`${base}/v1/export`, { credentials: 'include' })).json(), API_BASE);

async function giveAccountStudyData(page) {
  await page.locator('[data-screen="settings"]').click();
  await page.locator('#migration-file-input').setInputFiles({ name: 'v3-schema.json', mimeType: 'application/json', buffer: Buffer.from(readFileSync(FIXTURE_PATH, 'utf8')) });
  await expect(page.locator('#migration-preview-panel')).toBeVisible({ timeout: 5000 });
  await page.locator('#migration-confirm-btn').click();
  await page.locator('#confirm-dialog-ok').click();
  await expect(page.locator('#migration-result-panel')).toBeVisible({ timeout: 5000 });
}

/** The real artifact a student has: the file the "Exportar backup" button downloads. */
async function downloadBackup(page) {
  await page.locator('[data-screen="settings"]').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#export-backup').click()]);
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const buffer = Buffer.concat(chunks);
  expect(JSON.parse(buffer.toString('utf8')).exportVersion).toBe(1);
  return buffer;
}

const contentOf = (exported) => ({
  subjects: exported.subjects.map((s) => [s.name, s.color, s.is_active]),
  units: exported.learningUnits.map((u) => [u.title, u.study_date, u.summary_body]),
  tasks: exported.reviewTasks.map((t) => [t.offset_days, t.due_date, t.completed_at]),
  exercises: exported.exerciseVersions.map((v) => [v.question, v.answer, v.hint, v.provenance]),
  evidence: exported.learningEvidence.map((e) => [e.type, e.questions_count, e.correct_count, e.evidence_date]),
  timezone: exported.settings.timezone,
});

test('a student restores their own exported backup into a new, empty account — it is all there, survives a reload, and exports back identically', async ({ page, browser }) => {
  await registerAndLogin(page);
  await giveAccountStudyData(page);
  const backup = await downloadBackup(page);
  const exportA = await exportViaApi(page);
  expect(exportA.learningUnits.length).toBe(1);
  expect(exportA.reviewTasks.length).toBe(2);

  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  try {
    await registerAndLogin(pageB);
    await pageB.locator('[data-screen="settings"]').click();
    await expect(pageB.locator('#migration-card')).toBeVisible({ timeout: 5000 });
    await expect(pageB.locator('#migration-title')).toHaveText('Restaurar ou migrar backup');

    await pageB.locator('#migration-file-input').setInputFiles({ name: 'smartlearn-backup.json', mimeType: 'application/json', buffer: backup });
    await expect(pageB.locator('#migration-preview-panel')).toBeVisible({ timeout: 5000 });
    await expect(pageB.locator('#migration-counts')).toContainText('Disciplinas');
    await expect(pageB.locator('#migration-counts')).toContainText('Versões de exercícios');
    await expect(pageB.locator('#migration-counts')).toContainText('Eventos de aprendizagem');
    // The exclusion is stated in the interface, before anything is written.
    await expect(pageB.locator('#migration-warnings')).toContainText('PDFs');
    await expect(pageB.locator('#migration-conflicts li')).toHaveCount(0);

    // Preview wrote nothing.
    expect((await exportViaApi(pageB)).subjects.length).toBe(0);

    await pageB.locator('#migration-confirm-btn').click();
    await pageB.locator('#confirm-dialog-ok').click();
    await expect(pageB.locator('#migration-result-panel')).toBeVisible({ timeout: 5000 });
    await expect(pageB.locator('#migration-result-summary')).toContainText('Restauração concluída');
    await expect(pageB.locator('#migration-result-summary')).toContainText('Disciplinas: 1');

    // The restored study is real, owned data on the normal screens, before AND after a reload.
    await pageB.locator('[data-screen="plan"]').click();
    await expect(pageB.locator('#screen-plan').getByText('Farmacocinetica')).toBeVisible({ timeout: 5000 });
    await pageB.reload();
    await pageB.waitForLoadState('networkidle');
    await pageB.locator('[data-screen="plan"]').click();
    await expect(pageB.locator('#screen-plan').getByText('Farmacocinetica')).toBeVisible({ timeout: 5000 });
    await pageB.locator('[data-screen="stats"]').click();
    await expect(pageB.locator('#title-stats')).toBeVisible();

    // B's own export carries A's content (ids differ; the full logical equivalence is proven in
    // server/test/logical-restore.test.js — here we confirm it end to end through the real UI).
    const exportB = await exportViaApi(pageB);
    expect(contentOf(exportB)).toEqual(contentOf(exportA));
    expect(exportB.learningUnits[0].id).toBeDefined();
    expect(exportB.user.email).not.toBe(exportA.user.email);
  } finally {
    await contextB.close();
  }
});

test('a non-empty account refuses the restore with a clear message and changes nothing', async ({ page }) => {
  await registerAndLogin(page);
  await giveAccountStudyData(page);
  const backup = await downloadBackup(page);
  const before = await exportViaApi(page);

  await page.locator('[data-screen="settings"]').click();
  await page.locator('#migration-file-input').setInputFiles({ name: 'smartlearn-backup.json', mimeType: 'application/json', buffer: backup });
  await expect(page.locator('#migration-message')).toContainText('já tem dados', { timeout: 5000 });
  await expect(page.locator('#migration-preview-panel')).toBeHidden();

  const after = await exportViaApi(page);
  expect({ ...after, exportedAt: null }).toEqual({ ...before, exportedAt: null });
});
