import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildFixturePdf } from '../server/test/pdf-fixtures/build-fixture-pdf.js';

// PV1-01: the first real end-to-end product journey on Desktop local-first
// (ARCH-01) — material -> unit -> "Estudar agora" -> Resumo Mestre ->
// exercises -> automatic INITIAL_PRACTICE evidence -> next review. Every
// step reuses an existing, already-proven contract (source-proposals-ui.js,
// draft-review-ui.js, DB.attempts/DB.exercises/DB.learningEvidence/
// DB.reviewTasks in remote-store.js) — this test proves they compose into
// one real journey, not that any of them individually work (those are
// e2e/source-proposals.spec.js, e2e/draft-acceptance.spec.js,
// e2e/practice.spec.js's job). No SMARTLEARN_AI_* env var is set, so the
// server falls back to the deterministic fake provider (server/src/ai/
// fake-provider.js) — same mechanism as e2e/draft-acceptance.spec.js.

const SERVER_PORT = 13966;
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));

let serverProcess;
let dataDir;

test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'sl-e2e-product-value-'));
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
  throw new Error('product-value E2E: real server did not become ready in time');
});

test.afterAll(async () => {
  serverProcess?.kill();
  await new Promise((r) => setTimeout(r, 300));
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

async function registerAndLogin(page, { localAuthority }) {
  await page.addInitScript(({ base, local }) => {
    window.__SMARTLEARN_API_BASE__ = base;
    window.__SMARTLEARN_REMOTE_MODE__ = true;
    if (local) window.__SMARTLEARN_LOCAL_AUTHORITY__ = true;
  }, { base: API_BASE, local: localAuthority });
  const email = `product-value-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
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
}

test('LOCAL_DESKTOP_AUTHORITY: PDF -> unit -> Estudar agora -> Resumo Mestre -> exercises -> automatic INITIAL_PRACTICE evidence -> next review, surviving reload', async ({ page }) => {
  await registerAndLogin(page, { localAuthority: true });

  // 2. Materiais appears in navigation (LOCAL_DESKTOP_AUTHORITY only).
  await expect(page.locator('[data-screen="materials"]')).toBeVisible();
  await page.locator('[data-screen="materials"]').click();
  await expect(page.locator('#sources-card')).toBeVisible({ timeout: 5000 });

  // 3-4. Upload + extraction (real pipeline, real fixture PDF).
  const pdfBuffer = buildFixturePdf([
    'Primeira pagina: introducao a nefrologia clinica',
    'Segunda pagina: taxa de filtracao glomerular',
  ]);
  await page.setInputFiles('#sources-file-input', {
    name: 'nefrologia.pdf',
    mimeType: 'application/pdf',
    buffer: pdfBuffer,
  });
  await expect(page.locator('#sources-message')).toContainText('trecho(s) proposto(s)', { timeout: 10000 });

  // 5. Proposal.
  const item = page.locator('.source-proposal-item').first();
  await expect(item).toBeVisible();

  // 6. Draft generation using the deterministic test provider.
  await item.locator('[data-action="generate-draft"]').click();
  await expect(page.locator('#sources-message')).toContainText('Rascunho gerado', { timeout: 10000 });
  const draftPanel = item.locator('.source-draft-panel');
  await expect(draftPanel).toBeVisible();
  await expect(draftPanel.locator('.source-draft-question')).toHaveCount(2);

  // 7. Accept.
  await draftPanel.locator('.source-draft-subject-input').fill('Nefrologia PV1-01');
  await draftPanel.locator('.source-draft-date-input').fill('2026-04-10');
  await draftPanel.locator('[data-action="accept-draft"]').click();
  await expect(draftPanel.locator('.source-draft-result')).toContainText('Aula criada', { timeout: 10000 });
  await expect(draftPanel.locator('.source-draft-result')).not.toHaveClass(/is-error/);

  // 8. "Estudar agora" appears and works — no need to go find the unit
  // in Plano/Hoje.
  const studyNowBtn = draftPanel.locator('[data-action="study-now"]');
  await expect(studyNowBtn).toBeVisible();
  await studyNowBtn.click();
  await expect(page.locator('#screen-study-now')).toBeVisible({ timeout: 5000 });

  // 9. Resumo Mestre is shown (the fake provider always produces a
  // non-empty summary from the real source text).
  await expect(page.locator('#study-now-summary-card')).toBeVisible();
  await expect(page.locator('#study-now-summary-body')).not.toHaveText('');

  // 10-11. Exercises presented one at a time; answer all (mixed outcome,
  // to prove X/Y is a real count, not a trivial all-correct/all-wrong path).
  await expect(page.locator('#study-now-progress')).toHaveText('Questão 1 de 2');
  await page.locator('#study-now-reveal-btn').click();
  await expect(page.locator('#study-now-answer-text')).toBeVisible();

  // 12. Attempts are really registered — a real server-owned attempt id
  // is attached to the question area the moment it's revealed, with
  // real server-side state: SOLUTION-level assistance recorded, and
  // deliberately no reviewTaskId (INITIAL_PRACTICE, not a scheduled review).
  const firstAttemptId = await page.locator('#study-now-question-area').getAttribute('data-attempt-id');
  expect(firstAttemptId).toBeTruthy();
  const firstAttemptAfterReveal = await page.evaluate(async ({ base, id }) => {
    const res = await fetch(`${base}/v1/attempts/${id}`, { credentials: 'include' });
    return res.json();
  }, { base: API_BASE, id: firstAttemptId });
  expect(firstAttemptAfterReveal.attempt.maxAssistance).toBe('SOLUTION');
  expect(firstAttemptAfterReveal.attempt.reviewTaskId).toBeFalsy();
  expect(firstAttemptAfterReveal.attempt.status).toBe('STARTED');

  await page.locator('#study-now-correct-btn').click();

  await expect(page.locator('#study-now-progress')).toHaveText('Questão 2 de 2');
  await page.locator('#study-now-reveal-btn').click();
  await expect(page.locator('#study-now-answer-text')).toBeVisible();
  const secondAttemptId = await page.locator('#study-now-question-area').getAttribute('data-attempt-id');
  expect(secondAttemptId).toBeTruthy();
  expect(secondAttemptId).not.toBe(firstAttemptId);
  await page.locator('#study-now-incorrect-btn').click();

  // Both attempts really closed server-side (status SUBMITTED), not just
  // a client-side visual state change.
  const firstAttemptAfterSubmit = await page.evaluate(async ({ base, id }) => {
    const res = await fetch(`${base}/v1/attempts/${id}`, { credentials: 'include' });
    return res.json();
  }, { base: API_BASE, id: firstAttemptId });
  expect(firstAttemptAfterSubmit.attempt.status).toBe('SUBMITTED');
  const secondAttemptAfterSubmit = await page.evaluate(async ({ base, id }) => {
    const res = await fetch(`${base}/v1/attempts/${id}`, { credentials: 'include' });
    return res.json();
  }, { base: API_BASE, id: secondAttemptId });
  expect(secondAttemptAfterSubmit.attempt.status).toBe('SUBMITTED');

  // 13. Result X/Y.
  await expect(page.locator('#study-now-result-card')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#study-now-result-text')).toHaveText('1/2 corretas — 50,0%');

  // ERRO -> COMPREENSAO -> RETESTE: the block never ends on a bare score.
  // Every wrong item is shown immediately (no toggle to hunt for), with the
  // correct answer and its origin, and "Refazer erros" is the obvious action.
  const retestBtn = page.locator('#study-now-retest-btn');
  await expect(retestBtn).toBeVisible();
  await expect(retestBtn).toHaveText('Refazer erros (1)');
  await expect(page.locator('#study-now-errors-list')).toBeVisible();
  await expect(page.locator('.study-now-error-item')).toHaveCount(1);
  await expect(page.locator('.study-now-error-question')).toContainText('página 2');
  await expect(page.locator('.study-now-error-answer')).not.toHaveText('');
  await expect(page.locator('.study-now-error-item')).toContainText('Você marcou: errei');
  await expect(page.locator('.study-now-error-item')).toContainText('Origem:');

  // Redo round 1: still wrong -> the error persists and stays actionable.
  await retestBtn.click();
  await expect(page.locator('#study-now-progress')).toHaveText('Erro 1 de 1');
  // Keyboard flow: the button that was pressed disappeared, focus must not
  // fall to <body> -- it lands on the next actionable control.
  await expect(page.locator('#study-now-reveal-btn')).toBeFocused();
  // The summary holds the answers: it must not sit above a retrieval question.
  await expect(page.locator('#study-now-summary-card')).toBeHidden();
  await page.locator('#study-now-reveal-btn').click();
  await expect(page.locator('#study-now-correct-btn')).toBeFocused();
  const retestAttempt1 = await page.locator('#study-now-question-area').getAttribute('data-attempt-id');
  expect(retestAttempt1).toBeTruthy();
  expect([firstAttemptId, secondAttemptId]).not.toContain(retestAttempt1);
  await page.locator('#study-now-incorrect-btn').click();
  await expect(page.locator('#study-now-result-title')).toHaveText('Resultado do reteste');
  await expect(page.locator('#study-now-result-text')).toHaveText('0/1 erros corrigidos');
  await expect(page.locator('#study-now-summary-card')).toBeVisible();
  await expect(page.locator('#study-now-errors-title')).toHaveText('Ainda para fixar (1)');
  await expect(page.locator('#study-now-corrected-section')).toBeHidden();
  await expect(retestBtn).toHaveText('Refazer os que ainda errei (1)');

  // Redo round 2: corrected.
  await retestBtn.click();
  await expect(page.locator('#study-now-progress')).toHaveText('Erro 1 de 1');
  await page.locator('#study-now-reveal-btn').click();
  const retestAttempt2 = await page.locator('#study-now-question-area').getAttribute('data-attempt-id');
  expect([firstAttemptId, secondAttemptId, retestAttempt1]).not.toContain(retestAttempt2);
  await page.locator('#study-now-correct-btn').click();
  await expect(page.locator('#study-now-result-text')).toHaveText('1/1 erros corrigidos');
  await expect(page.locator('#study-now-corrected-section')).toBeVisible();
  await expect(page.locator('.study-now-corrected-item')).toHaveCount(1);
  await expect(page.locator('#study-now-errors-section')).toBeHidden();
  await expect(retestBtn).toBeHidden();
  await expect(page.locator('#study-now-done-btn')).toBeVisible();

  // The original attempts are untouched and every redo is its own real,
  // closed server attempt -- history is added to, never rewritten.
  for (const id of [firstAttemptId, secondAttemptId, retestAttempt1, retestAttempt2]) {
    const attempt = await page.evaluate(async ({ base, id: attemptId }) => {
      const res = await fetch(`${base}/v1/attempts/${attemptId}`, { credentials: 'include' });
      return res.json();
    }, { base: API_BASE, id });
    expect(attempt.attempt.status).toBe('SUBMITTED');
  }

  // 14. Exactly one INITIAL_PRACTICE evidence row, correct counts -- the
  // two redo rounds above must NOT have inflated the aggregate (recovery
  // right after seeing the answer is not performance).
  const unitsAfter = await page.evaluate(async (base) => {
    const res = await fetch(`${base}/v1/learning-units`, { credentials: 'include' });
    return res.json();
  }, API_BASE);
  expect(unitsAfter.units.length).toBe(1);
  const unitId = unitsAfter.units[0].id;

  const evidenceAfter = await page.evaluate(async ({ base, id }) => {
    const res = await fetch(`${base}/v1/learning-evidence?unitId=${id}`, { credentials: 'include' });
    return res.json();
  }, { base: API_BASE, id: unitId });
  expect(evidenceAfter.evidence.length).toBe(1);
  expect(evidenceAfter.evidence[0].type).toBe('INITIAL_PRACTICE');
  expect(evidenceAfter.evidence[0].questionsCount).toBe(2);
  expect(evidenceAfter.evidence[0].correctCount).toBe(1);

  // 15. Exactly 16 reviews, still — this flow never touches the schedule.
  const reviewTasksAfter = await page.evaluate(async ({ base, id }) => {
    const res = await fetch(`${base}/v1/review-tasks?unitId=${id}`, { credentials: 'include' });
    return res.json();
  }, { base: API_BASE, id: unitId });
  expect(reviewTasksAfter.reviewTasks.length).toBe(16);
  expect(reviewTasksAfter.reviewTasks.every((t) => t.completedAt === null)).toBe(true);

  // 16. Next review is shown, and matches the earliest real pending due date.
  const earliestDueDate = reviewTasksAfter.reviewTasks.map((t) => t.dueDate).sort()[0];
  await expect(page.locator('#study-now-next-review-text')).toContainText('Próxima revisão:');
  const expectedLabel = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
    .format(new Date(`${earliestDueDate}T12:00:00`));
  await expect(page.locator('#study-now-next-review-text')).toContainText(expectedLabel);

  // 17. Reload keeps the unit + evidence (server-authoritative, not a
  // client-side artifact of this one session).
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.locator('[data-screen="plan"]').click();
  await expect(page.locator('#screen-plan .plan-row-compact .subject-chip', { hasText: 'Nefrologia PV1-01' })).toBeVisible({ timeout: 5000 });
  const evidenceAfterReload = await page.evaluate(async ({ base, id }) => {
    const res = await fetch(`${base}/v1/learning-evidence?unitId=${id}`, { credentials: 'include' });
    return res.json();
  }, { base: API_BASE, id: unitId });
  expect(evidenceAfterReload.evidence.length).toBe(1);
});

test('REMOTE_AUTHORITY without LOCAL_AUTHORITY: Materiais never appears as a product surface', async ({ page }) => {
  await registerAndLogin(page, { localAuthority: false });

  // Nav item hidden.
  await expect(page.locator('[data-screen="materials"]')).toBeHidden();

  // Direct hash access must not expose the screen either.
  await page.evaluate(() => { window.location.hash = '#materials'; });
  await page.waitForTimeout(200);
  await expect(page.locator('#screen-materials')).toBeHidden();
});
