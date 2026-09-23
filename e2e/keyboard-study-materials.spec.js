import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildFixturePdf } from '../server/test/pdf-fixtures/build-fixture-pdf.js';

// ACCESS-2: "Estudar agora" and "Materiais" completed with the KEYBOARD ALONE (Tab / Shift+Tab / Enter / Space).
// The one thing a keyboard cannot do is pick a file in the OS dialog, so the PDF is handed to the input directly.

const SERVER_PORT = 13996;
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));

let serverProcess;
let dataDir;

test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'sl-e2e-kbd-'));
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: { ...process.env, SMARTLEARN_DB_PATH: join(dataDir, 'e2e.db'), SMARTLEARN_SOURCES_DIR: join(dataDir, 'sources'), PORT: String(SERVER_PORT), HOST: 'localhost', NODE_ENV: 'test', SMARTLEARN_ALLOWED_ORIGINS: 'http://localhost:5199' },
    stdio: 'ignore',
  });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${API_BASE}/health/ready`)).status === 200) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('keyboard E2E: real server did not become ready in time');
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
  const email = `kbd-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const password = 'a genuinely long test password 1';
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(async () => {
    await page.locator('[data-screen="account"]').click();
    await expect(page.locator('#account-show-register')).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20000 });
  await page.locator('#account-show-register').click();
  await page.locator('#account-register-email').fill(email);
  await page.locator('#account-register-password').fill(password);
  await page.locator('#account-register-form button[type="submit"]').click();
  await expect(page.locator('#account-login-form')).toBeVisible({ timeout: 5000 });
  await page.locator('#account-login-email').fill(email);
  await page.locator('#account-login-password').fill(password);
  await page.locator('#account-login-form button[type="submit"]').click();
  await expect(page.locator('#account-logged-in-view')).toBeVisible({ timeout: 5000 });
});

async function apiCall(page, path, body) {
  return page.evaluate(async ({ base, path, body }) => {
    const me = await (await fetch(`${base}/v1/auth/me`, { credentials: 'include' })).json();
    const res = await fetch(`${base}${path}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': me.csrfToken }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`${path} -> ${res.status}: ${await res.text()}`);
    return res.json();
  }, { base: API_BASE, path, body });
}


const describedText = (page, selector) => page.locator(selector).evaluate((el) => (el.getAttribute('aria-describedby') ?? '').split(' ').map((id) => document.getElementById(id)?.textContent ?? '').join(' '));
/** A real keyboard focus indicator (outline or ring) on the element that has focus after a Tab. */
const hasFocusRing = (page) => page.evaluate(() => {
  const cs = getComputedStyle(document.activeElement);
  return (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || (!!cs.boxShadow && cs.boxShadow !== 'none');
});

async function unitWithExercises(page, title, n) {
  const { unit } = await apiCall(page, '/v1/learning-units', { newSubjectName: `Teclado ${title}`, title, studyDate: '2026-04-01' });
  for (let i = 1; i <= n; i++) await apiCall(page, `/v1/learning-units/${unit.id}/exercises`, { question: `${title} pergunta ${i}?`, answer: `Certa ${i}`, explanation: `Porque ${i}.`, provenance: 'MANUAL' });
  return unit;
}
async function openPlanRow(page, title) {
  await page.locator('[data-screen="plan"]').click();
  const row = page.locator('.plan-row', { hasText: title });
  await expect(row).toBeVisible({ timeout: 8000 }); // decide "expand?" only after the screen has rendered, or an open row gets closed
  const toggle = row.locator('.plan-expand-btn');
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await expect(row.locator('[data-action="plan-study-now"]')).toBeVisible();
  return row;
}

test('ACCESS-2 Estudar agora: start, reveal, judge, result and redo are all reachable with the keyboard, and focus is never lost', async ({ page }) => {
  await unitWithExercises(page, 'Aula teclado estudo', 2);
  const row = await openPlanRow(page, 'Aula teclado estudo');
  await row.locator('[data-action="plan-study-now"]').focus();
  await page.keyboard.press('Enter');

  // starting the session puts focus on the first action, and a screen reader hears the question and progress with it
  await expect(page.locator('#study-now-progress')).toHaveText('Questão 1 de 2');
  await expect(page.locator('#study-now-reveal-btn')).toBeFocused();
  expect(await describedText(page, '#study-now-reveal-btn')).toContain('Aula teclado estudo pergunta 1?');
  expect(await describedText(page, '#study-now-reveal-btn')).toContain('Questão 1 de 2');

  await page.keyboard.press('Enter'); // Ver resposta
  await expect(page.locator('#study-now-correct-btn')).toBeFocused();
  expect(await describedText(page, '#study-now-correct-btn')).toContain('Certa 1'); // the answer is announced, not only painted
  await page.keyboard.press('Tab');
  await expect(page.locator('#study-now-incorrect-btn')).toBeFocused();
  expect(await hasFocusRing(page)).toBe(true);
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Enter'); // Acertei

  await expect(page.locator('#study-now-progress')).toHaveText('Questão 2 de 2');
  await expect(page.locator('#study-now-reveal-btn')).toBeFocused(); // next question: focus stays in the flow
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter'); // Errei

  await expect(page.locator('#study-now-result-title')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#study-now-retest-btn')).toBeFocused();
  expect(await hasFocusRing(page)).toBe(true);
  await page.keyboard.press('Enter'); // Refazer erros
  await expect(page.locator('#study-now-progress')).toHaveText('Erro 1 de 1');
  await expect(page.locator('#study-now-reveal-btn')).toBeFocused();
});

test('ACCESS-2 Estudar agora: "Continuar de onde parei" and "Recomeçar" hand focus to the question, not to nowhere', async ({ page }) => {
  await unitWithExercises(page, 'Aula teclado retomada', 3);
  let row = await openPlanRow(page, 'Aula teclado retomada');
  await row.locator('[data-action="plan-study-now"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#study-now-reveal-btn')).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter'); // Acertei question 1 -> snapshot saved
  await expect(page.locator('#study-now-progress')).toHaveText('Questão 2 de 3');

  row = await openPlanRow(page, 'Aula teclado retomada'); // leave and come back
  await row.locator('[data-action="plan-study-now"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#study-now-resume-continue')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#study-now-progress')).toHaveText('Questão 2 de 3');
  await expect(page.locator('#study-now-reveal-btn')).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter'); // Acertei question 2

  row = await openPlanRow(page, 'Aula teclado retomada');
  await row.locator('[data-action="plan-study-now"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#study-now-resume-continue')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#study-now-resume-restart')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#study-now-progress')).toHaveText('Questão 1 de 3');
  await expect(page.locator('#study-now-reveal-btn')).toBeFocused();
});

test('ACCESS-2 Materiais: generate a draft, review it and accept it with the keyboard; focus follows every step', async ({ page }) => {
  await page.locator('[data-screen="materials"]').click();
  await expect(page.locator('#sources-card')).toBeVisible({ timeout: 5000 });
  // the OS file dialog is the one step a test cannot press; the input itself is in the page and reachable
  await expect(page.locator('#sources-file-input')).toBeAttached();
  await page.setInputFiles('#sources-file-input', { name: 'farmaco.pdf', mimeType: 'application/pdf', buffer: buildFixturePdf(['Farmacocinética: absorção e distribuição']) });
  await expect(page.locator('#sources-message')).toContainText('trecho(s) proposto(s)', { timeout: 10000 });

  const item = page.locator('.source-proposal-item').first();
  await item.locator('[data-action="generate-draft"]').focus();
  await page.keyboard.press('Enter');
  const panel = item.locator('.source-draft-panel');
  await expect(panel).toBeVisible({ timeout: 10000 });
  await expect(panel).toBeFocused(); // the pressed button was disabled while working: focus must not fall to the page
  await expect(panel).toHaveAttribute('aria-label', 'Rascunho para revisar');

  // Tab from the draft reaches the accept button (with a visible ring); focus never falls out of the page on the way
  const accept = panel.locator('[data-action="accept-draft"]');
  let reached = false;
  for (let i = 0; i < 25 && !reached; i++) {
    await page.keyboard.press('Tab');
    reached = await accept.evaluate((el) => el === document.activeElement);
    expect(await page.evaluate(() => document.activeElement !== document.body), 'focus never falls out of the page mid-draft').toBe(true);
  }
  expect(reached, 'the accept button is reachable by Tab').toBe(true);
  expect(await hasFocusRing(page)).toBe(true);

  // accepting without a subject fails IN PLACE: the error is announced (role=status) and focus returns to the button
  await page.keyboard.press('Enter');
  await expect(panel.locator('.source-draft-result')).toHaveClass(/is-error/, { timeout: 8000 });
  await expect(panel.locator('.source-draft-result')).toHaveAttribute('role', 'status');
  await expect(accept).toBeFocused();

  // fix it with the keyboard: subject name, then the button again
  await panel.locator('.source-draft-subject-input').focus();
  await page.keyboard.type('Farmacologia teclado');
  await panel.locator('.source-draft-date-input').fill('2026-04-01');
  await accept.focus();
  await page.keyboard.press('Enter');
  await expect(panel.locator('.source-draft-result')).toContainText('Aula criada', { timeout: 10000 });
  // the pressed button became "Aceito" (disabled): the one obvious next action takes focus and works with Enter
  const study = panel.locator('[data-action="study-now"]');
  await expect(study).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#study-now-reveal-btn')).toBeFocused();
});
