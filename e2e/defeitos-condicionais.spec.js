import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { VITE_ORIGIN, serverPort } from './support/ports.js';
import { signInRegistered } from './support/session.js';

// Conditional defects of the native UI campaign (.specs/evidence/defeitos-condicionais-2026-11-02.md): the edge-case batches B06/B07/B08
// of scripts/zz-ui-bordas.sh, reproduced here on a disposable server (never the human datastore). Each test is the product behaviour
// one batch exercises, so a regression of the product (not of the batch order) fails here.

const SERVER_PORT = serverPort(13943);
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));

let serverProcess;
let dbDir;

test.beforeAll(async () => {
  dbDir = mkdtempSync(join(tmpdir(), 'sl-e2e-defeitos-'));
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: { ...process.env, SMARTLEARN_DB_PATH: join(dbDir, 'e2e.db'), PORT: String(SERVER_PORT), HOST: 'localhost', NODE_ENV: 'test', SMARTLEARN_ALLOWED_ORIGINS: VITE_ORIGIN },
    stdio: 'ignore',
  });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${API_BASE}/health/ready`)).status === 200) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('defeitos-condicionais E2E: real server did not become ready in time');
});

test.afterAll(async () => {
  serverProcess?.kill();
  await new Promise((r) => setTimeout(r, 300));
  rmSync(dbDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript((base) => {
    window.__SMARTLEARN_API_BASE__ = base;
    window.__SMARTLEARN_REMOTE_MODE__ = true;
  }, API_BASE);
  await signInRegistered(page, { email: `dc-${Date.now()}-${randomUUID()}@example.com`, password: 'a genuinely long test password 1' });
});

async function apiCall(page, method, path, body) {
  return page.evaluate(async ({ base, method, path, body }) => {
    const me = await (await fetch(`${base}/v1/auth/me`, { credentials: 'include' })).json();
    const res = await fetch(`${base}${path}`, { method, credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': me.csrfToken }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!res.ok) throw new Error(`${path} -> ${res.status}: ${await res.text()}`);
    return res.json();
  }, { base: API_BASE, method, path, body });
}

/** The seed the batches share (SEED1): the four disciplines the lesson form offers. */
async function seedDisciplines(page, names = ['Farmacologia', 'Anatomia']) {
  for (const name of names) await apiCall(page, 'POST', '/v1/subjects', { name });
  await page.reload();
  await page.waitForLoadState('networkidle');
}

async function openPlanForm(page) {
  await page.locator('[data-screen="plan"]').click();
  const title = page.locator('#plan-study-title');
  const newUnit = page.locator('#plan-new-unit-btn');
  // isVisible() does not wait: decide only after the screen shows either the open form or the button that opens it, so a form that
  // is still opening is never closed again by a second click (A-10 failed once in a full run for this reason, not reproduced alone).
  await expect(title.or(newUnit).first()).toBeVisible(); // both can be visible at once, hence first()
  if (!(await title.isVisible())) await newUnit.click();
  await expect(title).toBeVisible();
}

async function openSubjectsPanel(page) {
  await page.locator('[data-screen="plan"]').click();
  if (!(await page.locator('#subjects-show-create-btn').isVisible())) await page.locator('#plan-manage-subjects-btn').click();
  await expect(page.locator('#subjects-show-create-btn')).toBeVisible();
}

/** Fills and saves the lesson form; `subject` is a label or null (leave the choice empty). */
async function fillLesson(page, { subject, source = '', title, date }) {
  await openPlanForm(page);
  if (subject) await page.locator('#plan-subject-select').selectOption({ label: subject });
  await page.locator('#plan-study-source').fill(source);
  await page.locator('#plan-study-title').fill(title);
  if (date) await page.locator('#plan-study-date').fill(date);
  await page.locator('#plan-unit-save-btn').click();
}

// ---- B06 (bordas/B06-disciplina-descartavel.txt, B06-titulo-longo.txt) -------------------------------------------------------

test('B06: a throwaway discipline is created, archived, reactivated and deleted; the seeded ones are untouched', async ({ page }) => {
  await seedDisciplines(page);
  await openSubjectsPanel(page);
  await page.locator('#subjects-show-create-btn').click();
  await page.locator('#subjects-new-name').fill('Descartavel');
  await page.locator('#subjects-create-save-btn').click();
  const card = page.locator('.subject-catalog-card', { hasText: 'Descartavel' });
  await expect(card).toBeVisible({ timeout: 5000 });
  await card.getByRole('button', { name: 'Arquivar' }).click();
  await expect(card.getByRole('button', { name: 'Reativar' })).toBeVisible({ timeout: 5000 });
  await card.getByRole('button', { name: 'Reativar' }).click();
  await expect(card.getByRole('button', { name: 'Arquivar' })).toBeVisible({ timeout: 5000 });
  await card.getByRole('button', { name: 'Excluir' }).click();
  await page.locator('#confirm-dialog-ok').click();
  await expect(page.locator('.subject-catalog-card', { hasText: 'Descartavel' })).toHaveCount(0, { timeout: 5000 });
  await expect(page.locator('.subject-catalog-card', { hasText: 'Farmacologia' })).toBeVisible();
  await expect(page.locator('.subject-catalog-card', { hasText: 'Anatomia' })).toBeVisible();
});

test('B06: Escape discards a rename, Enter saves it, and the new name is what the server returns after a reload', async ({ page }) => {
  await seedDisciplines(page);
  await openSubjectsPanel(page);
  const card = () => page.locator('.subject-catalog-card', { hasText: /Farmacologia|Renomeada/ }).first();
  await card().getByRole('button', { name: 'Editar' }).click();
  await card().locator('.subject-edit-name').fill('Descartado');
  await card().locator('.subject-edit-name').press('Escape');
  await expect(page.locator('.subject-catalog-card', { hasText: 'Farmacologia' })).toBeVisible();
  await expect(page.locator('.subject-catalog-card', { hasText: 'Descartado' })).toHaveCount(0);
  await card().getByRole('button', { name: 'Editar' }).click();
  await card().locator('.subject-edit-name').fill('Renomeada');
  await card().locator('.subject-edit-name').press('Enter');
  await expect(page.locator('.subject-catalog-card', { hasText: 'Renomeada' })).toBeVisible({ timeout: 5000 });
  await page.reload();
  await openSubjectsPanel(page);
  await expect(page.locator('.subject-catalog-card', { hasText: 'Renomeada' })).toBeVisible({ timeout: 5000 });
  const names = (await apiCall(page, 'GET', '/v1/subjects')).subjects.map((s) => s.name);
  expect(names).toContain('Renomeada');
  expect(names).not.toContain('Farmacologia');
});

// A-10 cause: the batches run in file order against ONE seeded instance. B06-titulo-longo renames Farmacologia; the next batch (B07) then
// selects "Farmacologia" in the lesson form. The product is right (a renamed discipline is offered under its new name only), so the
// batches must not rename a discipline another batch needs.
test('A-10: after a discipline is renamed, the lesson form offers only the new name (the old name is not selectable)', async ({ page }) => {
  await seedDisciplines(page);
  const farm = (await apiCall(page, 'GET', '/v1/subjects')).subjects.find((s) => s.name === 'Farmacologia');
  await apiCall(page, 'PATCH', `/v1/subjects/${farm.id}`, { name: 'Renomeada' });
  await page.reload();
  await openPlanForm(page);
  const options = await page.locator('#plan-subject-select option').allInnerTexts();
  expect(options).toContain('Renomeada');
  expect(options).not.toContain('Farmacologia');
});

test('B06/A-01: a 200-character title without spaces breaks inside its card instead of crossing the border', async ({ page }) => {
  await seedDisciplines(page);
  const title = 'A'.repeat(200);
  await fillLesson(page, { subject: 'Anatomia', title });
  const row = page.locator('#plan-list .plan-row-compact', { hasText: 'AAAAAAAAAAAAAAAA' }).first();
  await expect(row).toBeVisible({ timeout: 5000 });
  const overflow = await row.evaluate((el) => {
    const card = el.getBoundingClientRect();
    const title = el.querySelector('.plan-unit-title').getBoundingClientRect();
    return { titleRight: title.right, cardRight: card.right, scrolls: el.scrollWidth > el.clientWidth + 1 };
  });
  expect(overflow.titleRight).toBeLessThanOrEqual(overflow.cardRight + 1);
  expect(overflow.scrolls).toBe(false);
});

// ---- B07 (bordas/B07-aulas-bordas.txt) ---------------------------------------------------------------------------------------

test('B07: the lesson form refuses a missing content and a blank content, says why, and creates nothing', async ({ page }) => {
  await seedDisciplines(page);
  const message = page.locator('#plan-unit-form-message');
  await fillLesson(page, { subject: null, title: '' });
  await expect(message).toHaveText('Informe o conteúdo estudado.');
  await fillLesson(page, { subject: 'Farmacologia', source: 'Aula 2', title: '   ' });
  await expect(message).toHaveText('Informe o conteúdo estudado.');
  expect((await apiCall(page, 'GET', '/v1/learning-units')).units).toHaveLength(0); // nothing was created by the refusals
});

test('B07: the edge lessons are saved and listed: same title in two disciplines, empty source, past date and future date', async ({ page }) => {
  await seedDisciplines(page);
  await fillLesson(page, { subject: 'Farmacologia', source: 'Aula 2 Farmacologia', title: 'Farmacodinamica receptores' });
  await expect(page.locator('#plan-list').getByText('Farmacodinamica receptores').first()).toBeVisible({ timeout: 5000 });
  await fillLesson(page, { subject: 'Anatomia', source: '', title: 'Farmacodinamica receptores' });
  await expect(page.locator('#plan-list').getByText('Farmacodinamica receptores')).toHaveCount(2, { timeout: 5000 });
  await fillLesson(page, { subject: 'Anatomia', source: 'Aula antiga', title: 'Neuroanatomia antiga', date: '2026-10-20' });
  await expect(page.locator('#plan-list').getByText('Neuroanatomia antiga')).toBeVisible({ timeout: 5000 });
  await fillLesson(page, { subject: 'Anatomia', source: 'Futura', title: 'Aula futura', date: '2026-12-20' });
  await expect(page.locator('#plan-list').getByText('Aula futura')).toBeVisible({ timeout: 5000 });
  await page.reload();
  await page.locator('[data-screen="plan"]').click();
  for (const title of ['Neuroanatomia antiga', 'Aula futura']) await expect(page.locator('#plan-list').getByText(title)).toBeVisible({ timeout: 5000 });
});

// ---- B08 (bordas/B08-resumo-html-emoji.txt) ----------------------------------------------------------------------------------

test('B08: a summary with HTML and an emoji is stored and shown literally (no element is created), also after a reload', async ({ page }) => {
  await seedDisciplines(page);
  await apiCall(page, 'POST', '/v1/learning-units', { subjectId: (await apiCall(page, 'GET', '/v1/subjects')).subjects[0].id, title: 'Aula resumo borda', studyDate: '2026-08-01' });
  await page.locator('[data-screen="today"]').click();
  const row = page.locator('.review-row', { hasText: 'Aula resumo borda' }).first();
  await expect(row).toBeVisible({ timeout: 8000 });
  await row.locator('.review-row-toggle').first().click();
  const text = 'Resumo de teste: absorção e excreção. <b>não é html</b> ação 😀';
  await row.locator('[data-action="edit-summary"]').click();
  await row.locator('.review-summary-edit textarea').fill(text);
  await row.locator('[data-action="save-summary"]').click();
  await expect(row.locator('.review-summary-text')).toContainText(text, { timeout: 5000 });
  expect(await row.locator('.review-summary-text b').count()).toBe(0);
  await page.reload();
  await page.locator('[data-screen="today"]').click();
  const again = page.locator('.review-row', { hasText: 'Aula resumo borda' }).first();
  await again.locator('.review-row-toggle').first().click();
  await expect(again.locator('.review-summary-text')).toContainText(text, { timeout: 5000 });
  expect(await again.locator('.review-summary-text b').count()).toBe(0);
});
