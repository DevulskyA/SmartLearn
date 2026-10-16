import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildFixturePdf } from '../server/test/pdf-fixtures/build-fixture-pdf.js';
import { VITE_ORIGIN, serverPort } from './support/ports.js';
import { signInRegistered } from './support/session.js';

// T-F4-05 (R-06 AC-06.2, F-35): the lesson editor with the KEYBOARD alone and with a screen reader's contract: the tabs follow the
// tab pattern (arrows / Home / End, one tab stop), saving / accepting / rejecting keeps the focus somewhere meaningful (never on
// <body>), the "salvo" messages live in regions that exist BEFORE they change (so they are announced), and every question in the
// list has a clean accessible name ("Questão 3, sinalizada, 2 pontos"). Real server, FAKE provider: no model is called.

const SERVER_PORT = serverPort(13995);
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));

let serverProcess;
let dataDir;

test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'sl-e2e-lesson-a11y-'));
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
  throw new Error('lesson-editor-a11y E2E: real server did not become ready in time');
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
  const email = `leda11y-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  await signInRegistered(page, { email, password: 'a genuinely long test password 1' });
  await page.locator('[data-screen="materials"]').click();
  await expect(page.locator('#sources-card')).toBeVisible({ timeout: 5000 });
  const pdf = buildFixturePdf(['Fisiologia renal: filtração glomerular', 'Barreira de filtração e podócitos', 'Clearance de inulina mede a TFG']);
  await page.setInputFiles('#sources-file-input', { name: 'teclado.pdf', mimeType: 'application/pdf', buffer: pdf });
  await expect(page.locator('#sources-message')).toContainText('trecho(s) proposto(s)', { timeout: 10000 });
  await page.locator('.source-proposal-item').first().locator('[data-action="generate-draft"]').click();
  await expect(page.locator('.lesson-editor')).toBeVisible({ timeout: 10000 });
});

const focusIsOnPage = (page) => page.evaluate(() => document.activeElement !== document.body && document.activeElement !== null);
/** Presses Tab until `locator` has the focus (the keyboard route to it), failing if it is never reached. */
async function tabTo(page, locator, max = 25) {
  for (let i = 0; i < max; i += 1) {
    if (await locator.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press('Tab');
    expect(await focusIsOnPage(page), 'focus never falls out of the page while tabbing').toBe(true);
  }
  throw new Error('the control was not reachable by Tab');
}
/** Tags the live region so that, after the action, we can tell whether the SAME node (which a screen reader is watching) changed. */
const tagRegion = (locator) => locator.evaluate((el) => { window.__watchedRegion = el; return el.getAttribute('role'); });
const regionState = (page) => page.evaluate(() => ({ stillInPage: window.__watchedRegion.isConnected, text: window.__watchedRegion.textContent }));

test('the four tabs follow the tab pattern: one tab stop, arrows wrap, Home/End jump, the panel is the tab\'s own', async ({ page }) => {
  const editor = page.locator('.lesson-editor');
  const tabs = editor.getByRole('tab');
  await expect(tabs).toHaveCount(4);
  await expect(editor.locator('[role="tab"][tabindex="0"]')).toHaveCount(1); // roving tabindex: a single stop for the whole list
  await tabTo(page, tabs.nth(0));
  const selected = async () => (await tabs.evaluateAll((all) => all.map((t) => t.getAttribute('aria-selected') === 'true'))).findIndex(Boolean);
  const focused = async () => (await tabs.evaluateAll((all) => all.map((t) => t === document.activeElement))).findIndex(Boolean);
  for (const [key, expected] of [['ArrowRight', 1], ['ArrowRight', 2], ['End', 3], ['ArrowRight', 0], ['ArrowLeft', 3], ['Home', 0]]) {
    await page.keyboard.press(key);
    expect(await selected(), `${key} selects`).toBe(expected);
    expect(await focused(), `${key} focuses`).toBe(expected);
    const panel = editor.locator('[role="tabpanel"]:not([hidden])');
    await expect(panel).toHaveCount(1);
    await expect(panel).toHaveAttribute('aria-labelledby', (await tabs.nth(expected).getAttribute('id')) ?? '');
    expect(await tabs.nth(expected).getAttribute('aria-controls')).toBe(await panel.getAttribute('id'));
  }
});

test('keyboard only: open a question, edit and save it; the confirmation is announced from a region that already existed and the focus stays in the question', async ({ page }) => {
  const editor = page.locator('.lesson-editor');
  await tabTo(page, editor.getByRole('tab').nth(0));
  await page.keyboard.press('ArrowRight'); // Questões
  await tabTo(page, editor.locator('.lesson-qitem').nth(1));
  await page.keyboard.press('Enter');
  await expect(editor.locator('.lesson-qeditor textarea').first()).toBeFocused(); // opening a question puts the cursor in its first field
  await page.keyboard.press('Tab');
  await expect(editor.locator('.lesson-qeditor textarea').nth(1)).toBeFocused();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('Resposta escrita só com o teclado');
  const status = editor.locator('.lesson-qeditor [role="status"]');
  await expect(status).toHaveCount(1);
  await tagRegion(status);
  await tabTo(page, editor.locator('[data-action="save-question"]'));
  await page.keyboard.press('Enter');
  await expect(status).toHaveText('Questão salva.', { timeout: 5000 });
  const after = await regionState(page);
  expect(after.stillInPage, 'the announced region is the same node, not a new one inserted with its text').toBe(true);
  expect(after.text).toBe('Questão salva.');
  // "Salvar questão" is disabled now (nothing to save): the focus goes to the question, not to <body>
  await expect(editor.locator('.lesson-qeditor .lesson-qheading')).toBeFocused();
  // and the keyboard continues from there: the next Tab reaches the first field of that same question
  await page.keyboard.press('Tab');
  await expect(editor.locator('.lesson-qeditor textarea').first()).toBeFocused();
  await expect(editor.locator('.lesson-qeditor textarea').nth(1)).toHaveValue('Resposta escrita só com o teclado');
});

test('reject and restore keep the focus on the same button; accept moves it to the question; messages are announced', async ({ page }) => {
  const editor = page.locator('.lesson-editor');
  await editor.getByRole('tab', { name: /Questões/ }).click();
  const status = editor.locator('.lesson-qeditor [role="status"]');
  await tagRegion(status);
  const reject = editor.locator('[data-action="toggle-reject-question"]');
  await reject.focus();
  await page.keyboard.press('Enter');
  await expect(status).toContainText('Questão rejeitada', { timeout: 5000 });
  await expect(reject).toBeFocused();
  await expect(reject).toHaveText('Restaurar questão');
  await page.keyboard.press('Enter');
  await expect(status).toHaveText('Questão restaurada.', { timeout: 5000 });
  await expect(reject).toBeFocused();
  expect((await regionState(page)).stillInPage).toBe(true);
  const accept = editor.locator('[data-action="accept-question"]');
  await accept.focus();
  await page.keyboard.press('Enter');
  await expect(status).toHaveText('Questão aceita.', { timeout: 5000 });
  await expect(accept).toBeDisabled();
  await expect(editor.locator('.lesson-qeditor .lesson-qheading')).toBeFocused();
});

test('keyboard only: saving the summary announces it from a standing region and leaves the focus in the summary', async ({ page }) => {
  const editor = page.locator('.lesson-editor');
  const field = editor.locator('.lesson-summary-input');
  await field.focus();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' Acrescentado pelo teclado.');
  const status = editor.locator('[data-panel="summary"] [role="status"]');
  await tagRegion(status);
  await tabTo(page, editor.locator('[data-action="save-summary"]'));
  await page.keyboard.press('Enter');
  await expect(status).toContainText('Resumo salvo', { timeout: 5000 });
  expect((await regionState(page)).stillInPage).toBe(true);
  await expect(field).toBeFocused(); // the save button is disabled now; the text just saved is where the student was working
});

test('"Voltar às unidades" puts the focus on the draft just left (in "Rascunhos em andamento"), not on a far-away button', async ({ page }) => {
  const editor = page.locator('.lesson-editor');
  await editor.locator('[data-action="lesson-back"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#sources-card')).toBeVisible();
  await expect(page.locator('#sources-drafts').getByRole('button', { name: /Abrir rascunho/ })).toBeFocused({ timeout: 8000 });
});

test('every question of the list has one clean accessible name: number, state and points', async ({ page }) => {
  const editor = page.locator('.lesson-editor');
  await editor.getByRole('tab', { name: /Questões/ }).click();
  const names = () => editor.locator('.lesson-qitem').evaluateAll((all) => all.map((b) => b.getAttribute('aria-label')));
  const NAME = /^Questão (\d+), (proposta|sinalizada|aceita|rejeitada)(, \d+ pontos?)?(, não salva)?$/;
  for (const name of await names()) expect(name).toMatch(NAME);
  expect((await names())[0]).toMatch(/^Questão 1, /);
  // the names follow the state
  await editor.locator('.lesson-qitem').nth(1).click();
  await editor.locator('[data-action="toggle-reject-question"]').click();
  await expect(editor.locator('.lesson-qitem').nth(1)).toHaveAttribute('aria-label', 'Questão 2, rejeitada');
  await editor.locator('[data-action="toggle-reject-question"]').click();
  await expect(editor.locator('.lesson-qitem').nth(1)).not.toHaveAttribute('aria-label', 'Questão 2, rejeitada');
  await editor.locator('.lesson-qeditor textarea').nth(1).fill('mudou');
  await expect(editor.locator('.lesson-qitem').nth(1)).toHaveAttribute('aria-label', /, não salva$/);
  // the visible label stays inside the name (WCAG 2.5.3: label in name)
  const ok = await editor.locator('.lesson-qitem').evaluateAll((all) => all.every((b) => b.getAttribute('aria-label').toLowerCase().includes(b.querySelector('.lesson-qitem-name').textContent.toLowerCase())));
  expect(ok).toBe(true);
});
