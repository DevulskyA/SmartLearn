import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildFixturePdf } from '../server/test/pdf-fixtures/build-fixture-pdf.js';
import { VITE_ORIGIN, serverPort } from './support/ports.js';
import { signInRegistered } from './support/session.js';

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
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${API_BASE}/health/ready`)).status === 200) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('draft-acceptance E2E: real server did not become ready in time');
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
  const email = `draft-accept-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const password = 'a genuinely long test password 1';
  await signInRegistered(page, { email: email, password: password });
});

// The draft is edited in the LESSON EDITOR (src/lesson-editor-ui.js): Resumo / Questões / Fonte / Revisão. See e2e/lesson-editor.spec.js
// for the structure itself; these tests prove the acceptance pipeline end to end through it.
async function openFirstDraft(page, name, pages) {
  await page.locator('[data-screen="materials"]').click();
  await expect(page.locator('#sources-card')).toBeVisible({ timeout: 5000 });
  await page.setInputFiles('#sources-file-input', { name, mimeType: 'application/pdf', buffer: buildFixturePdf(pages) });
  await expect(page.locator('#sources-message')).toContainText('trecho(s) proposto(s)', { timeout: 10000 });
  await page.locator('.source-proposal-item').first().locator('[data-action="generate-draft"]').click();
  await expect(page.locator('.lesson-editor')).toBeVisible({ timeout: 10000 });
  return page.locator('.lesson-editor');
}

test('generating and accepting a draft through the real UI creates a real unit with reviews and exercises, and a repeated accept does not duplicate it', async ({ page }) => {
  const editor = await openFirstDraft(page, 'farmaco.pdf', ['Farmacocinética: absorção e distribuição']);
  await expect(page.locator('#sources-message')).toContainText('Rascunho gerado');
  await expect(editor).toContainText('não verificado');

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
  expect(unitsAfter.units.length).toBe(1);
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
  await expect(page.locator('#sources-message')).toContainText('trecho(s) proposto(s)', { timeout: 10000 });
  // renderSourceProposals replaces the list wholesale per upload (it shows this source's own proposals, not an accumulating
  // history) — the only item visible now is this second material's own proposal.
  await page.locator('.source-proposal-item').first().locator('[data-action="generate-draft"]').click();
  const second = page.locator('.lesson-editor');
  await expect(second).toBeVisible({ timeout: 10000 });

  // Drives the real accessible combobox UI, not the backing native <select> directly — select-ui.js marks that native element
  // aria-hidden (exactly one control per choice is exposed to assistive tech), so a real user/screen-reader path is what this
  // test must exercise, not Playwright's .selectOption() shortcut.
  const subjectSelect = second.locator('.source-draft-subject-select');
  await expect(subjectSelect.locator('option', { hasText: 'Fisiologia A' })).toHaveCount(1);
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
  expect(subjectsAfter.subjects.length).toBe(1);
  expect(subjectsAfter.subjects[0].name).toBe('Fisiologia A');

  const unitsAfter = await page.evaluate(async (base) => {
    const res = await fetch(`${base}/v1/learning-units`, { credentials: 'include' });
    return res.json();
  }, API_BASE);
  expect(unitsAfter.units.length).toBe(2);
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

  await expect(editor.locator('[data-panel="summary"] .lesson-message')).toContainText('Resumo salvo', { timeout: 10000 });
  await expect(editor.locator('.lesson-summary-input')).toHaveValue(fixed);
  await expect(editor.locator('[role="tab"]', { hasText: 'Revisão' })).not.toContainText('⚠', { timeout: 5000 });
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
  await expect(editor.locator('.lesson-qeditor .lesson-message')).toHaveClass(/is-error/, { timeout: 10000 });
  await expect(editor.locator('.lesson-qeditor .lesson-message')).not.toHaveText('');
  expect(await editor.getAttribute('data-revision')).toBe(revisionBefore);
});
