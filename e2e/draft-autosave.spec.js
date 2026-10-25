import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildFixturePdf } from '../server/test/pdf-fixtures/build-fixture-pdf.js';
import { VITE_ORIGIN, serverPort } from './support/ports.js';
import { signInRegistered } from './support/session.js';
import { startForwarder } from './support/forwarder.js';

// Autosave of the lesson draft (summary and each question): 2.5 s without typing, a recoverable local copy written at every keystroke, no old
// answer over new text, no blind retry after a conflict, recovery after a lost connection or a window closed in the middle, and saving is
// never accepting. Real server, throwaway database.

const SERVER_PORT = serverPort(13983);
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));
const SUMMARY_URL = '**/v1/drafts/*/summary';
const QUESTION_URL = '**/v1/drafts/*/questions/*';
const FOREIGN_FIGURE = '3f2c9a54-7b1d-4e0a-8c55-0d9e6a7b1c42';

let serverProcess;
let dataDir;

test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'sl-e2e-autosave-'));
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: { ...process.env, SMARTLEARN_DB_PATH: join(dataDir, 'e2e.db'), SMARTLEARN_SOURCES_DIR: join(dataDir, 'sources'), SMARTLEARN_MEDIA_DIR: join(dataDir, 'media'), PORT: String(SERVER_PORT), HOST: 'localhost', NODE_ENV: 'test', SMARTLEARN_ALLOWED_ORIGINS: VITE_ORIGIN },
    stdio: 'ignore',
  });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${API_BASE}/health/ready`)).status === 200) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('autosave E2E: real server did not become ready in time');
});

test.afterAll(async () => {
  serverProcess?.kill();
  await new Promise((r) => setTimeout(r, 300));
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test.beforeEach(async ({ page, context }) => {
  await context.addInitScript((base) => {
    window.__SMARTLEARN_API_BASE__ = base;
    window.__SMARTLEARN_REMOTE_MODE__ = true;
    window.__SMARTLEARN_LOCAL_AUTHORITY__ = true;
  }, API_BASE);
  await signInRegistered(page, { email: `autosave-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`, password: 'a genuinely long test password 1' });
});

async function openDraft(page) {
  await page.locator('[data-screen="materials"]').click();
  await expect(page.locator('#sources-card')).toBeVisible({ timeout: 5000 });
  await page.setInputFiles('#sources-file-input', { name: 'aula.pdf', mimeType: 'application/pdf', buffer: buildFixturePdf(['Fisiologia renal: filtração glomerular', 'Barreira de filtração e podócitos', 'Clearance de inulina mede a TFG']) });
  await expect(page.locator('#sources-message')).toContainText(/trechos? propostos?/, { timeout: 10000 });
  await page.locator('.source-proposal-item').first().locator('[data-action="generate-draft"]').click();
  const editor = page.locator('.lesson-editor');
  await expect(editor).toBeVisible({ timeout: 10000 });
  return editor;
}

async function reopenDraft(page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.locator('[data-screen="materials"]').click();
  await page.locator('#sources-existing-list .source-existing-item', { hasText: 'aula.pdf' }).locator('[data-action="open-source"]').click();
  await expect(page.locator('#sources-message')).toContainText(/trechos? propostos?/, { timeout: 15000 });
  await page.locator('.source-proposal-item').first().locator('[data-action="open-draft"]').click();
  const editor = page.locator('.lesson-editor');
  await expect(editor).toBeVisible({ timeout: 10000 });
  return editor;
}

/** Opens a draft whose summary is `text` (saved by the deliberate button, so the autosave starts from a clean state). */
async function startWith(page, text) {
  const editor = await openDraft(page);
  await editor.locator('.lesson-summary-input').fill(text);
  await editor.locator('[data-action="save-summary"]').click();
  await expect(editor.locator('[data-panel="summary"] .lesson-message')).toContainText('Resumo salvo');
  return editor;
}

const draftId = (editor) => editor.getAttribute('data-draft-id');
const serverDraft = async (page, editor) => {
  const id = await draftId(editor);
  return page.evaluate(async ({ base, id: draft }) => (await (await fetch(`${base}/v1/drafts/${draft}`, { credentials: 'include' })).json()).draft, { base: API_BASE, id });
};
const localCopy = async (page, editor) => {
  const id = await draftId(editor);
  return page.evaluate((key) => { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; }, `smartlearn.draft-recovery.v1.${id}`);
};
const patchCounter = (page, pattern) => {
  const seen = { count: 0, active: 0, maxActive: 0 };
  page.on('request', (req) => { if (req.method() === 'PATCH' && pattern.test(req.url())) { seen.count += 1; seen.active += 1; seen.maxActive = Math.max(seen.maxActive, seen.active); } });
  const done = (req) => { if (req.method() === 'PATCH' && pattern.test(req.url())) seen.active -= 1; };
  page.on('requestfinished', done);
  page.on('requestfailed', done);
  return seen;
};
const PROXY_PORT = serverPort(13976);
let forwarder = null;

/**
 * From now on the app talks to the server through a forwarder the test can cut (e2e/support/forwarder.js). Needed to close or kill a window in the
 * middle of an edit with the server really unreachable: a Playwright route or the offline mode disappear with the page, and the "last chance" save a
 * closing page attempts would then reach the server and spoil the scenario.
 */
async function throughForwarder(page, context) {
  forwarder = await startForwarder(PROXY_PORT, SERVER_PORT);
  await context.addInitScript((base) => { window.__SMARTLEARN_API_BASE__ = base; }, `http://localhost:${PROXY_PORT}`);
  await page.reload();
  await page.waitForLoadState('networkidle');
}
test.afterEach(async () => { await forwarder?.close(); forwarder = null; });

/**
 * The connection is lost and the window closed in the middle of an edit: the server never gets the text. A short pause first: the browser hands
 * localStorage writes to its storage process in the background, and a renderer killed within milliseconds of the last keystroke can lose that last
 * write; what the student typed a moment before is what the recovery has to find. Returns the page the student opens afterwards, with the connection back.
 */
async function closeWithServerUnreachable(page, context, after = async () => {}) {
  await after();
  await page.waitForTimeout(300);
  forwarder.cut();
  await page.close({ runBeforeUnload: false });
  // the closing page may still run its last-chance save a moment AFTER close() has returned: the server stays unreachable until it is surely gone
  // (if that request got through the text would simply be saved, which is the better outcome but not the scenario under test)
  await new Promise((resolve) => setTimeout(resolve, 1500));
  forwarder.restore();
  return context.newPage();
}
const summaryMessage = (editor) => editor.locator('[data-panel="summary"] .lesson-message');
const summaryIndicator = (editor) => editor.locator('[data-panel="summary"] .save-indicator');
const questionIndicator = (editor) => editor.locator('.lesson-qeditor .save-indicator');

test('the summary saves itself 2.5 s after the last keystroke, not before, and then needs no confirmation to leave', async ({ page }) => {
  const editor = await startWith(page, 'Base.');
  const input = editor.locator('.lesson-summary-input');
  const patches = patchCounter(page, /\/summary$/);
  await input.click();
  await input.press('End');
  for (const ch of ' abcd') { await input.pressSequentially(ch); await page.waitForTimeout(900); } // 4.5 s of continuous typing, never idle for 2.5 s
  expect(patches.count).toBe(0);
  await expect.poll(async () => (await serverDraft(page, editor)).summary, { timeout: 8000 }).toBe('Base. abcd');
  expect(patches.count).toBe(1);
  await expect(summaryIndicator(editor)).toHaveAttribute('data-state', 'saved');
  await expect(editor.locator('[data-action="save-summary"]')).toBeDisabled();
  expect(await localCopy(page, editor)).toBeNull(); // the server has it: the local copy is gone
  let asked = false;
  page.once('dialog', (dialog) => { asked = true; dialog.dismiss(); });
  await editor.locator('[data-action="lesson-back"]').click();
  expect(asked).toBe(false);
});

test('every keystroke is kept at once in a recoverable local copy, before any request', async ({ page }) => {
  const editor = await startWith(page, 'Base.');
  await page.route(SUMMARY_URL, (route) => route.abort('failed')); // the network is down: only the local copy can hold the text
  const input = editor.locator('.lesson-summary-input');
  await input.click();
  await input.press('End');
  await input.pressSequentially(' guardado');
  const copy = await localCopy(page, editor); // read right away: nothing waited for 2.5 s
  expect(copy.summary.text).toBe('Base. guardado');
  expect(typeof copy.summary.baseVersion).toBe('number');
});

test('a slow answer never overwrites newer text, and two requests are never in flight together', async ({ page }) => {
  const editor = await startWith(page, 'Base.');
  const input = editor.locator('.lesson-summary-input');
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let held = false;
  await page.route(SUMMARY_URL, async (route) => {
    if (route.request().method() === 'PATCH' && !held) { held = true; await gate; }
    await route.continue();
  });
  const patches = patchCounter(page, /\/summary$/);
  await input.click();
  await input.press('End');
  await input.pressSequentially(' A');
  await expect.poll(() => patches.count, { timeout: 6000 }).toBe(1); // the first autosave is on its way and held
  await input.pressSequentially('B');
  await page.waitForTimeout(3500); // longer than the autosave wait: still only the first request exists
  expect(patches.count).toBe(1);
  release();
  await expect.poll(async () => (await serverDraft(page, editor)).summary, { timeout: 9000 }).toBe('Base. AB');
  await expect(input).toHaveValue('Base. AB');
  expect(patches.maxActive).toBe(1);
  await expect(editor.locator('[data-action="save-summary"]')).toBeDisabled();
});

test('a lost connection keeps the text, says so, retries by itself and saves when the network is back', async ({ page }) => {
  const editor = await startWith(page, 'Base.');
  const input = editor.locator('.lesson-summary-input');
  await page.route(SUMMARY_URL, (route) => route.abort('failed'));
  await input.click();
  await input.press('End');
  await input.pressSequentially(' sem rede');
  await expect(summaryMessage(editor)).toContainText('Sem conexão', { timeout: 7000 });
  await expect(input).toHaveValue('Base. sem rede');
  expect((await localCopy(page, editor)).summary.text).toBe('Base. sem rede');
  expect((await serverDraft(page, editor)).summary).toBe('Base.');
  await page.unroute(SUMMARY_URL); // the network is back
  await expect.poll(async () => (await serverDraft(page, editor)).summary, { timeout: 12000 }).toBe('Base. sem rede');
  await expect(summaryIndicator(editor)).toHaveAttribute('data-state', 'saved');
  await expect.poll(() => localCopy(page, editor), { timeout: 3000 }).toBeNull();
});

test('a window closed in the middle: the text comes back from the local copy, is offered, recovered and then saved', async ({ page, context }) => {
  await throughForwarder(page, context);
  const editor = await startWith(page, 'Base.');
  const input = editor.locator('.lesson-summary-input');
  const again = await closeWithServerUnreachable(page, context, async () => { // unexpected close, the server never gets the text
    await input.click();
    await input.press('End');
    await input.pressSequentially(' escrito antes de fechar');
    expect((await localCopy(page, editor)).summary.text).toBe('Base. escrito antes de fechar');
  });

  const editor2 = await reopenDraft(again);
  const banner = editor2.locator('.lesson-recovery');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('alterações não salvas');
  await expect(editor2.locator('.lesson-summary-input')).toHaveValue('Base.'); // nothing is applied behind the student's back
  await banner.locator('[data-action="recover"]').click();
  await expect(editor2.locator('.lesson-summary-input')).toHaveValue('Base. escrito antes de fechar');
  await expect(banner).toBeHidden();
  await expect.poll(async () => (await serverDraft(again, editor2)).summary, { timeout: 8000 }).toBe('Base. escrito antes de fechar');
  expect(await localCopy(again, editor2)).toBeNull();
});

test('the student can discard the recovered copy: the saved text stays and nothing is sent', async ({ page, context }) => {
  await throughForwarder(page, context);
  const editor = await startWith(page, 'Base.');
  const input = editor.locator('.lesson-summary-input');
  const again = await closeWithServerUnreachable(page, context, async () => {
    await input.click();
    await input.press('End');
    await input.pressSequentially(' descartável');
  });
  const editor2 = await reopenDraft(again);
  const patches = patchCounter(again, /\/summary$/);
  await editor2.locator('.lesson-recovery [data-action="discard"]').click();
  await expect(editor2.locator('.lesson-recovery')).toBeHidden();
  await expect(editor2.locator('.lesson-summary-input')).toHaveValue('Base.');
  await again.waitForTimeout(3500);
  expect(patches.count).toBe(0);
  expect(await localCopy(again, editor2)).toBeNull();
});

test('a conflict (the lesson was changed somewhere else) is never overwritten and never retried blindly; the text stays and is offered again later', async ({ page }) => {
  const editor = await startWith(page, 'Base.');
  const input = editor.locator('.lesson-summary-input');
  const current = await serverDraft(page, editor);
  const id = await draftId(editor);
  await page.evaluate(async ({ base, draft, version }) => {
    const me = await (await fetch(`${base}/v1/auth/me`, { credentials: 'include' })).json();
    await fetch(`${base}/v1/drafts/${draft}/summary`, { method: 'PATCH', credentials: 'include', headers: { 'content-type': 'application/json', 'x-csrf-token': me.csrfToken }, body: JSON.stringify({ summary: 'Outro dispositivo.', expectedVersion: version }) });
  }, { base: API_BASE, draft: id, version: current.summaryVersion });
  const patches = patchCounter(page, /\/summary$/);
  await input.click();
  await input.press('End');
  await input.pressSequentially(' meu texto');
  await expect(summaryMessage(editor)).toContainText('alterada em outro lugar', { timeout: 7000 });
  await page.waitForTimeout(6000);
  expect(patches.count).toBe(1); // one attempt, no retry loop
  expect((await serverDraft(page, editor)).summary).toBe('Outro dispositivo.');
  await expect(input).toHaveValue('Base. meu texto');
  expect((await localCopy(page, editor)).summary.text).toBe('Base. meu texto');
});

test('a refusal by the server (a figure that is not yours) keeps the text and the copy, says why, and does not loop', async ({ page }) => {
  const editor = await startWith(page, 'Base.');
  const input = editor.locator('.lesson-summary-input');
  const patches = patchCounter(page, /\/summary$/);
  await input.click();
  await input.press('End');
  await input.pressSequentially(`\n\n[[fig:${FOREIGN_FIGURE}]]`);
  await expect(summaryMessage(editor)).toContainText('Não foi possível salvar sozinho', { timeout: 7000 });
  await page.waitForTimeout(4000);
  expect(patches.count).toBe(1);
  await expect(input).toHaveValue(`Base.\n\n[[fig:${FOREIGN_FIGURE}]]`);
  expect((await localCopy(page, editor)).summary.text).toContain(FOREIGN_FIGURE);
});

test('the visual editor autosaves through the same path, and an edit it cannot write is never sent', async ({ page }) => {
  const editor = await startWith(page, 'Um');
  await editor.locator('.summary-mode-btn[data-mode="visual"]').click();
  const surface = editor.locator('.summary-visual-content');
  const patches = patchCounter(page, /\/summary$/);
  await surface.locator('p', { hasText: 'Um' }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' dois');
  await expect.poll(async () => (await serverDraft(page, editor)).summary, { timeout: 8000 }).toBe('Um dois');
  expect(patches.count).toBe(1);
  await page.keyboard.press('Control+b');
  await page.keyboard.type('(a)'); // "Um dois**(a)**" cannot be written back faithfully
  await expect(editor.locator('.summary-visual-notice')).toBeVisible();
  await page.waitForTimeout(4000);
  expect(patches.count).toBe(1); // nothing was sent for the unwritable edit
  expect((await serverDraft(page, editor)).summary).toBe('Um dois');
});

test('a question saves itself too, keeps its review status (saving is not accepting), and the lesson stays a draft', async ({ page }) => {
  const editor = await startWith(page, 'Resumo.');
  await editor.getByRole('tab', { name: /Questões/ }).click();
  await editor.locator('.lesson-qitem').nth(1).click();
  const answer = editor.locator('.lesson-qeditor textarea').nth(1);
  const before = (await serverDraft(page, editor)).questions[1];
  const patches = patchCounter(page, /\/questions\//);
  await answer.click();
  await answer.press('End');
  await answer.pressSequentially(' complemento');
  await expect.poll(async () => (await serverDraft(page, editor)).questions[1].answer, { timeout: 8000 }).toBe(`${before.answer} complemento`);
  expect(patches.count).toBe(1);
  const after = await serverDraft(page, editor);
  expect(after.questions[1].status).toBe(before.status); // text saved, review status untouched
  expect(after.questions[1].status).not.toBe('ACCEPTED');
  expect(after.status).toBe('DRAFT'); // and nothing was accepted into study
  expect(after.questions[1].version).toBe(before.version + 1);
  await expect(questionIndicator(editor)).toHaveAttribute('data-state', 'saved');
  await expect(editor.locator('[data-action="save-question"]')).toBeDisabled();
  await expect(editor.locator('[data-action="accept-question"]')).toBeEnabled(); // accepting is still a separate, deliberate act
});

test('typing in a question while its autosave is in flight is kept, and a closed window recovers question edits', async ({ page, context }) => {
  await throughForwarder(page, context);
  const editor = await startWith(page, 'Resumo.');
  await editor.getByRole('tab', { name: /Questões/ }).click();
  await editor.locator('.lesson-qitem').nth(1).click();
  const answer = () => editor.locator('.lesson-qeditor textarea').nth(1);
  const base = (await serverDraft(page, editor)).questions[1].answer;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let held = false;
  await page.route(QUESTION_URL, async (route) => {
    if (route.request().method() === 'PATCH' && !held) { held = true; await gate; }
    await route.continue();
  });
  const patches = patchCounter(page, /\/questions\//);
  await answer().click();
  await answer().press('End');
  await answer().pressSequentially(' A');
  await expect.poll(() => patches.count, { timeout: 6000 }).toBe(1);
  await answer().pressSequentially('B'); // typed while the request is held
  release();
  await expect.poll(async () => (await serverDraft(page, editor)).questions[1].answer, { timeout: 9000 }).toBe(`${base} AB`);
  await expect(answer()).toHaveValue(`${base} AB`);
  expect(patches.maxActive).toBe(1);

  // now the network drops and the window is closed in the middle of an edit
  const again = await closeWithServerUnreachable(page, context, async () => {
    await answer().pressSequentially(' fim');
    const copy = await localCopy(page, editor);
    expect(Object.values(copy.questions)[0].fields.answer).toBe(`${base} AB fim`);
  });
  const editor2 = await reopenDraft(again);
  await expect(editor2.locator('.lesson-recovery')).toContainText('alterações não salvas');
  await editor2.locator('.lesson-recovery [data-action="recover"]').click();
  await editor2.getByRole('tab', { name: /Questões/ }).click();
  await editor2.locator('.lesson-qitem').nth(1).click();
  await expect(editor2.locator('.lesson-qeditor textarea').nth(1)).toHaveValue(`${base} AB fim`);
  await expect.poll(async () => (await serverDraft(again, editor2)).questions[1].answer, { timeout: 9000 }).toBe(`${base} AB fim`);
});

test('the save indicator tells the story calmly: waiting, saving, saved "agora", then the time; problems take their own state', async ({ page }) => {
  const editor = await startWith(page, 'Base.');
  const input = editor.locator('.lesson-summary-input');
  const indicator = summaryIndicator(editor);
  await expect(indicator).toHaveAttribute('data-state', 'saved'); // the deliberate save of the setup
  await page.evaluate(() => {
    const el = document.querySelector('[data-panel="summary"] .save-indicator');
    window.__saveStates = [];
    new MutationObserver(() => { const last = window.__saveStates.at(-1); const now = `${el.dataset.state}|${el.querySelector('.save-indicator-label').textContent}`; if (last !== now) window.__saveStates.push(now); }).observe(el, { attributes: true, childList: true, subtree: true, characterData: true });
  });
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  await page.route(SUMMARY_URL, async (route) => { await gate; await route.continue(); });
  await input.click();
  await input.press('End');
  await input.pressSequentially(' x');
  await expect(indicator).toHaveAttribute('data-state', 'pending');
  await expect(indicator).toContainText('Salva sozinho em instantes');
  await expect(indicator).toHaveAttribute('data-state', 'saving', { timeout: 5000 });
  await expect(indicator).toContainText('Salvando');
  release();
  await expect(indicator).toHaveAttribute('data-state', 'saved');
  await expect(indicator).toContainText('Salvo agora');
  await expect(indicator).toContainText(/Salvo às \d{2}:\d{2}/, { timeout: 7000 }); // and it settles on the time
  const states = (await page.evaluate(() => window.__saveStates)).map((entry) => entry.split('|')[0]);
  expect(states.join('>')).toMatch(/pending>saving>saved/);
  // the indicator is text first and decoration second: icons are hidden from assistive technology, and it adds no live region (the editor keeps one per area)
  expect(await indicator.locator('svg').first().getAttribute('aria-hidden')).toBe('true');
  await expect(indicator.locator('[role="status"], [aria-live]')).toHaveCount(0);
  await expect(indicator.locator('.save-indicator-label')).toContainText(/Salvo/); // the label is real text a screen reader finds when it looks
});

test('with reduced motion the saved check is still drawn (no animation hides it)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const editor = await startWith(page, 'Base.');
  await editor.locator('.lesson-summary-input').click();
  await editor.locator('.lesson-summary-input').press('End');
  await editor.locator('.lesson-summary-input').pressSequentially(' y');
  await expect(summaryIndicator(editor)).toHaveAttribute('data-state', 'saved', { timeout: 8000 });
  const offset = await summaryIndicator(editor).locator('svg path').evaluate((el) => getComputedStyle(el).strokeDashoffset);
  expect(parseFloat(offset)).toBe(0);
});

test('an accepted question whose text changes goes back to review: the server does it, the screen says so, and accepting again is a deliberate click', async ({ page }) => {
  const editor = await startWith(page, 'Resumo.');
  await editor.getByRole('tab', { name: /Questões/ }).click();
  await editor.locator('.lesson-qitem').nth(1).click();
  await editor.locator('[data-action="accept-question"]').click();
  await expect(editor.locator('.lesson-qeditor .lesson-message')).toContainText('Questão aceita');
  expect((await serverDraft(page, editor)).questions[1].status).toBe('ACCEPTED');
  await expect(editor.locator('[data-action="accept-question"]')).toBeDisabled(); // accepted: nothing left to accept

  const answer = editor.locator('.lesson-qeditor textarea').nth(1);
  await answer.click();
  await answer.press('End');
  await answer.pressSequentially(' ajustada depois de aceita');
  await expect.poll(async () => (await serverDraft(page, editor)).questions[1].status, { timeout: 8000 }).not.toBe('ACCEPTED');
  const changed = (await serverDraft(page, editor)).questions[1];
  expect(changed.answer).toContain('ajustada depois de aceita'); // the text was saved...
  await expect(editor.locator('.lesson-qeditor .lesson-message')).toContainText('voltou a "proposta"'); // ...the student is told what that did...
  await expect(editor.locator('[data-action="accept-question"]')).toBeEnabled(); // ...and can accept the new text on purpose
  await editor.locator('[data-action="accept-question"]').click();
  await expect.poll(async () => (await serverDraft(page, editor)).questions[1].status, { timeout: 5000 }).toBe('ACCEPTED');
  expect((await serverDraft(page, editor)).questions[1].answer).toContain('ajustada depois de aceita');
});
