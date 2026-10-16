import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { VITE_ORIGIN, serverPort } from './support/ports.js';
import { signInRegistered } from './support/session.js';

// I18N-PSEUDO: with a catalog that wraps every text in ⟦ ⟧, whatever the real screens still show WITHOUT the marker does not come
// from the catalog: it is either text typed by the student, a number/date, or Portuguese that still lives in the code.
// This is not a translation test (there is no second language yet); it proves where each visible text comes from.

const SERVER_PORT = serverPort(13957);
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));
const OPEN = '\u27E6';
// Texts a screen still shows from outside the catalog, measured on 2026-10-16 (static index.html text, filters, labels).
const BASELINE = { today: 0, plan: 0, stats: 32, tracking: 0, subjects: 0, settings: 47, account: 7 };

let serverProcess;
let dbDir;

test.beforeAll(async () => {
  dbDir = mkdtempSync(join(tmpdir(), 'sl-e2e-pseudo-'));
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: { ...process.env, SMARTLEARN_DB_PATH: join(dbDir, 'e2e.db'), SMARTLEARN_SOURCES_DIR: join(dbDir, 'sources'), PORT: String(SERVER_PORT), HOST: 'localhost', NODE_ENV: 'test', SMARTLEARN_ALLOWED_ORIGINS: VITE_ORIGIN },
    stdio: 'ignore',
  });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${API_BASE}/health/ready`)).status === 200) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('pseudo-locale E2E: real server did not become ready in time');
});

test.afterAll(async () => {
  serverProcess?.kill();
  await new Promise((r) => setTimeout(r, 300));
  rmSync(dbDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

const STUDENT_TEXT = ['ZZPseudo Subject', 'ZZPseudo Unit', 'ZZPseudo question?', 'ZZPseudo answer'];

/** Every visible text (and text-bearing attribute) of one screen that does not carry the marker. */
function untranslatedOf([screenId, studentText]) {
  const root = document.querySelector(screenId);
  if (!root) return { missing: true, found: [] };
  const found = new Set();
  const isStudent = (s) => studentText.some((x) => s.includes(x));
  const prose = (s) => /\p{L}{2,}/u.test(s) && !/^[\d\s:/.,\-–·%()]+$/.test(s);
  const visible = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && cs.display !== 'none' && (r.width > 0 || r.height > 0); };
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!el || ['SCRIPT', 'STYLE', 'OPTION'].includes(el.tagName) || !visible(el)) continue;
    const s = n.nodeValue.replace(/\s+/g, ' ').trim();
    // a date formatted by the active locale, or the commit hash of the build: data, not catalog text
    const isDate = /^(Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day,|^[A-Z][a-z]{2} \d{2}, \d{4}$|^[0-9a-f]{7,40}(\+[a-z]+)?$/.test(s);
    if (prose(s) && !s.includes('\u27E6') && !isStudent(s) && !isDate) found.add(`text: ${s}`);
  }
  for (const el of root.querySelectorAll('[title],[aria-label],[placeholder],[alt]')) {
    if (!visible(el)) continue;
    for (const a of ['title', 'aria-label', 'placeholder', 'alt']) {
      const s = (el.getAttribute(a) ?? '').trim();
      if (s && prose(s) && !s.includes('\u27E6') && !isStudent(s)) found.add(`${a}: ${s}`);
    }
  }
  return { missing: false, found: [...found] };
}

test('pseudo-locale: every visible text of the main screens, and where it comes from', async ({ page }) => {
  await page.addInitScript((base) => { window.__SMARTLEARN_API_BASE__ = base; window.__SMARTLEARN_REMOTE_MODE__ = true; }, API_BASE);
  await signInRegistered(page, { email: `pseudo-${Date.now()}@example.com`, password: 'a genuinely long test password 1' });

  // data the screens can show: a subject, a unit dated far back (reviews overdue) and one exercise
  await page.goto('/#register');
  await page.waitForLoadState('networkidle');
  await page.locator('#show-subject-form').click();
  await page.locator('#new-subject-input').fill(STUDENT_TEXT[0]);
  await page.locator('#new-subject-form button[type="submit"]').click();
  await page.locator('#study-date').fill('2020-01-01');
  await page.locator('#study-content').fill(STUDENT_TEXT[1]);
  await page.locator('#study-form button[type="submit"]').click();
  const row = page.locator('.study-row', { hasText: STUDENT_TEXT[1] });
  await expect(row).toBeVisible({ timeout: 5000 });
  await row.getByRole('button', { name: 'Exercícios' }).click();
  await row.locator('.exercise-question-input').fill(STUDENT_TEXT[2]);
  await row.locator('.exercise-answer-input').fill(STUDENT_TEXT[3]);
  await row.getByRole('button', { name: 'Adicionar exercício' }).click();
  await expect(row.getByText(STUDENT_TEXT[2])).toBeVisible({ timeout: 5000 });

  // switch the interface to the marked catalog, then render every screen again
  await page.evaluate(async () => {
    const i18n = await import('/src/i18n/index.js');
    const ptBR = (await import('/src/i18n/locales/pt-BR.js')).default;
    i18n.registerCatalog('en', Object.fromEntries(Object.entries(ptBR).map(([k, v]) => [k, `\u27E6${v}\u27E7`])));
    i18n.setLocale('en');
    (await import('/src/i18n/dom.js')).applyStaticTexts(document);
    // the custom select widgets copied their labels when they were built: ask them to read the new ones
    const { syncSelect } = await import('/src/select-ui.js');
    for (const select of document.querySelectorAll('select')) syncSelect(select);
  });

  const report = {};
  for (const screen of ['today', 'plan', 'stats', 'tracking', 'subjects', 'settings', 'account']) {
    await page.locator(`[data-screen="${screen}"]`).click();
    await expect(page.locator(`#screen-${screen}`)).toBeVisible();
    await page.waitForTimeout(400);
    report[screen] = await page.evaluate(untranslatedOf, [`#screen-${screen}`, STUDENT_TEXT]);
  }
  console.log('PSEUDO_COUNTS ' + JSON.stringify(Object.fromEntries(Object.entries(report).map(([screen, { found }]) => [screen, found.length]))));
  if (process.env.PSEUDO_VERBOSE) for (const [screen, { found }] of Object.entries(report)) console.log(`PSEUDO_FOUND ${screen}\n  ${found.join('\n  ')}`);
  // The ratchet: a screen may show fewer texts outside the catalog than this, never more. Lower a number when a slice of
  // index.html / app.js moves its texts to the catalog; the failure message lists what is still in the code.
  for (const [screen, { found }] of Object.entries(report)) {
    expect(found.length, `${screen} shows ${found.length} texts outside the catalog (limit ${BASELINE[screen]}):\n${found.join('\n')}`).toBeLessThanOrEqual(BASELINE[screen]);
  }
  expect(Object.keys(report).sort()).toEqual(Object.keys(BASELINE).sort());
  // the marker only exists if t() was used for a screen: a baseline of "everything outside" would pass the ratchet by itself
  expect(await page.locator('#screen-today').innerText()).toContain(OPEN);
  // dates follow the active locale, not a fixed pt-BR (I-R3): the pseudo locale is registered as "en"
  expect(await page.locator('#screen-today').innerText()).toMatch(/October|November|December|January|February|March|April|May|June|July|August|September/);
});
