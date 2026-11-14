import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildFixturePdf } from '../server/test/pdf-fixtures/build-fixture-pdf.js';
import { VITE_ORIGIN, serverPort } from './support/ports.js';
import { waitForServerReady } from './support/wait-for-server.js';
import { signInRegistered } from './support/session.js';

// Reuse of reviewed content between accounts, through the real UI and a real server with a Codex stand-in that LOGS every call (no network,
// no credit). Student A shares one material (account switch + the basis for that material), generates, accepts. Student B uploads the same
// text: the draft arrives marked "Reaproveitado" and the stand-in is NOT called again. A revokes the material: student C is served normally.

const SERVER_PORT = serverPort(13978);
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));
const PASSWORD = 'a genuinely long test password 1';
const PAGES = ['Farmacocinética: absorção e distribuição de fármacos no organismo.'];

const FAKE_CODEX = `
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(readFileSync(join(here, 'fake-config.json'), 'utf8'));
const args = process.argv.slice(2);
async function readStdin() { let s = ''; for await (const c of process.stdin) s += c; return s; }
if (args[0] === 'login') { console.log('Logged in using ChatGPT'); process.exit(0); }
if (args[0] === 'exec') {
  const prompt = await readStdin();
  const get = (flag) => args[args.indexOf(flag) + 1];
  const schema = JSON.parse(readFileSync(get('--output-schema'), 'utf8'));
  const kind = schema.properties.findings ? 'audit' : 'summary';
  appendFileSync(join(here, 'calls.log'), kind + '\\n');
  writeFileSync(get('-o'), JSON.stringify(cfg[kind]));
  process.exit(0);
}
process.exit(2);
`;

let serverProcess;
let dataDir;
const calls = () => (existsSync(join(dataDir, 'calls.log')) ? readFileSync(join(dataDir, 'calls.log'), 'utf8').split('\n').filter(Boolean).length : 0);

test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'sl-e2e-shared-reuse-'));
  writeFileSync(join(dataDir, 'codex-fake.mjs'), FAKE_CODEX);
  writeFileSync(join(dataDir, 'fake-config.json'), JSON.stringify({
    summary: {
      summary: 'Resumo de farmacocinética: absorção e distribuição de fármacos no organismo.', summarySourceSpans: [{ pageIndex: 1 }], modelVersion: 'fake', promptVersion: 'x',
      questions: [{ question: 'O que a farmacocinética descreve?', questionType: 'MECHANISM', answer: 'Absorção e distribuição de fármacos.', explanation: 'Porque descreve o caminho do fármaco no organismo.', hint: null, sourceSpans: [{ pageIndex: 1 }] }],
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
    },
    stdio: 'ignore',
  });
  await waitForServerReady(API_BASE, { label: 'shared-reuse E2E' });
});

test.afterAll(async () => {
  serverProcess?.kill();
  await new Promise((r) => setTimeout(r, 300));
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

async function student(browser, name) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript((base) => {
    window.__SMARTLEARN_API_BASE__ = base;
    window.__SMARTLEARN_REMOTE_MODE__ = true;
    window.__SMARTLEARN_LOCAL_AUTHORITY__ = true;
  }, API_BASE);
  await signInRegistered(page, { email: `${name}-${Date.now()}-${randomUUID()}@example.com`, password: PASSWORD });
  return { page, context };
}
const api = (page, path) => page.evaluate(async ({ base, path }) => (await (await fetch(`${base}${path}`, { credentials: 'include' })).json()), { base: API_BASE, path });

async function uploadMaterial(page) {
  await page.locator('[data-screen="materials"]').click();
  await expect(page.locator('#sources-card')).toBeVisible({ timeout: 5000 });
  await page.setInputFiles('#sources-file-input', { name: 'farmaco.pdf', mimeType: 'application/pdf', buffer: buildFixturePdf(PAGES) });
  await expect(page.locator('#sources-message')).toContainText(/trechos? propostos?/, { timeout: 10000 });
}
async function openDraft(page) {
  const open = page.locator('[data-action="open-source"]').first();
  if (await open.isVisible()) await open.click(); // back on Materiais after a reload: open the material to see its trechos
  await page.locator('.source-proposal-item').first().locator('[data-action="generate-draft"]').click();
  const editor = page.locator('.lesson-editor');
  await expect(editor).toBeVisible({ timeout: 15000 });
  return editor;
}
async function accept(editor, subject) {
  await editor.locator('.source-draft-subject-input').fill(subject);
  await editor.locator('.source-draft-date-input').fill('2026-04-01');
  await editor.locator('[data-action="accept-draft"]').click();
  await expect(editor.locator('.source-draft-result')).toContainText('Aula criada', { timeout: 10000 });
}

test.setTimeout(240_000);
test('student A shares one material, B receives the reviewed content marked "Reaproveitado" with no new model call, and a revoked material is served normally to C', async ({ browser }) => {
  // ---- A: uploads, declares the right to share THIS material, turns the account switch on, generates and accepts
  const a = await student(browser, 'reuse-a');
  await uploadMaterial(a.page);
  await a.page.locator('[data-screen="settings"]').click();
  const card = a.page.locator('#reuse-card');
  await expect(card).toBeVisible();
  const toggle = card.locator('#reuse-switch');
  await expect(toggle).not.toBeChecked(); // off until the student decides
  await expect(card.locator('#reuse-scope')).toContainText('PDFs');
  await expect(card.locator('#reuse-scope')).toContainText('histórico de estudo');
  await expect(card.locator('#reuse-sources select')).toHaveValue(''); // and no material is shared
  await card.locator('#reuse-sources select').selectOption('OWN_WORK');
  await expect(card.locator('#reuse-message')).toContainText('Preferência salva');
  await toggle.check();
  await expect(card.locator('#reuse-message')).toContainText('Preferência salva');
  await a.page.reload(); // the choices come from the server, not from the page
  await a.page.locator('[data-screen="settings"]').click();
  await expect(a.page.locator('#reuse-switch')).toBeChecked();
  await expect(a.page.locator('#reuse-sources select')).toHaveValue('OWN_WORK');

  await a.page.locator('[data-screen="materials"]').click();
  const editorA = await openDraft(a.page);
  await expect(editorA.locator('.lesson-reuse')).toHaveCount(0); // generated here, not reused
  await accept(editorA, 'Farmacologia A');
  const callsAfterA = calls();
  expect(callsAfterA).toBeGreaterThan(0);

  // ---- B: the same text. Reviewed content is served: marked, and the stand-in is not called again
  const b = await student(browser, 'reuse-b');
  await b.page.locator('[data-screen="settings"]').click();
  await expect(b.page.locator('#reuse-switch')).not.toBeChecked(); // B never agreed to anything
  await uploadMaterial(b.page);
  const editorB = await openDraft(b.page);
  await expect(editorB.locator('.lesson-reuse')).toContainText('Reaproveitado');
  expect(calls()).toBe(callsAfterA); // no new model call
  const draftB = (await api(b.page, `/v1/drafts/${await editorB.getAttribute('data-draft-id')}`)).draft;
  expect(draftB.status).toBe('DRAFT');
  expect(draftB.questionsDeferred).toBe(true); // Codex is summary-first by default: the questions are asked for later, as for any summary
  expect(JSON.stringify(draftB)).not.toContain('reuse-a'); // nobody is named
  await accept(editorB, 'Farmacologia B');
  expect((await api(b.page, '/v1/learning-units')).units).toHaveLength(1);
  expect((await api(a.page, '/v1/learning-units')).units).toHaveLength(1); // A's lesson is A's alone
  expect(calls()).toBe(callsAfterA);

  // ---- A revokes the material: C, with the same text, is generated normally
  await a.page.locator('[data-screen="settings"]').click();
  await a.page.locator('#reuse-sources select').selectOption('');
  await expect(a.page.locator('#reuse-message')).toContainText('Desligado');
  const c = await student(browser, 'reuse-c');
  await uploadMaterial(c.page);
  const editorC = await openDraft(c.page);
  await expect(editorC.locator('.lesson-reuse')).toHaveCount(0);
  expect(calls()).toBeGreaterThan(callsAfterA); // the model was asked again
  await Promise.all([a.context.close(), b.context.close(), c.context.close()]);
});
