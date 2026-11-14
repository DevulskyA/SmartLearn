import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildFixturePdf } from '../server/test/pdf-fixtures/build-fixture-pdf.js';
import { VITE_ORIGIN, serverPort } from './support/ports.js';
import { waitForServerReady } from './support/wait-for-server.js';
import { signInRegistered } from './support/session.js';
import { generateByPages } from './support/materials-flow.js';

// A lesson accepted as a summary only asks for its questions LATER (real UI, Codex stand-in: no network, no credit): the questions are written
// by a background job into a draft of their own, survive the student leaving the editor, are reviewed, and only then ADDED to the same lesson.

const SERVER_PORT = serverPort(13973);
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));
const QUESTIONS_DELAY_MS = 3000;

const FAKE_CODEX = `
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const cfg = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fake-config.json'), 'utf8'));
const args = process.argv.slice(2);
async function readStdin() { let s = ''; for await (const c of process.stdin) s += c; return s; }
if (args[0] === 'login') { console.log('Logged in using ChatGPT'); process.exit(0); }
if (args[0] === 'exec') {
  const prompt = await readStdin();
  const get = (flag) => args[args.indexOf(flag) + 1];
  const schema = JSON.parse(readFileSync(get('--output-schema'), 'utf8'));
  const kind = schema.properties.findings ? 'audit' : prompt.includes('ONLY the questions part') ? 'questions' : 'summary';
  if (kind === 'questions') await new Promise((r) => setTimeout(r, cfg.questionsDelayMs));
  writeFileSync(get('-o'), JSON.stringify(cfg[kind]));
  process.exit(0);
}
process.exit(2);
`;

let serverProcess;
let dataDir;

test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'sl-e2e-lesson-questions-'));
  writeFileSync(join(dataDir, 'codex-fake.mjs'), FAKE_CODEX);
  writeFileSync(join(dataDir, 'fake-config.json'), JSON.stringify({
    questionsDelayMs: QUESTIONS_DELAY_MS,
    summary: { summary: 'Resumo de farmacocinética: absorção e distribuição.', summarySourceSpans: [{ pageIndex: 1 }], questions: [], modelVersion: 'fake', promptVersion: 'x' },
    questions: {
      summary: '-', summarySourceSpans: [], modelVersion: 'fake', promptVersion: 'x',
      questions: [{ question: 'O que a farmacocinética descreve?', questionType: 'MECHANISM', answer: 'Absorção e distribuição.', explanation: 'Porque descreve o caminho do fármaco no corpo.', hint: null, sourceSpans: [{ pageIndex: 1 }] }],
    },
    audit: { result: 'PASS', findings: [] },
  }));
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: {
      ...process.env,
      SMARTLEARN_DB_PATH: join(dataDir, 'e2e.db'),
      SMARTLEARN_SOURCES_DIR: join(dataDir, 'sources'),
      PORT: String(SERVER_PORT),
      HOST: 'localhost',
      NODE_ENV: 'test',
      SMARTLEARN_ALLOWED_ORIGINS: VITE_ORIGIN,
      SMARTLEARN_AI_PROVIDER: 'CODEX',
      SMARTLEARN_AI_CONSENT: 'true',
      SMARTLEARN_CODEX_COMMAND: join(dataDir, 'codex-fake.mjs'),
      SMARTLEARN_CODEX_DEFER_QUESTIONS: 'true',
    },
    stdio: 'ignore',
  });
  await waitForServerReady(API_BASE, { label: 'lesson-questions E2E' });
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
  await signInRegistered(page, { email: `lesson-questions-${Date.now()}-${randomUUID()}@example.com`, password: 'a genuinely long test password 1' });
});

const api = (page, path) => page.evaluate(async ({ base, path }) => (await (await fetch(`${base}${path}`, { credentials: 'include' })).json()), { base: API_BASE, path });

test('accept the summary without questions, ask for them later: a job writes them, leaving and coming back joins it, review, then they join the same lesson', async ({ page }) => {
  // 1. summary first, accepted with no questions
  await page.locator('[data-screen="materials"]').click();
  await expect(page.locator('#sources-card')).toBeVisible({ timeout: 5000 });
  await page.setInputFiles('#sources-file-input', { name: 'farmaco.pdf', mimeType: 'application/pdf', buffer: buildFixturePdf(['Farmacocinética: absorção e distribuição']) });
  await expect(page.locator('#sources-message')).toContainText(/trechos? propostos?/, { timeout: 10000 });
  await generateByPages(page);
  const editor = page.locator('.lesson-editor');
  await expect(editor).toBeVisible({ timeout: 10000 });
  await editor.locator('.source-draft-subject-input').fill('Farmacologia E2E');
  await editor.locator('.source-draft-date-input').fill('2026-04-01');
  await editor.locator('[data-action="accept-draft"]').click();
  await expect(editor.locator('.source-draft-result')).toContainText('Aula criada', { timeout: 10000 });
  const units = (await api(page, '/v1/learning-units')).units;
  expect(units).toHaveLength(1);
  const unitId = units[0].id;
  expect((await api(page, `/v1/learning-units/${unitId}/exercises`)).exercises).toHaveLength(0);
  
  // 2. later: Materiais offers the questions for the lesson that exists
  await editor.locator('[data-action="lesson-back"]').click();
  const slot = page.locator('#sources-drafts-list .source-draft-item').first();
  await expect(slot).toContainText('Aula já criada');
  const ask = slot.locator('[data-action="lesson-questions"]');
  await expect(ask).toBeVisible();
  await ask.click();
  const lessonEditor = page.locator('.lesson-editor');
  await expect(lessonEditor).toBeVisible({ timeout: 10000 });
  // a draft that only adds questions: no discipline or date to choose, the summary is read only
  await expect(lessonEditor.locator('.lesson-accept-title')).toContainText('Acrescentar à aula');
  await expect(lessonEditor.locator('.source-draft-subject-select')).toBeHidden();
  await expect(lessonEditor.locator('.source-draft-date-input')).toBeHidden();
  await expect(lessonEditor.locator('[data-action="toggle-summary-read"]')).toBeHidden();

  // 3. ask: the job runs in the background; the student leaves and comes back while it works
  await lessonEditor.getByRole('tab', { name: /Questões/ }).click();
  await lessonEditor.locator('[data-panel="questions"] [data-action="generate-questions"]').click();
  await expect(lessonEditor.locator('[data-panel="questions"] [data-action="generate-questions"]')).toBeDisabled();
  await expect(lessonEditor.locator('[data-panel="questions"] [data-action="cancel-questions"]')).toBeVisible();
  const draftId = await lessonEditor.getAttribute('data-draft-id');
  await lessonEditor.locator('[data-action="lesson-back"]').click();
  await expect(page.locator('.lesson-editor')).toHaveCount(0);
  const job = (await api(page, '/v1/generation-jobs')).jobs[0];
  expect(job.kind).toBe('QUESTIONS');
  expect(String(job.targetDraftId)).toBe(draftId);
  expect(['QUEUED', 'CALLING_PROVIDER']).toContain(job.state);

  // coming back: Materiais says the questions are being reviewed, and the editor joins the running job instead of asking (or charging) again
  const reopen = page.locator('#sources-drafts-list .source-draft-item').first().locator('[data-action="open-draft"]');
  await expect(reopen).toBeVisible({ timeout: 5000 });
  await reopen.click();
  const again = page.locator('.lesson-editor');
  await expect(again).toBeVisible({ timeout: 10000 });
  await expect(again.locator('.lesson-qitem')).toHaveCount(1, { timeout: 20000 }); // the questions arrive in the SAME draft, to be reviewed
  expect(await again.getAttribute('data-draft-id')).toBe(draftId);
  expect((await api(page, `/v1/learning-units/${unitId}/exercises`)).exercises).toHaveLength(0); // nothing reaches the lesson before the review
  const jobs = (await api(page, '/v1/generation-jobs')).jobs;
  expect(jobs.filter((j) => j.kind === 'QUESTIONS')).toHaveLength(1); // coming back did not ask again

  // 5. review, then add to the lesson that already exists
  await again.locator('[data-action="accept-draft"]').click();
  await expect(again.locator('.source-draft-result')).toContainText('Perguntas acrescentadas', { timeout: 10000 });
  const exercises = (await api(page, `/v1/learning-units/${unitId}/exercises`)).exercises;
  expect(exercises).toHaveLength(1);
  expect((await api(page, '/v1/learning-units')).units).toHaveLength(1); // no second lesson
  const final = (await api(page, `/v1/drafts/${draftId}`)).draft;
  expect(final.status).toBe('ACCEPTED');

  // 6. Materiais no longer offers the questions: the lesson has them
  await again.locator('[data-action="lesson-back"]').click();
  await expect(page.locator('#sources-drafts-list .source-draft-item').first()).toContainText('Aula já criada');
  await expect(page.locator('#sources-drafts-list .source-draft-item').first().locator('[data-action="lesson-questions"]')).toHaveCount(0);
});
