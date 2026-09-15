import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildFixturePdf } from '../server/test/pdf-fixtures/build-fixture-pdf.js';

// Closes the critical flow the TEST SHIELD goal names explicitly end to
// end: Study Now -> attempt -> evidence -> reload -> Exercícios resolvidos
// -> tentativa correta. "Estudar agora" (src/app.js startStudyNow) has no
// reachable entry point in the current UI other than right after accepting
// a Materiais draft (see the button's own construction site, app.js ~3009)
// — so this test reaches it the same real way a user would, reusing
// e2e/draft-acceptance.spec.js's exact real-pipeline setup (own server,
// own port) rather than adding a test-only shortcut into product code.

const SERVER_PORT = 13969;
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));

let serverProcess;
let dataDir;

test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'sl-e2e-study-now-'));
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
  throw new Error('study-now-flow E2E: real server did not become ready in time');
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
  const email = `study-now-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
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

async function acceptDraftAndGetStudyNowButton(page, { subjectName, sourceText, studyDate }) {
  await page.locator('[data-screen="materials"]').click();
  await expect(page.locator('#sources-card')).toBeVisible({ timeout: 5000 });

  const pdfBuffer = buildFixturePdf([sourceText]);
  await page.setInputFiles('#sources-file-input', { name: 'material.pdf', mimeType: 'application/pdf', buffer: pdfBuffer });
  await expect(page.locator('#sources-message')).toContainText('trecho(s) proposto(s)', { timeout: 10000 });

  const item = page.locator('.source-proposal-item').first();
  await item.locator('[data-action="generate-draft"]').click();
  await expect(page.locator('#sources-message')).toContainText('Rascunho gerado', { timeout: 10000 });

  const draftPanel = item.locator('.source-draft-panel');
  await expect(draftPanel).toBeVisible();
  const draftQuestionText = await draftPanel.locator('.source-draft-question').first().textContent();

  await draftPanel.locator('.source-draft-subject-input').fill(subjectName);
  await draftPanel.locator('.source-draft-date-input').fill(studyDate);
  await draftPanel.locator('[data-action="accept-draft"]').click();
  await expect(draftPanel.locator('.source-draft-result')).toContainText('Aula criada', { timeout: 10000 });
  await expect(draftPanel.locator('.source-draft-result')).not.toHaveClass(/is-error/);

  const studyNowBtn = draftPanel.locator('[data-action="study-now"]');
  await expect(studyNowBtn).toBeVisible({ timeout: 5000 });
  return { studyNowBtn, draftQuestionText };
}

test('Study Now -> attempt -> evidence -> reload -> Exercícios resolvidos -> tentativa correta, end to end', async ({ page }) => {
  const { studyNowBtn, draftQuestionText } = await acceptDraftAndGetStudyNowButton(page, {
    subjectName: 'Farmacologia Study Now E2E',
    sourceText: 'Farmacocinética: absorção e distribuição de fármacos.',
    studyDate: '2026-04-01',
  });

  await studyNowBtn.click();
  await expect(page.locator('#title-study-now')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#study-now-question-text')).toHaveText(draftQuestionText.trim());

  await page.locator('#study-now-reveal-btn').click();
  await expect(page.locator('#study-now-answer-text')).toBeVisible();

  await page.locator('#study-now-correct-btn').click();
  await expect(page.locator('#study-now-result-card')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#study-now-result-text')).toContainText('1/1');

  // Reload — the whole point of the flow: evidence must have actually
  // persisted server-side, not just live in this session's in-memory state.
  await page.reload();
  await page.waitForLoadState('networkidle');

  await page.locator('[data-screen="stats"]').click();
  const row = page.locator('#exercise-notes-body .exercise-row', { hasText: 'Farmacologia Study Now E2E' });
  await expect(row).toBeVisible({ timeout: 5000 });

  await row.click();
  const dialog = page.locator('#exercise-detail-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(draftQuestionText.trim())).toBeVisible();
  await expect(dialog.locator('.exercise-attempt-outcome')).toHaveText('Acertou');
  await expect(dialog.locator('.exercise-attempt-item')).toHaveClass(/is-correct/);
});

test('Study Now with an INCORRECT judgment reaches Exercícios resolvidos showing the real wrong outcome, not a guessed one', async ({ page }) => {
  const { studyNowBtn, draftQuestionText } = await acceptDraftAndGetStudyNowButton(page, {
    subjectName: 'Bioquímica Study Now E2E',
    sourceText: 'Ciclo de Krebs: etapas e enzimas envolvidas.',
    studyDate: '2026-04-02',
  });

  await studyNowBtn.click();
  await expect(page.locator('#title-study-now')).toBeVisible({ timeout: 5000 });
  await page.locator('#study-now-reveal-btn').click();
  await page.locator('#study-now-incorrect-btn').click();
  await expect(page.locator('#study-now-result-card')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#study-now-result-text')).toContainText('0/1');

  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.locator('[data-screen="stats"]').click();
  const row = page.locator('#exercise-notes-body .exercise-row', { hasText: 'Bioquímica Study Now E2E' });
  await expect(row).toBeVisible({ timeout: 5000 });

  await row.click();
  const dialog = page.locator('#exercise-detail-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(draftQuestionText.trim())).toBeVisible();
  await expect(dialog.locator('.exercise-attempt-outcome')).toHaveText('Errou');
  await expect(dialog.locator('.exercise-attempt-item')).toHaveClass(/is-incorrect/);
});
