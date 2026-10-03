import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

// VALID-4 (H0.4): the REAL-medical-source canary, through the real UI.
//   real PDF upload -> extraction -> semantic proposals -> pick ONE bounded section -> "Gerar rascunho com IA"
//   -> Codex (generation, model audit, at most one repair) -> schema + deterministic audit -> DRAFT in the review UI.
// The draft is NOT accepted: this proves production + review, and writes the draft JSON for a source x draft comparison.
// OPT-IN (spends a real Codex run and sends one section of the source to the model provider). The PDF path is never in the
// repository:
//   SMARTLEARN_REAL_PDF="<absolute path>" SMARTLEARN_REAL_SECTION="Glomerular Filtration" SMARTLEARN_REAL_PAGES="267-272" SMARTLEARN_REAL_PDF_OUT="<json path>" \
//   SMARTLEARN_E2E_REALPDF=1 npx playwright test e2e/realpdf-canary.spec.js

test.skip(process.env.SMARTLEARN_E2E_REALPDF !== '1', 'opt-in: set SMARTLEARN_E2E_REALPDF=1 (+ SMARTLEARN_REAL_PDF, SMARTLEARN_REAL_SECTION, SMARTLEARN_REAL_PDF_OUT)');
test.setTimeout(1_800_000);

const SERVER_PORT = 13955;
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));

let serverProcess;
let dataDir;

test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'sl-e2e-realpdf-'));
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: {
      ...process.env,
      SMARTLEARN_DB_PATH: join(dataDir, 'e2e.db'),
      SMARTLEARN_SOURCES_DIR: join(dataDir, 'sources'),
      PORT: String(SERVER_PORT),
      HOST: 'localhost',
      NODE_ENV: 'test',
      SMARTLEARN_ALLOWED_ORIGINS: 'http://localhost:5199',
      SMARTLEARN_AI_PROVIDER: 'CODEX',
      SMARTLEARN_AI_CONSENT: 'true',
    },
    stdio: 'ignore',
  });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${API_BASE}/health/ready`)).status === 200) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('realpdf E2E: real server did not become ready in time');
});

test.afterAll(async () => {
  serverProcess?.kill();
  await new Promise((r) => setTimeout(r, 300));
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test('VALID-4: real PDF -> bounded section -> Codex draft -> review UI', async ({ page }) => {
  const pdfPath = process.env.SMARTLEARN_REAL_PDF;
  const section = process.env.SMARTLEARN_REAL_SECTION;
  const outPath = process.env.SMARTLEARN_REAL_PDF_OUT;
  const [pageStart, pageEnd] = String(process.env.SMARTLEARN_REAL_PAGES ?? '').split('-').map(Number);
  expect(pdfPath && section && outPath && pageStart && pageEnd, 'SMARTLEARN_REAL_PDF, _SECTION, _PAGES ("267-272") and _PDF_OUT are required').toBeTruthy();

  await page.addInitScript((base) => {
    window.__SMARTLEARN_API_BASE__ = base;
    window.__SMARTLEARN_REMOTE_MODE__ = true;
    window.__SMARTLEARN_LOCAL_AUTHORITY__ = true;
  }, API_BASE);
  const email = `realpdf-${Date.now()}@example.com`;
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

  await page.locator('[data-screen="materials"]').click();
  await page.setInputFiles('#sources-file-input', { name: 'real-source.pdf', mimeType: 'application/pdf', buffer: readFileSync(pdfPath) });
  await expect(page.locator('#sources-message')).toContainText('trecho(s) proposto(s)', { timeout: 180_000 });

  // ONE bounded section only: the model never sees the rest of the book.
  // The title lives in an <input> and several items merely MENTION the section in their (hidden) excerpt: select by the
  // visible page range, which is unique, and verify the title afterwards.
  // The student says WHAT to study; the located section (heading text + exact spans) is the only thing sent to the model.
  await page.locator('#sources-topic-input').fill(section);
  await page.locator('#sources-topic-form button[type="submit"]').click();
  const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const item = page.locator('.source-topic-item', { has: page.locator('.source-topic-title', { hasText: new RegExp(`^${escapeRegExp(section)}$`) }) }).first();
  await expect(item).toBeVisible({ timeout: 30_000 });
  await item.locator('[data-action="generate-topic"]').click();
  // Either outcome ends the wait: an error message must fail the test now, not after the full timeout.
  await expect(page.locator('#sources-message')).toContainText(/Rascunho gerado|Tempo limite|Não foi possível|Erro|erro|falh/i, { timeout: 1_200_000 });
  await expect(page.locator('#sources-message')).toContainText('Rascunho gerado');

  const panel = page.locator('.lesson-editor');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('não verificado');
  await panel.getByRole('tab', { name: /Questões/ }).click();
  expect(await panel.locator('.lesson-qitem').count()).toBeGreaterThanOrEqual(3);
  await panel.getByRole('tab', { name: /Revisão/ }).click();
  await expect(panel.locator('[data-panel="review"]')).toContainText('Conferência automática');

  // Hand the draft (exactly what the reviewer sees, from the server) and the section's own text to the comparison.
  const proposals = await page.evaluate(async (base) => {
    const sources = (await (await fetch(`${base}/v1/sources`, { credentials: 'include' })).json()).sources;
    const out = [];
    for (const s of sources) {
      const r = await (await fetch(`${base}/v1/sources/${s.id}/proposals`, { credentials: 'include' })).json();
      out.push(...(r.proposals ?? []));
    }
    return out;
  }, API_BASE);
  // Several proposals may share the title (the section name can appear in more than one chapter): the one that was
  // generated is the one that has a draft.
  const candidates = proposals.filter((p) => p.title === section);
  expect(candidates.length, 'the section has at least one proposal').toBeGreaterThan(0);
  let proposal = null;
  let drafts = [];
  for (const candidate of candidates) {
    const found = await page.evaluate(async ({ base, id }) => (await (await fetch(`${base}/v1/proposals/${id}/drafts`, { credentials: 'include' })).json()).drafts, { base: API_BASE, id: candidate.id });
    if (found.length > 0) { proposal = candidate; drafts = found; break; }
  }
  expect(proposal, 'exactly the proposal that was generated has a draft').toBeTruthy();
  expect(drafts.length).toBe(1);
  writeFileSync(outPath, JSON.stringify({ proposal, draft: drafts[0] }, null, 2));
  console.log(`REALPDF section "${proposal.title}" pages ${proposal.pageStart ?? proposal.page_start}-${proposal.pageEnd ?? proposal.page_end}; draft ${drafts[0].questions.length} questions; audit ${drafts[0].audit?.result}`);
});
