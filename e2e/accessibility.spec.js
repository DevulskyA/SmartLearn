import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

// A11Y-1: an automated accessibility audit (axe-core, WCAG 2.0/2.1 A + AA) of every main screen, on the REAL
// server and UI, at phone and desktop width. It fails on any critical or serious violation; the few findings
// that are not defects of this product are listed in ACCEPTED with the reason. Automated checks catch roughly
// a third of accessibility problems: keyboard, focus and reading order stay covered by their own specs.

const SERVER_PORT = 13990;
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));

const SCREENS = [
  { id: 'today', name: 'Hoje' },
  { id: 'plan', name: 'Plano' },
  { id: 'materials', name: 'Materiais' },
  { id: 'subjects', name: 'Disciplinas' },
  { id: 'stats', name: 'Estatísticas' },
  { id: 'tracking', name: 'Acompanhamento' },
  { id: 'settings', name: 'Configurações' },
  { id: 'account', name: 'Conta' },
];

// rule id -> why it is not a defect to fix here (none yet)
const ACCEPTED = {};

let serverProcess;
let dataDir;

test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'sl-e2e-a11y-'));
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: {
      ...process.env,
      SMARTLEARN_DB_PATH: join(dataDir, 'e2e.db'),
      SMARTLEARN_SOURCES_DIR: join(dataDir, 'sources'),
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
  throw new Error('accessibility E2E: real server did not become ready in time');
});

test.afterAll(async () => {
  serverProcess?.kill();
  await new Promise((r) => setTimeout(r, 300));
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

async function signIn(page) {
  await page.addInitScript((base) => {
    window.__SMARTLEARN_API_BASE__ = base;
    window.__SMARTLEARN_REMOTE_MODE__ = true;
    window.__SMARTLEARN_LOCAL_AUTHORITY__ = true;
  }, API_BASE);
  const email = `a11y-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
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

const detail = (node) => {
  const d = node.any?.[0]?.data;
  return d?.contrastRatio ? `${node.target.join(' ')} [${d.fgColor} on ${d.bgColor}, ${d.contrastRatio}:1, needs ${d.expectedContrastRatio}:1]` : node.target.join(' ');
};
async function apiCall(page, path, body) {
  return page.evaluate(async ({ base, path, body }) => {
    const me = await (await fetch(`${base}/v1/auth/me`, { credentials: 'include' })).json();
    const res = await fetch(`${base}${path}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': me.csrfToken }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`${path} -> ${res.status}: ${await res.text()}`);
    return res.json();
  }, { base: API_BASE, path, body });
}

// Screens are audited WITH data (an empty state hides most of the interface): two disciplines, units with
// exercises, one overdue so Hoje has a review row, and one practiced so Estatísticas/Acompanhamento have evidence.
async function seed(page) {
  const a = await apiCall(page, '/v1/learning-units', { newSubjectName: 'Fisiologia Renal', title: 'Filtração glomerular', studyDate: '2026-08-01' });
  const b = await apiCall(page, '/v1/learning-units', { newSubjectName: 'Cardiologia', title: 'Ciclo cardíaco', studyDate: '2026-08-02' });
  const exercisesOfA = [];
  for (const unit of [a.unit, b.unit]) {
    for (const i of [1, 2, 3]) {
      const { exercise } = await apiCall(page, `/v1/learning-units/${unit.id}/exercises`, { question: `Pergunta ${i} de ${unit.title}?`, answer: `Resposta ${i}`, explanation: `Porque ${i}.`, provenance: 'MANUAL' });
      if (unit.id === a.unit.id) exercisesOfA.push(exercise);
    }
  }
  const attemptIds = [];
  for (const [index, exercise] of exercisesOfA.entries()) {
    const { attempt } = await apiCall(page, `/v1/exercises/${exercise.id}/attempts`, {});
    await apiCall(page, `/v1/attempts/${attempt.id}/submit`, { outcome: index === 2 ? 'INCORRECT' : 'CORRECT', assessmentMethod: 'SELF_REPORT' });
    attemptIds.push(attempt.id);
  }
  await apiCall(page, '/v1/learning-evidence', { unitId: a.unit.id, type: 'INITIAL_PRACTICE', questionsCount: 3, correctCount: 2, evidenceDate: '2026-08-05', attemptIds });
}

const summarize = (violations) => violations.map((v) => `${v.impact} ${v.id} (${v.nodes.length}): ${v.help} :: ${v.nodes.slice(0, 4).map(detail).join(' | ')}`);

const THEMES = ['paper', 'sepia', 'night', 'contrast'];
const CASES = [
  ...THEMES.map((theme) => ({ theme, width: 1280, height: 800 })),
  { theme: 'paper', width: 375, height: 812 },
];

for (const { theme, width, height } of CASES) {
  test(`axe: no critical/serious violation on any main screen, theme ${theme} at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.addInitScript((id) => { try { localStorage.setItem('smartlearn:theme', id); } catch { /* ignore */ } }, theme);
    await signIn(page);
    await seed(page);
    expect(await page.evaluate(() => document.documentElement.dataset.theme ?? document.documentElement.dataset.themeMode)).toBeTruthy();
    const found = [];
    for (const screen of SCREENS) {
      await page.locator(`.app-nav [data-screen="${screen.id}"]:visible, [data-screen="${screen.id}"]:visible`).first().click();
      await expect(page.locator(`#screen-${screen.id}`)).toBeVisible();
      await page.waitForLoadState('networkidle');
      if (screen.id === 'today') {
        // an opened review row is the densest part of the app: audit it open
        const toggle = page.locator('.review-row .review-row-toggle').first();
        await expect(toggle, 'the seeded overdue review must be on screen, or this audit would be vacuous').toBeVisible({ timeout: 8000 });
        await toggle.click();
        await page.locator('[data-action="reveal-answer"]').first().click();
      }
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      const blocking = result.violations.filter((v) => ['critical', 'serious'].includes(v.impact) && !ACCEPTED[v.id]);
      for (const line of summarize(blocking)) found.push(`[${screen.name}] ${line}`);
    }
    expect(found, found.join('\n')).toEqual([]);
  });
}
