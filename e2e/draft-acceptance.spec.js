import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildFixturePdf } from '../server/test/pdf-fixtures/build-fixture-pdf.js';
import { VITE_ORIGIN, serverPort } from './support/ports.js';
import { waitForServerReady } from './support/wait-for-server.js';
import { signInRegistered } from './support/session.js';
import { startEditingSummary } from './support/summary-editing.js';

import { generateByPages } from './support/materials-flow.js';
// T38: proves the real draft-review UI (src/draft-review-ui.js, wired into
// the same "Fontes" card as T36) drives the full T34-T38 pipeline end to
// end — upload -> extract -> chunk -> generate a draft (fake provider,
// no credentials configured) -> inspect -> accept -> a REAL usable unit
// with reviews and exercises exists afterward, and a second click on the
// same accepted draft does not create anything twice.

const SERVER_PORT = serverPort(13965);
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));

let serverProcess;
let dataDir;

test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'sl-e2e-draft-accept-'));
  const dbPath = join(dataDir, 'e2e.db');
  const sourcesDir = join(dataDir, 'sources');
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: {
      ...process.env,
      SMARTLEARN_DB_PATH: dbPath,
      SMARTLEARN_SOURCES_DIR: sourcesDir,
      PORT: String(SERVER_PORT),
      HOST: 'localhost',
      NODE_ENV: 'test',
      SMARTLEARN_ALLOWED_ORIGINS: VITE_ORIGIN,
    },
    stdio: 'ignore',
  });
  await waitForServerReady(API_BASE, { label: 'draft-acceptance E2E' });
});

test.afterAll(async () => {
  serverProcess?.kill();
  await new Promise((r) => setTimeout(r, 300));
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test.beforeEach(async ({ page }) => {
  // PV1-01: Materiais (this same "Fontes" pipeline) is now exclusive to
  // LOCAL_DESKTOP_AUTHORITY, relocated out of Configurações — see
  // e2e/local-authority.spec.js for the origin of this init-script pattern.
  await page.addInitScript((base) => {
    window.__SMARTLEARN_API_BASE__ = base;
    window.__SMARTLEARN_REMOTE_MODE__ = true;
    window.__SMARTLEARN_LOCAL_AUTHORITY__ = true;
  }, API_BASE);
  const email = `draft-accept-${Date.now()}-${randomUUID()}@example.com`;
  const password = 'a genuinely long test password 1';
  await signInRegistered(page, { email: email, password: password });
});

// The draft is edited in the LESSON EDITOR (src/lesson-editor-ui.js): Resumo / Questões / Fonte / Revisão. See e2e/lesson-editor.spec.js
// for the structure itself; these tests prove the acceptance pipeline end to end through it.
async function openFirstDraft(page, name, pages) {
  await page.locator('[data-screen="materials"]').click();
  await expect(page.locator('#sources-card')).toBeVisible({ timeout: 5000 });
  await page.setInputFiles('#sources-file-input', { name, mimeType: 'application/pdf', buffer: buildFixturePdf(pages) });
  await expect(page.locator('#sources-message')).toContainText(/trechos? propostos?/, { timeout: 10000 });
  await generateByPages(page);
  await expect(page.locator('.lesson-editor')).toBeVisible({ timeout: 10000 });
  await startEditingSummary(page);
  return page.locator('.lesson-editor');
}

test('generating and accepting a draft through the real UI creates a real unit with reviews and exercises, and a repeated accept does not duplicate it', async ({ page }) => {
  const editor = await openFirstDraft(page, 'farmaco.pdf', ['Farmacocinética: absorção e distribuição']);
  await expect(page.locator('#sources-message')).toContainText('Resumo gerado');
  await expect(editor.locator('.lesson-head .eyebrow')).toHaveText('Resumo gerado por IA — aguardando sua conferência');

  // The drafted answer is attributable to the exact real source text.
  await editor.getByRole('tab', { name: /Questões/ }).click();
  await expect(editor.locator('.lesson-qitem')).toHaveCount(1);
  await expect(editor.locator('.lesson-qeditor textarea').nth(1)).toHaveValue(/Farmacocinética/);

  // CQ-2: the reviewer can verify. The automatic check is a screen (never "verified"), and the question shows the source page
  // it came from, with the page text one click away.
  await editor.getByRole('tab', { name: /Revisão/ }).click();
  await expect(editor.locator('[data-panel="review"]')).toContainText(/conferência automática/i);
  // the fake provider gives a bare snippet as the answer and no explanation: the screen says so instead of staying silent
  await editor.locator('[data-panel="review"] summary', { hasText: 'Questão 1' }).click();
  await expect(editor.locator('[data-panel="review"]')).toContainText('Falta explicar por quê');
  await editor.getByRole('tab', { name: /Fonte/ }).click();
  await expect(editor.locator('[data-panel="source"]')).toContainText('farmaco.pdf');
  await editor.getByRole('tab', { name: /Questões/ }).click();
  const questionOrigin = editor.locator('.lesson-qeditor .summary-source', { hasText: 'Fonte desta questão' });
  await expect(questionOrigin).toContainText('página 1');
  await questionOrigin.locator('summary').click();
  await expect(questionOrigin.locator('.study-now-source-text')).toContainText('Farmacocinética: absorção e distribuição');

  await editor.locator('.source-draft-subject-input').fill('Farmacologia E2E');
  await editor.locator('.source-draft-date-input').fill('2026-04-01');
  await editor.locator('[data-action="accept-draft"]').click();

  await expect(editor.locator('.source-draft-result')).toContainText('Aula criada', { timeout: 10000 });
  await expect(editor.locator('.source-draft-result')).not.toHaveClass(/is-error/);
  // the header says what is true now: after the student accepts it is no longer an unchecked draft
  await expect(editor.locator('.lesson-head .eyebrow')).toHaveText('Aula aceita e adicionada aos seus estudos.');
  await expect(editor).not.toContainText('aguardando sua conferência');

  // The unit is real: it shows up on Plano.
  await page.locator('[data-screen="plan"]').click();
  await expect(page.locator('#screen-plan .plan-row-compact .subject-chip', { hasText: 'Farmacologia E2E' })).toBeVisible({ timeout: 5000 });

  // CQ-2: the accepted unit keeps its summary provenance, frozen, visible where the student reads the summary.
  const planRow = page.locator('.plan-row', { hasText: 'Farmacologia E2E' });
  await planRow.locator('.plan-expand-btn').click();
  const planOrigin = planRow.locator('.summary-source');
  await expect(planOrigin).toContainText('Origem do resumo · farmaco.pdf, página 1', { timeout: 5000 });
  await planOrigin.locator('summary').click();
  await expect(planOrigin.locator('.study-now-source-text')).toContainText('Farmacocinética: absorção e distribuição');

  const draftId = await editor.getAttribute('data-draft-id');
  const firstAcceptance = await page.evaluate(async ({ base, id }) => {
    const res = await fetch(`${base}/v1/drafts/${id}`, { credentials: 'include' });
    return res.json();
  }, { base: API_BASE, id: draftId });
  expect(firstAcceptance.draft.status).toBe('ACCEPTED');

  // Repeated acceptance (same draft, real HTTP) must not create a second unit.
  const secondAcceptRes = await page.evaluate(async ({ base, id, revision }) => {
    const meRes = await fetch(`${base}/v1/auth/me`, { credentials: 'include' });
    const me = await meRes.json();
    const res = await fetch(`${base}/v1/drafts/${id}/accept`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json', 'x-csrf-token': me.csrfToken },
      body: JSON.stringify({ newSubjectName: 'Outra disciplina', studyDate: '2099-01-01', expectedRevision: revision }),
    });
    return res.json();
  }, { base: API_BASE, id: draftId, revision: firstAcceptance.draft.revision });
  expect(secondAcceptRes.acceptance.acceptedAt).toBe(firstAcceptance.draft.acceptedAt);

  const unitsAfter = await page.evaluate(async (base) => {
    const res = await fetch(`${base}/v1/learning-units`, { credentials: 'include' });
    return res.json();
  }, API_BASE);
  expect(unitsAfter.units).toHaveLength(1);
});

test('P1_PRODUCT A: accepting a second draft can reuse an existing subject instead of only creating a new one', async ({ page }) => {
  // First material creates "Fisiologia A".
  const first = await openFirstDraft(page, 'materia-a.pdf', ['Conteudo da primeira materia']);
  await first.locator('.source-draft-subject-input').fill('Fisiologia A');
  await first.locator('[data-action="accept-draft"]').click();
  await expect(first.locator('.source-draft-result')).toContainText('Aula criada', { timeout: 10000 });
  await first.locator('[data-action="lesson-back"]').click();

  // Second material: the accept form must offer "Fisiologia A" as an
  // existing option, and picking it must NOT create a second subject.
  await page.setInputFiles('#sources-file-input', {
    name: 'materia-b.pdf', mimeType: 'application/pdf',
    buffer: buildFixturePdf(['Conteudo da segunda materia']),
  });
  await expect(page.locator('#sources-message')).toContainText(/trechos? propostos?/, { timeout: 10000 });
  // renderSourceProposals replaces the list wholesale per upload (it shows this source's own proposals, not an accumulating
  // history) — the only item visible now is this second material's own proposal.
  await generateByPages(page);
  const second = page.locator('.lesson-editor');
  await expect(second).toBeVisible({ timeout: 10000 });

  // Drives the real accessible combobox UI, not the backing native <select> directly — select-ui.js marks that native element
  // aria-hidden (exactly one control per choice is exposed to assistive tech), so a real user/screen-reader path is what this
  // test must exercise, not Playwright's .selectOption() shortcut.
  const subjectSelect = second.locator('.source-draft-subject-select');
  await expect(subjectSelect.locator('option', { hasText: 'Fisiologia A' })).toHaveCount(1);
  // GUARD: with disciplines registered, NOTHING is pre-selected (a lesson on physiology was once offered under "Anatomia", the first of
  // the list). Accepting without choosing is refused with a message and creates neither a lesson nor a discipline.
  await expect(subjectSelect).toHaveValue('choose');
  await second.locator('[data-action="accept-draft"]').click();
  await expect(second.locator('.source-draft-result')).toContainText('Escolha a disciplina');
  const unitsBeforeChoice = await page.evaluate(async (base) => (await fetch(`${base}/v1/learning-units`, { credentials: 'include' })).json(), API_BASE);
  expect(unitsBeforeChoice.units).toHaveLength(1);
  const subjectTrigger = subjectSelect.locator('xpath=..').locator('.ui-select-trigger');
  await subjectTrigger.click();
  const subjectMenuId = await subjectTrigger.getAttribute('aria-controls');
  const subjectMenu = page.locator(`#${subjectMenuId}`);
  await subjectMenu.locator('li[role="option"]', { hasText: 'Fisiologia A' }).click();
  await expect(subjectTrigger).toHaveText('Fisiologia A');

  // Picking an existing subject must disable (and not require) the free-text new-subject field.
  await expect(second.locator('.source-draft-subject-input')).toBeDisabled();

  await second.locator('[data-action="accept-draft"]').click();
  await expect(second.locator('.source-draft-result')).toContainText('Aula criada', { timeout: 10000 });
  await expect(second.locator('.source-draft-result')).not.toHaveClass(/is-error/);

  const subjectsAfter = await page.evaluate(async (base) => {
    const res = await fetch(`${base}/v1/subjects`, { credentials: 'include' });
    return res.json();
  }, API_BASE);
  expect(subjectsAfter.subjects).toHaveLength(1);
  expect(subjectsAfter.subjects[0].name).toBe('Fisiologia A');

  const unitsAfter = await page.evaluate(async (base) => {
    const res = await fetch(`${base}/v1/learning-units`, { credentials: 'include' });
    return res.json();
  }, API_BASE);
  expect(unitsAfter.units).toHaveLength(2);
  expect(unitsAfter.units.every((u) => u.subjectId === subjectsAfter.subjects[0].id)).toBe(true);
});

// CQ-2: a draft that drops the central concept is FLAGGED where the reviewer decides. The fake provider's summary is the
// first 150 characters of the page, so a page that opens with filler and only later reaches the concept exposes exactly that.
const FILLER = 'Introducao geral da disciplina e das suas aulas, com informacoes administrativas sobre horarios, salas, avaliacoes e bibliografia recomendada para o semestre letivo inteiro. ';
const CORE = 'A insuficiencia cardiaca reduz o debito cardiaco. A insuficiencia cardiaca ativa o sistema renina angiotensina. O debito cardiaco baixo eleva a pressao venosa.';

test('a summary that misses the central concept of the page is flagged in the review, with the source terms it dropped, and acceptance stays a human decision', async ({ page }) => {
  const editor = await openFirstDraft(page, 'ic.pdf', [FILLER + CORE]);
  // the review tab announces the pending points and groups them per entity: the summary is one of them
  await expect(editor.locator('[role="tab"]', { hasText: 'Revisão' })).toContainText('⚠');
  await editor.getByRole('tab', { name: /Revisão/ }).click();
  const review = editor.locator('[data-panel="review"]');
  await review.locator('summary', { hasText: 'Resumo' }).click();
  await expect(review.locator('.lesson-finding-issue').first()).toContainText('Pode omitir um conceito central');
  await expect(review.locator('.lesson-finding-evidence').first()).toContainText(/insuficiencia/i);
  // a flag informs, it does not block: the accept action is still there and is the human's call
  await expect(editor.locator('[data-action="accept-draft"]')).toBeEnabled();
});

// CQ-6: a flagged draft can be FIXED by the reviewer in place — the screen is re-run on the saved text, and what is
// accepted is exactly what was saved (revision-checked), not the original flawed draft.
test('the reviewer corrects a flagged summary in the review, the screen re-runs clean, and the unit gets the corrected text', async ({ page }) => {
  const editor = await openFirstDraft(page, 'ic2.pdf', [FILLER + CORE]);
  await expect(editor.locator('[role="tab"]', { hasText: 'Revisão' })).toContainText('⚠');
  const revisionBefore = Number(await editor.getAttribute('data-revision'));

  // fill the accept form FIRST: it must survive the save
  await editor.locator('.source-draft-subject-input').fill('Cardiologia CQ6');
  await editor.locator('.source-draft-date-input').fill('2026-05-01');

  const fixed = 'A insuficiência cardíaca reduz o débito cardíaco e ativa o sistema renina angiotensina; o débito cardíaco baixo eleva a pressão venosa.';
  await editor.locator('.lesson-summary-input').fill(fixed);
  // mobile: the open editor fits a 375px screen (no horizontal page scroll) and its controls are touch-sized
  await page.setViewportSize({ width: 375, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect((await editor.locator('[data-action="save-summary"]').boundingBox()).height).toBeGreaterThanOrEqual(40);
  await page.setViewportSize({ width: 1280, height: 720 });
  await editor.locator('[data-action="save-summary"]').click();

  await expect(editor.locator('[data-panel="summary"] .lesson-message').filter({ hasText: 'Resumo salvo' })).toBeVisible({ timeout: 10000 });
  await expect(editor.locator('.lesson-summary-input')).toHaveValue(fixed);
  // the summary's flag is gone; the ONE point left is the fake provider's question having no "Por quê" (F-15 / T-F3-05: a finding for
  // every question without an explanation, shown in the review, never blocking), which a summary correction cannot clear
  await expect(editor.locator('[role="tab"]', { hasText: 'Revisão' })).toContainText('⚠ 1', { timeout: 5000 });
  await editor.getByRole('tab', { name: /Revisão/ }).click();
  await expect(editor.locator('[data-panel="review"] .lesson-findings-list li')).toHaveCount(1);
  await expect(editor.locator('[data-panel="review"] .lesson-finding-issue')).toHaveText('Falta explicar por quê');
  await expect(editor.locator('[data-panel="review"] summary', { hasText: 'Resumo' })).toHaveCount(0);
  await editor.getByRole('tab', { name: /Resumo/ }).click();
  expect(Number(await editor.getAttribute('data-revision'))).toBe(revisionBefore + 1);
  await expect(editor.locator('.source-draft-subject-input')).toHaveValue('Cardiologia CQ6');
  await expect(editor.locator('.source-draft-date-input')).toHaveValue('2026-05-01');

  await editor.locator('[data-action="accept-draft"]').click();
  await expect(editor.locator('.source-draft-result')).toContainText('Aula criada', { timeout: 10000 });

  const unit = await page.evaluate(async (base) => (await (await fetch(`${base}/v1/learning-units`, { credentials: 'include' })).json()).units[0], API_BASE);
  expect(unit.summaryBody).toBe(fixed);

  // once accepted the draft is history: the server refuses edits
  const refused = await page.evaluate(async ({ base, id }) => {
    const me = await (await fetch(`${base}/v1/auth/me`, { credentials: 'include' })).json();
    const res = await fetch(`${base}/v1/drafts/${id}/summary`, { method: 'PATCH', credentials: 'include', headers: { 'content-type': 'application/json', 'x-csrf-token': me.csrfToken }, body: JSON.stringify({ summary: 'tarde demais' }) });
    return res.status;
  }, { base: API_BASE, id: await editor.getAttribute('data-draft-id') });
  expect(refused).toBe(409);
});

test('a correction the server rejects (empty answer) is reported in place and the draft is left as it was', async ({ page }) => {
  const editor = await openFirstDraft(page, 'v.pdf', ['Farmacocinética: absorção e distribuição']);
  const revisionBefore = await editor.getAttribute('data-revision');

  await editor.getByRole('tab', { name: /Questões/ }).click();
  await editor.locator('.lesson-qeditor textarea').nth(1).fill('');
  await editor.locator('[data-action="save-question"]').click();
  await expect(editor.locator('.lesson-qeditor .lesson-message:not([tabindex])')).toHaveClass(/is-error/, { timeout: 10000 });
  await expect(editor.locator('.lesson-qeditor .lesson-message:not([tabindex])')).not.toHaveText('');
  expect(await editor.getAttribute('data-revision')).toBe(revisionBefore);
});

test('PBC-1.1: on a phone the "Aceitar a aula" buttons each take the full row, and on a desktop they stay side by side', async ({ page }) => {
  const editor = await openFirstDraft(page, 'celular.pdf', ['Farmacocinética: absorção e distribuição']);
  const widths = async () => editor.locator('.lesson-accept-actions').evaluate((row) => {
    const rowWidth = row.getBoundingClientRect().width;
    return { rowWidth, buttons: [...row.querySelectorAll(':scope > button')].filter((b) => b.offsetParent !== null).map((b) => b.getBoundingClientRect().width) };
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  const desktop = await widths();
  expect(desktop.buttons.length).toBeGreaterThan(1);
  expect(Math.max(...desktop.buttons)).toBeLessThan(desktop.rowWidth * 0.8);
  await page.setViewportSize({ width: 390, height: 844 });
  const phone = await widths();
  for (const w of phone.buttons) expect(w).toBeGreaterThan(phone.rowWidth * 0.95);
});

test('FIDELIDADE-1: the no-AI check opens in the review tab with the real answer, and says "not compared" when source and summary differ in language', async ({ page }) => {
  const editor = await openFirstDraft(page, 'fidelidade.pdf', ['Farmacocinética: absorção e distribuição']);
  await editor.getByRole('tab', { name: /Revisão/ }).click();
  const block = editor.locator('.lesson-fidelity');
  await block.locator('summary').click();
  // real server answer for a same-language draft: either "nothing found" or a list, never silent and never the language notice
  await expect(block.locator('[role="status"]')).toContainText(/Nada encontrado|Encontrei/, { timeout: 10000 });
  await expect(block).not.toContainText('idiomas diferentes');

  await page.route('**/v1/drafts/*/fidelity', (route) => route.fulfill({ json: { fidelity: { checked: 0, lost: [], skipped: 'LANGUAGE_MISMATCH' } } }));
  await block.locator('summary').click(); // close
  await block.locator('summary').click(); // open again: asks the server again
  await expect(block.locator('[role="status"]')).toContainText('idiomas diferentes', { timeout: 10000 });
  await expect(block.locator('[role="status"]')).not.toContainText('Nada encontrado');
});

test('ERROS-1: when the subjects list cannot be loaded the editor says so and still lets the student type a subject name', async ({ page }) => {
  await page.route('**/v1/subjects**', (route) => route.abort());
  const editor = await openFirstDraft(page, 'sem-disciplinas.pdf', ['Farmacocinética: absorção e distribuição']);
  await expect(editor.getByText(/Não foi possível carregar suas disciplinas/)).toBeVisible({ timeout: 10000 });
  await expect(editor.locator('.source-draft-subject-input')).toBeVisible();
});

// R-5: the header is the REAL state of the draft, never a fixed text and never the automatic check. The first answer for the draft is
// altered to report one critical item waiting (the fake provider cannot produce a HIGH finding); every answer after that is the real
// server's, so the move to "waiting for you" and then to "accepted" is the product's own.
test('R-5: the header follows the real state - critical item pending, then waiting for the student, then accepted', async ({ page }) => {
  let injected = false;
  await page.route(/\/v1\/drafts\/\d+$/, async (route) => {
    if (route.request().method() !== 'GET' || injected) return route.fallback();
    injected = true;
    const response = await route.fetch();
    const body = await response.json();
    body.draft.acceptanceBlockers = { questions: [body.draft.questions[0].id], summary: 0 };
    return route.fulfill({ response, json: body });
  });
  const editor = await openFirstDraft(page, 'estado-r5.pdf', ['Farmacocinética: absorção e distribuição']);
  const header = editor.locator('.lesson-head .eyebrow');
  await expect(header).toHaveText('Resumo gerado por IA — conferência pendente: 1 item crítico');

  await editor.getByRole('tab', { name: /Questões/ }).click();
  await editor.locator('[data-action="accept-question"]').click();
  await expect(header).toHaveText('Resumo gerado por IA — aguardando sua conferência');

  await editor.locator('.source-draft-subject-input').fill('Estado R5');
  await editor.locator('.source-draft-date-input').fill('2026-04-01');
  await editor.locator('[data-action="accept-draft"]').click();
  await expect(editor.locator('.source-draft-result')).toContainText('Aula criada', { timeout: 10000 });
  await expect(header).toHaveText('Aula aceita e adicionada aos seus estudos.');
});

// R-4: after accepting, the Resumo of the new lesson is one click away - from the editor and, later, from the trecho in Materiais.
// Before, the trecho only said "Aula criada" and the student had to look for the lesson in Plano.
test('R-4: after accepting, "Abrir Resumo" opens the new lesson in Plano - from the editor and from the trecho', async ({ page }) => {
  const editor = await openFirstDraft(page, 'atalho-resumo.pdf', ['Farmacocinética: absorção e distribuição']);
  await editor.locator('.source-draft-subject-input').fill('Atalho Resumo');
  await editor.locator('.source-draft-date-input').fill('2026-04-01');
  await expect(editor.locator('[data-action="open-summary"]')).toHaveCount(0); // nothing to open before the lesson exists
  const [accepted] = await Promise.all([
    page.waitForResponse((r) => /\/v1\/drafts\/\d+\/accept$/.test(r.url()) && r.request().method() === 'POST'),
    editor.locator('[data-action="accept-draft"]').click(),
  ]);
  const newUnitId = (await accepted.json()).acceptance.unit.id; // the lesson that was JUST created
  await expect(editor.locator('.source-draft-result')).toContainText('Aula criada', { timeout: 10000 });

  await editor.locator('[data-action="open-summary"]').click();
  await expect(page.locator('#screen-plan')).toBeVisible();
  // exactly that lesson is open, and no other
  await expect(page.locator('#screen-plan .plan-row[data-unit-id="' + newUnitId + '"] .plan-row-detail')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#screen-plan .plan-row-detail:visible')).toHaveCount(1);
  const row = page.locator('#screen-plan .plan-row', { hasText: 'Atalho Resumo' });
  await expect(row.locator('.plan-row-detail')).toBeVisible({ timeout: 5000 });
  await expect(row.locator('.plan-summary-section')).toBeVisible();

  // later, from Materiais: the trecho that became a lesson links to it instead of ending at "Aula criada"
  await page.locator('[data-screen="materials"]').click();
  // Materiais still has the accepted lesson's editor open; leaving it reloads the list, which now tells the truth
  await page.locator('[data-action="lesson-back"]').click();
  const link = page.locator('#sources-drafts-list .source-draft-item [data-action="open-summary"]').first();
  await expect(link).toBeVisible({ timeout: 10000 });
  await link.click();
  await expect(page.locator('#screen-plan')).toBeVisible();
  await expect(page.locator('#screen-plan .plan-row', { hasText: 'Atalho Resumo' }).locator('.plan-row-detail')).toBeVisible({ timeout: 5000 });
});

// R-4: the accept footer offers the same colour choice as every other door to a new discipline, and the lesson's new discipline gets it.
test('R-4: a new discipline created while accepting a draft gets the colour chosen in the footer', async ({ page }) => {
  const editor = await openFirstDraft(page, 'cor-aceite.pdf', ['Farmacocinética: absorção e distribuição']);
  const swatches = editor.locator('form.subject-create-form .color-swatch');
  expect(await swatches.count()).toBeGreaterThan(1);
  // A-20: colour names are Portuguese words, and the footer buttons do not touch each other
  const names = await swatches.evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')));
  expect(names[0]).toBe('Azul');
  for (const name of names) expect(name).toMatch(/^[A-ZÀ-Ý]/);
  const previewBox = await editor.locator('[data-action="preview-accept"]').boundingBox();
  const acceptBox = await editor.locator('[data-action="accept-draft"]').boundingBox();
  // The two buttons may sit stacked or side by side (design d978391 put them on one row): what must hold is a real gap on at least one axis.
  const gapOnY = Math.max(acceptBox.y - (previewBox.y + previewBox.height), previewBox.y - (acceptBox.y + acceptBox.height));
  const gapOnX = Math.max(acceptBox.x - (previewBox.x + previewBox.width), previewBox.x - (acceptBox.x + acceptBox.width));
  expect(Math.max(gapOnY, gapOnX)).toBeGreaterThanOrEqual(8);
  await swatches.nth(3).click();
  const chosen = await swatches.nth(3).evaluate((el) => el.style.getPropertyValue('--swatch-color'));
  await editor.locator('.source-draft-subject-input').fill('Cor Aceite');
  await editor.locator('.source-draft-date-input').fill('2026-04-01');
  await editor.locator('[data-action="accept-draft"]').click();
  await expect(editor.locator('.source-draft-result')).toContainText('Aula criada', { timeout: 10000 });

  await page.locator('[data-screen="plan"]').click();
  await page.locator('#plan-manage-subjects-btn').click();
  const card = page.locator('.subject-catalog-card', { hasText: 'Cor Aceite' });
  await expect(card).toBeVisible({ timeout: 5000 });
  expect(await card.evaluate((el) => el.style.getPropertyValue('--subject-color'))).toBe(chosen);
});

test('TRANSLATE: the summary area offers the other languages; confirming makes a NEW version in that language and the student chooses which to keep', async ({ page }) => {
  const editor = await openFirstDraft(page, 'traducao.pdf', ['Fisiologia renal: filtração glomerular']);
  // the current language (pt-BR) is not offered as a target
  const select = editor.locator('.lesson-translate-select');
  await expect(select.locator('option')).toHaveText(['Inglês', 'Espanhol']);
  const firstDraftId = await page.evaluate(async (base) => {
    const proposals = await (await fetch(`${base}/v1/sources`, { credentials: 'include' })).json();
    return proposals.sources.length;
  }, API_BASE);
  expect(firstDraftId).toBe(1);

  await editor.locator('[data-action="translate-draft"]').click();
  await expect(page.locator('#confirm-dialog')).toBeHidden(); // no cost question: starting a translation is the click itself

  // the job runs on the server; when it ends the new version opens with the choice banner
  const translated = page.locator('.lesson-editor');
  await expect(translated.locator('.lesson-decision')).toBeVisible({ timeout: 10000 });
  await expect(translated.locator('[data-action="keep-new-version"]')).toBeVisible();
  await expect(translated.locator('[data-action="restore-previous-version"]')).toBeVisible();
  await translated.locator('[data-action="keep-new-version"]').click();
  await expect(translated.locator('.lesson-decision')).toBeHidden();
});

test('REGENERATE: a draft can be generated again (same language, current prompt); the new version waits beside the old one until the student chooses', async ({ page }) => {
  const editor = await openFirstDraft(page, 'regerar.pdf', ['Fisiologia renal: filtração glomerular']);
  await expect(editor.locator('.lesson-decision')).toBeHidden();
  await editor.locator('[data-action="regenerate-draft"]').click();
  await expect(page.locator('#confirm-dialog')).toBeHidden(); // no cost question, like the translation
  const regenerated = page.locator('.lesson-editor');
  await expect(regenerated.locator('.lesson-decision')).toBeVisible({ timeout: 10000 });
  // going back keeps the first version; the choice is the student's
  await regenerated.locator('[data-action="restore-previous-version"]').click();
  await expect(page.locator('.lesson-editor [data-action="regenerate-draft"]')).toBeVisible({ timeout: 10000 });
});
