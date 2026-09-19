import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildFixturePdf } from '../server/test/pdf-fixtures/build-fixture-pdf.js';

// T38: proves the real draft-review UI (src/draft-review-ui.js, wired into
// the same "Fontes" card as T36) drives the full T34-T38 pipeline end to
// end — upload -> extract -> chunk -> generate a draft (fake provider,
// no credentials configured) -> inspect -> accept -> a REAL usable unit
// with reviews and exercises exists afterward, and a second click on the
// same accepted draft does not create anything twice.

const SERVER_PORT = 13965;
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
      SMARTLEARN_ALLOWED_ORIGINS: 'http://localhost:5199',
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
});

test('generating and accepting a draft through the real UI creates a real unit with reviews and exercises, and a repeated accept does not duplicate it', async ({ page }) => {
  await page.locator('[data-screen="materials"]').click();
  await expect(page.locator('#sources-card')).toBeVisible({ timeout: 5000 });

  const pdfBuffer = buildFixturePdf(['Farmacocinética: absorção e distribuição']);
  await page.setInputFiles('#sources-file-input', { name: 'farmaco.pdf', mimeType: 'application/pdf', buffer: pdfBuffer });
  await expect(page.locator('#sources-message')).toContainText('trecho(s) proposto(s)', { timeout: 10000 });

  const item = page.locator('.source-proposal-item').first();
  await item.locator('[data-action="generate-draft"]').click();
  await expect(page.locator('#sources-message')).toContainText('Rascunho gerado', { timeout: 10000 });

  const draftPanel = item.locator('.source-draft-panel');
  await expect(draftPanel).toBeVisible();
  await expect(draftPanel.locator('.source-draft-caveat')).toContainText('não verificado');
  await expect(draftPanel.locator('.source-draft-question')).toHaveCount(1);
  // The drafted answer is attributable to the exact real source text.
  await expect(draftPanel.locator('.source-draft-answer')).toContainText('Farmacocinética');

  // CQ-2: the reviewer can verify. The automatic check is a screen (never "verified"), and the summary and
  // every question show the source page they came from, with the page text one click away.
  await expect(draftPanel.locator('.source-draft-audit')).toContainText('Conferência automática');
  // the fake provider gives a bare snippet as the answer and no explanation: the screen says so instead of staying silent
  await expect(draftPanel.locator('.source-draft-audit')).toContainText('Falta explicar por quê');
  const summaryOrigin = draftPanel.locator('.summary-source', { hasText: 'Fonte do resumo' });
  await expect(summaryOrigin).toContainText('página 1');
  await summaryOrigin.locator('summary').click();
  await expect(summaryOrigin.locator('.study-now-source-text')).toContainText('Farmacocinética: absorção e distribuição');
  await expect(draftPanel.locator('.summary-source', { hasText: 'Fonte da questão' })).toContainText('página 1');

  await draftPanel.locator('.source-draft-subject-input').fill('Farmacologia E2E');
  await draftPanel.locator('.source-draft-date-input').fill('2026-04-01');
  await draftPanel.locator('[data-action="accept-draft"]').click();

  await expect(draftPanel.locator('.source-draft-result')).toContainText('Aula criada', { timeout: 10000 });
  await expect(draftPanel.locator('.source-draft-result')).not.toHaveClass(/is-error/);

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

  const draftId = await draftPanel.getAttribute('data-draft-id');
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
  await page.locator('[data-screen="materials"]').click();
  await expect(page.locator('#sources-card')).toBeVisible({ timeout: 5000 });
  await page.setInputFiles('#sources-file-input', {
    name: 'materia-a.pdf', mimeType: 'application/pdf',
    buffer: buildFixturePdf(['Conteudo da primeira materia']),
  });
  await expect(page.locator('#sources-message')).toContainText('trecho(s) proposto(s)', { timeout: 10000 });
  const firstItem = page.locator('.source-proposal-item').first();
  await firstItem.locator('[data-action="generate-draft"]').click();
  const firstPanel = firstItem.locator('.source-draft-panel');
  await expect(firstPanel).toBeVisible();
  await firstPanel.locator('.source-draft-subject-input').fill('Fisiologia A');
  await firstPanel.locator('[data-action="accept-draft"]').click();
  await expect(firstPanel.locator('.source-draft-result')).toContainText('Aula criada', { timeout: 10000 });

  // Second material: the accept form must offer "Fisiologia A" as an
  // existing option, and picking it must NOT create a second subject.
  await page.setInputFiles('#sources-file-input', {
    name: 'materia-b.pdf', mimeType: 'application/pdf',
    buffer: buildFixturePdf(['Conteudo da segunda materia']),
  });
  await expect(page.locator('#sources-message')).toContainText('trecho(s) proposto(s)', { timeout: 10000 });
  // renderSourceProposals replaces the list wholesale per upload (it shows
  // this source's own proposals, not an accumulating history) — the only
  // item visible now is this second material's own proposal.
  const secondItem = page.locator('.source-proposal-item').first();
  await secondItem.locator('[data-action="generate-draft"]').click();
  const secondPanel = secondItem.locator('.source-draft-panel');
  await expect(secondPanel).toBeVisible();

  // Drives the real accessible combobox UI, not the backing native
  // <select> directly — select-ui.js now marks that native element
  // aria-hidden (ACCESSIBLE_CONTROLS_PER_SELECTION=1: exactly one control
  // per choice is exposed to assistive tech, the custom combobox, never
  // both at once), so a real user/screen-reader path is what this test
  // must exercise, not Playwright's .selectOption() shortcut.
  const subjectSelect = secondPanel.locator('.source-draft-subject-select');
  await expect(subjectSelect).toBeVisible();
  await expect(subjectSelect.locator('option', { hasText: 'Fisiologia A' })).toHaveCount(1);
  const subjectTrigger = subjectSelect.locator('xpath=..').locator('.ui-select-trigger');
  await subjectTrigger.click();
  const subjectMenuId = await subjectTrigger.getAttribute('aria-controls');
  const subjectMenu = page.locator(`#${subjectMenuId}`);
  await subjectMenu.locator('li[role="option"]', { hasText: 'Fisiologia A' }).click();
  await expect(subjectTrigger).toHaveText('Fisiologia A');

  // Picking an existing subject must disable (and not require) the
  // free-text new-subject field.
  await expect(secondPanel.locator('.source-draft-subject-input')).toBeDisabled();

  await secondPanel.locator('[data-action="accept-draft"]').click();
  await expect(secondPanel.locator('.source-draft-result')).toContainText('Aula criada', { timeout: 10000 });
  await expect(secondPanel.locator('.source-draft-result')).not.toHaveClass(/is-error/);

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
test('a summary that misses the central concept of the page is flagged in the review, with the source terms it dropped, and acceptance stays a human decision', async ({ page }) => {
  await page.locator('[data-screen="materials"]').click();
  const filler = 'Introducao geral da disciplina e das suas aulas, com informacoes administrativas sobre horarios, salas, avaliacoes e bibliografia recomendada para o semestre letivo inteiro. ';
  const core = 'A insuficiencia cardiaca reduz o debito cardiaco. A insuficiencia cardiaca ativa o sistema renina angiotensina. O debito cardiaco baixo eleva a pressao venosa.';
  await page.setInputFiles('#sources-file-input', { name: 'ic.pdf', mimeType: 'application/pdf', buffer: buildFixturePdf([filler + core]) });
  await expect(page.locator('#sources-message')).toContainText('trecho(s) proposto(s)', { timeout: 10000 });

  const item = page.locator('.source-proposal-item').first();
  await item.locator('[data-action="generate-draft"]').click();
  const draftPanel = item.locator('.source-draft-panel');
  const audit = draftPanel.locator('.source-draft-audit');
  await expect(audit).toBeVisible({ timeout: 10000 });
  await expect(audit).toHaveAttribute('data-result', 'REPAIR');
  await expect(audit).toContainText('para verificar antes de aceitar');
  await expect(audit.locator('.source-draft-audit-issue')).toContainText('Resumo · Pode omitir um conceito central');
  await expect(audit.locator('.source-draft-audit-evidence')).toContainText(/insuficiencia/i);
  // a flag informs, it does not block: the accept action is still there and is the human's call
  await expect(draftPanel.locator('[data-action="accept-draft"]')).toBeEnabled();
});
