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

// Summary first, questions later, through the real UI: the Resumo Mestre arrives alone (Codex stand-in, no network, no credit), the student
// asks for the questions, they join the SAME draft for review, and only the accepted draft becomes a lesson.

const SERVER_PORT = serverPort(13971);
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));

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
  writeFileSync(get('-o'), JSON.stringify(cfg[kind]));
  process.exit(0);
}
process.exit(2);
`;

let serverProcess;
let dataDir;

test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'sl-e2e-summary-first-'));
  writeFileSync(join(dataDir, 'codex-fake.mjs'), FAKE_CODEX);
  writeFileSync(join(dataDir, 'fake-config.json'), JSON.stringify({
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
  await waitForServerReady(API_BASE, { label: 'summary-first E2E' });
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
  await signInRegistered(page, { email: `summary-first-${Date.now()}-${randomUUID()}@example.com`, password: 'a genuinely long test password 1' });
});

test('summary first: the questions are asked for later, join the same draft, and the lesson only exists after the student accepts', async ({ page }) => {
  await page.locator('[data-screen="materials"]').click();
  await expect(page.locator('#sources-card')).toBeVisible({ timeout: 5000 });
  await page.setInputFiles('#sources-file-input', { name: 'farmaco.pdf', mimeType: 'application/pdf', buffer: buildFixturePdf(['Farmacocinética: absorção e distribuição']) });
  await expect(page.locator('#sources-message')).toContainText(/trechos? propostos?/, { timeout: 10000 });
  await page.locator('.source-proposal-item').first().locator('[data-action="generate-draft"]').click();
  const editor = page.locator('.lesson-editor');
  await expect(editor).toBeVisible({ timeout: 10000 });

  // the summary arrived alone: no questions yet, and BOTH places the student looks (Questões, Revisão) offer to write them
  await expect(editor.getByRole('tab', { name: /Questões/ })).toContainText('0');
  await editor.getByRole('tab', { name: /Revisão/ }).click();
  await expect(editor.locator('[data-panel="review"] [data-action="generate-questions"]')).toBeVisible();
  await editor.getByRole('tab', { name: /Questões/ }).click();
  const generate = editor.locator('[data-panel="questions"] [data-action="generate-questions"]');
  await expect(generate).toBeVisible();
  await expect(editor.locator('[data-panel="questions"]')).not.toContainText('não tem mais questões');

  await generate.click();
  await expect(editor.locator('[data-action="generate-questions"]')).toHaveCount(0, { timeout: 15000 });

  // the questions are in the SAME draft, waiting for the student's review
  await expect(editor.locator('.lesson-qitem')).toHaveCount(1);
  await expect(editor.locator('.lesson-head .eyebrow')).toContainText('aguardando sua conferência');
  const draftId = await editor.getAttribute('data-draft-id');
  const unitsBefore = await page.evaluate(async (base) => (await (await fetch(`${base}/v1/learning-units`, { credentials: 'include' })).json()).units.length, API_BASE);
  expect(unitsBefore).toBe(0);

  // the student accepts: only now the lesson exists, with the exercise
  await editor.locator('.source-draft-subject-input').fill('Farmacologia E2E');
  await editor.locator('.source-draft-date-input').fill('2026-04-01');
  await editor.locator('[data-action="accept-draft"]').click();
  await expect(editor.locator('.source-draft-result')).toContainText('Aula criada', { timeout: 10000 });
  const result = await page.evaluate(async ({ base, id }) => (await (await fetch(`${base}/v1/drafts/${id}`, { credentials: 'include' })).json()).draft, { base: API_BASE, id: draftId });
  expect(result.status).toBe('ACCEPTED');
  expect(result.questionsDeferred).toBe(false);
});
