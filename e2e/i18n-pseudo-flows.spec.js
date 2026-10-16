import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildFixturePdf } from '../server/test/pdf-fixtures/build-fixture-pdf.js';
import { VITE_ORIGIN, serverPort } from './support/ports.js';
import { signInRegistered } from './support/session.js';

// I18N-PSEUDO-FLOWS: the companion of e2e/i18n-pseudo-locale.spec.js for the screens that only exist WITH DATA (an expanded review,
// a practice pass, an exam, statistics after evidence, an expanded plan row, the Cadastro editors, Materiais). The app boots in the
// same marked catalog (every catalog value wrapped in U+27E6 ... U+27E7); whatever a state still shows WITHOUT the marker is student
// text, a number/date, a documented technical exception, or Portuguese that still lives in the code.
// FLOW_COUNTS is printed, FLOW_FOUND/FLOW_MIXED with PSEUDO_VERBOSE=1; the test FAILS when any state shows a text outside the catalog.

const SERVER_PORT = serverPort(13958);
const API_BASE = `http://localhost:${SERVER_PORT}`;
const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));

let serverProcess;
let dataDir;

test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'sl-e2e-pseudo-flows-'));
  serverProcess = spawn(process.execPath, [MAIN_JS], {
    env: { ...process.env, SMARTLEARN_DB_PATH: join(dataDir, 'e2e.db'), SMARTLEARN_SOURCES_DIR: join(dataDir, 'sources'), PORT: String(SERVER_PORT), HOST: 'localhost', NODE_ENV: 'test', SMARTLEARN_ALLOWED_ORIGINS: VITE_ORIGIN },
    stdio: 'ignore',
  });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${API_BASE}/health/ready`)).status === 200) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('pseudo-flows E2E: real server did not become ready in time');
});

test.afterAll(async () => {
  serverProcess?.kill();
  await new Promise((r) => setTimeout(r, 300));
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

// Every text the student types in this spec starts with "ZZFlow" (the exact strings are listed so the report can also tell a
// hard-coded label glued to a student text apart from the student text itself: see FLOW_MIXED).
const HOJE = { subject: 'ZZFlow Hoje Disciplina', unit: 'ZZFlow Hoje Aula', source: 'ZZFlow Fonte Hoje' };
const HOJE_Q = [
  { question: 'ZZFlow Hoje pergunta A?', answer: 'ZZFlow Hoje resposta A', hint: 'ZZFlow Hoje dica A', explanation: 'ZZFlow Hoje porque A' },
  { question: 'ZZFlow Hoje pergunta B?', answer: 'ZZFlow Hoje resposta B', hint: null, explanation: null },
];
const ESTUDO = { subject: 'ZZFlow Estudo Disciplina', unit: 'ZZFlow Estudo Aula', summary: 'ZZFlow Estudo resumo mestre' };
const ESTUDO_Q = [1, 2, 3].map((i) => ({ question: `ZZFlow Estudo pergunta ${i}?`, answer: `ZZFlow Estudo resposta ${i}`, hint: null, explanation: `ZZFlow Estudo porque ${i}` }));
const PROVA = { subject: 'ZZFlow Prova Disciplina', unit: 'ZZFlow Prova Aula' };
const PROVA_Q = [1, 2, 3].map((i) => ({ question: `ZZFlow Prova pergunta ${i}?`, answer: `ZZFlow Prova gabarito ${i}`, hint: null, explanation: i === 1 ? 'ZZFlow Prova porque 1' : null }));
const TYPED_ANSWERS = ['ZZFlow minha resposta 1', 'ZZFlow minha resposta 2'];
const STUDENT_TEXT = [
  ...[HOJE, ESTUDO, PROVA].flatMap((x) => Object.values(x)),
  ...[...HOJE_Q, ...ESTUDO_Q, ...PROVA_Q].flatMap((q) => [q.question, q.answer, q.hint, q.explanation].filter(Boolean)),
  ...TYPED_ANSWERS,
];

/**
 * Every visible text (and text-bearing attribute) under `selector` that does not carry the marker. Copied from
 * e2e/i18n-pseudo-locale.spec.js (a spec cannot import another one) with two additions that do not change what is counted there:
 * `marked` (how many text nodes DO carry the marker: a state with none would mean the measurement itself is wrong) and `mixed`
 * (texts that contain a student text AND something else unmarked, e.g. a hard-coded label glued to the student's words: the
 * student-text exemption hides them from `found`).
 */
function untranslatedOf([selector, studentText]) {
  const root = document.querySelector(selector);
  if (!root) return { missing: true, found: [], mixed: [], marked: 0 };
  const found = new Set();
  const mixed = new Set();
  let marked = 0;
  const isStudent = (s) => studentText.some((x) => s.includes(x));
  const withoutStudent = (s) => studentText.reduce((rest, x) => rest.split(x).join(' '), s).replace(/\s+/g, ' ').trim();
  const prose = (s) => /\p{L}{2,}/u.test(s) && !/^[\d\s:/.,\-–·%()]+$/.test(s);
  const visible = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && cs.display !== 'none' && (r.width > 0 || r.height > 0); };
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!el || ['SCRIPT', 'STYLE', 'OPTION'].includes(el.tagName) || !visible(el)) continue;
    const s = n.nodeValue.replace(/\s+/g, ' ').trim();
    if (s.includes('\u27E6')) { marked += 1; continue; }
    // Not catalog text, on purpose: a date formatted by the active locale, the commit hash and channel of the build, and the
    // name of each language written in that language (autonyms never change with the interface language).
    const isDate = /^(Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day,|^[A-Z][a-z]{2} \d{2}, \d{4}$|^[0-9a-f]{7,40}(\+[a-z]+)?$|^(DEV|PROD)$|^SmartLearn (DEV|PROD) · v[0-9.]+ · \S+$|^(Português \(Brasil\)|Español|English)$/.test(s);
    if (!prose(s) || isDate) continue;
    if (!isStudent(s)) found.add(`text: ${s}`);
    else { const rest = withoutStudent(s); if (prose(rest)) mixed.add(`text: ${s}`); }
  }
  for (const el of root.querySelectorAll('[title],[aria-label],[placeholder],[alt]')) {
    if (!visible(el)) continue;
    for (const a of ['title', 'aria-label', 'placeholder', 'alt']) {
      const s = (el.getAttribute(a) ?? '').trim();
      if (!s || !prose(s) || s.includes('\u27E6')) continue;
      if (!isStudent(s)) found.add(`${a}: ${s}`);
      else if (prose(withoutStudent(s))) mixed.add(`${a}: ${s}`);
    }
  }
  return { missing: false, found: [...found], mixed: [...mixed], marked };
}

// The app registers an app-shell service worker that would answer the module requests itself and bypass the interception below;
// this test is about where the TEXTS come from, not about offline behavior.
test.use({ serviceWorkers: 'block' });

/** A NEW page of the same context (same session) whose i18n module is served with the marked catalog as the active locale. */
async function openPseudoPage(context, { localAuthority = false } = {}) {
  const pseudo = await context.newPage();
  await pseudo.addInitScript(({ base, local }) => {
    window.__SMARTLEARN_API_BASE__ = base;
    window.__SMARTLEARN_REMOTE_MODE__ = true;
    if (local) window.__SMARTLEARN_LOCAL_AUTHORITY__ = true;
  }, { base: API_BASE, local: localAuthority });
  const counter = { served: 0 };
  await pseudo.route(/\/src\/i18n\/index\.js/, async (route) => {
    const response = await route.fetch();
    const tail = `\nregisterCatalog('en', Object.fromEntries(Object.entries(ptBR).map(([key, value]) => [key, '\\u27E6' + value + '\\u27E7'])));\nsetLocale('en');\n`;
    counter.served += 1;
    await route.fulfill({ response, body: (await response.text()) + tail });
  });
  await pseudo.goto('/');
  await pseudo.waitForLoadState('networkidle');
  expect(counter.served, 'the i18n module must have been served with the pseudo catalog, or this test measures nothing').toBeGreaterThan(0);
  return { pseudo, counter };
}

async function apiCall(page, path, body) {
  return page.evaluate(async ({ base, path, body }) => {
    const me = await (await fetch(`${base}/v1/auth/me`, { credentials: 'include' })).json();
    const res = await fetch(`${base}${path}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': me.csrfToken }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`${path} -> ${res.status}: ${await res.text()}`);
    return res.json();
  }, { base: API_BASE, path, body });
}

async function seedUnit(page, { subject, unit, source, summary, studyDate }, questions) {
  const { unit: created } = await apiCall(page, '/v1/learning-units', { newSubjectName: subject, title: unit, sourceText: source ?? null, summaryBody: summary ?? null, studyDate });
  for (const q of questions) {
    await apiCall(page, `/v1/learning-units/${created.id}/exercises`, { question: q.question, answer: q.answer, hint: q.hint, explanation: q.explanation, provenance: 'MANUAL' });
  }
  return created;
}

/** The states this spec must reach, in the order they are measured. */
const STATES = [
  'today_row_open', 'today_revealed', 'today_block', 'today_external', 'retest_question', 'retest_result', 'today_after_retest', 'today_review_done',
  'study_question', 'study_revealed', 'study_resume', 'study_result_errors', 'study_retest_question', 'study_result_corrected',
  'exam_question', 'exam_submit_warning', 'exam_correction', 'exam_judged', 'exam_final',
  'stats_subject', 'stats_unit', 'stats_exercise_detail',
  'plan_expanded', 'tracking_row',
  'register_lists', 'register_exercise_edit', 'register_study_edit', 'register_subject_edit',
  'materials_initial', 'materials_proposals',
];

test('pseudo-locale: the texts of the data-driven states, and where they come from', async ({ page, context }) => {
  test.setTimeout(300000);
  await page.addInitScript((base) => { window.__SMARTLEARN_API_BASE__ = base; window.__SMARTLEARN_REMOTE_MODE__ = true; }, API_BASE);
  await signInRegistered(page, { email: `pseudo-flows-${Date.now()}@example.com`, password: 'a genuinely long test password 1' });

  // Data (through the same API the UI uses): a unit dated far back (reviews overdue), a unit to practice and a unit to take an exam on.
  await seedUnit(page, { ...HOJE, studyDate: '2020-01-01' }, HOJE_Q);
  await seedUnit(page, { ...ESTUDO, studyDate: '2030-01-01' }, ESTUDO_Q);
  await seedUnit(page, { ...PROVA, studyDate: '2026-04-01' }, PROVA_Q);

  const { pseudo, counter } = await openPseudoPage(context);
  const servedPages = [counter];
  const report = {};
  const measure = async (state, selector, reached) => {
    await expect(reached, `state ${state} was not reached`).toBeVisible({ timeout: 8000 });
    await pseudo.waitForTimeout(400);
    const result = await pseudo.evaluate(untranslatedOf, [selector, STUDENT_TEXT]);
    expect(result.missing, `state ${state}: ${selector} does not exist`).toBe(false);
    report[state] = result;
  };
  const nav = (screen) => pseudo.locator(`[data-screen="${screen}"]`).click();
  /** Plano re-renders after it loads: retry "open the row and see its buttons" until the detail really exists. */
  const openPlanRow = async (title, buttonSelector) => {
    await nav('plan');
    const row = pseudo.locator('.plan-row', { hasText: title });
    await expect(async () => {
      if ((await row.locator('.plan-expand-btn').getAttribute('aria-expanded', { timeout: 1500 })) !== 'true') await row.locator('.plan-expand-btn').click({ timeout: 1500 });
      await expect(row.locator(buttonSelector).first()).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 15000 });
    return row;
  };

  // ---- 1. Hoje with an overdue review expanded, answers revealed and judged --------------------------------------------------
  await nav('today');
  const firstRow = pseudo.locator('.review-row', { hasText: HOJE.unit }).first();
  await expect(firstRow).toBeVisible({ timeout: 8000 });
  const reviewId = await firstRow.getAttribute('data-review-id');
  const row = pseudo.locator(`.review-row[data-review-id="${reviewId}"]`);
  await row.locator('.review-row-toggle').click();
  const item = (q) => row.locator('.review-exercise-item', { hasText: q });
  await measure('today_row_open', '#screen-today', item(HOJE_Q[0].question));
  await item(HOJE_Q[0].question).locator('[data-action="reveal-answer"]').click();
  await measure('today_revealed', '#screen-today', item(HOJE_Q[0].question).locator('[data-action="exercise-errei"]'));
  await item(HOJE_Q[0].question).locator('[data-action="exercise-errei"]').click();
  await item(HOJE_Q[1].question).locator('[data-action="reveal-answer"]').click();
  await item(HOJE_Q[1].question).locator('[data-action="exercise-acertei"]').click();
  await measure('today_block', '#screen-today', row.locator('.review-block-result [data-action="retest-block"]'));
  await row.locator('[data-action="toggle-external"]').click();
  await measure('today_external', '#screen-today', row.locator('.external-exercise-form'));
  await row.locator('[data-action="toggle-external"]').click();

  // the retest of the wrong item, through the shared flow ("Refazer erros")
  await row.locator('.review-block-result [data-action="retest-block"]').click();
  await measure('retest_question', '#screen-study-now', pseudo.locator('#study-now-reveal-btn'));
  await pseudo.locator('#study-now-reveal-btn').click();
  await pseudo.locator('#study-now-correct-btn').click();
  await measure('retest_result', '#screen-study-now', pseudo.locator('#study-now-result-card'));
  await pseudo.locator('#study-now-done-btn').click();
  await measure('today_after_retest', '#screen-today', row.locator('.review-block-result'));
  // completing the review records the evidence (the original 1/2) that Estatisticas needs
  await row.locator('input[data-action="review-done"]').check();
  const doneRow = pseudo.locator(`[data-review-list="doneToday"] .review-row[data-review-id="${reviewId}"]`);
  await measure('today_review_done', '#screen-today', doneRow);

  // ---- 2. Estudar agora: question, interruption + resume prompt, errors, retest, corrected list -------------------------------
  const studyRow = await openPlanRow(ESTUDO.unit, '[data-action="plan-study-now"]');
  await studyRow.locator('[data-action="plan-study-now"]').click();
  await expect(pseudo.locator('#study-now-question-text')).toHaveText(ESTUDO_Q[0].question);
  await measure('study_question', '#screen-study-now', pseudo.locator('#study-now-reveal-btn'));
  await pseudo.locator('#study-now-reveal-btn').click();
  await measure('study_revealed', '#screen-study-now', pseudo.locator('#study-now-incorrect-btn'));
  await pseudo.locator('#study-now-incorrect-btn').click(); // question 1 judged WRONG
  await expect(pseudo.locator('#study-now-question-text')).toHaveText(ESTUDO_Q[1].question);
  await pseudo.locator('#study-now-reveal-btn').click();    // question 2 revealed, never judged
  const again = await openPlanRow(ESTUDO.unit, '[data-action="plan-study-now"]'); // leaving the pass in the middle
  await again.locator('[data-action="plan-study-now"]').click();
  await measure('study_resume', '#screen-study-now', pseudo.locator('#study-now-resume'));
  await pseudo.locator('#study-now-resume-continue').click();
  await expect(pseudo.locator('#study-now-question-text')).toHaveText(ESTUDO_Q[1].question);
  await pseudo.locator('#study-now-reveal-btn').click();
  await pseudo.locator('#study-now-correct-btn').click();
  await expect(pseudo.locator('#study-now-question-text')).toHaveText(ESTUDO_Q[2].question);
  await pseudo.locator('#study-now-reveal-btn').click();
  await pseudo.locator('#study-now-incorrect-btn').click(); // question 3 judged WRONG: two errors to redo
  await measure('study_result_errors', '#screen-study-now', pseudo.locator('#study-now-errors-section'));
  await pseudo.locator('#study-now-retest-btn').click();
  await measure('study_retest_question', '#screen-study-now', pseudo.locator('#study-now-reveal-btn'));
  await pseudo.locator('#study-now-reveal-btn').click();
  await pseudo.locator('#study-now-correct-btn').click();   // first error corrected
  await pseudo.locator('#study-now-reveal-btn').click();
  await pseudo.locator('#study-now-incorrect-btn').click(); // second error still wrong: both lists are drawn
  await measure('study_result_corrected', '#screen-study-now', pseudo.locator('#study-now-corrected-section'));
  await pseudo.locator('#study-now-done-btn').click();

  // ---- 3. Prova ---------------------------------------------------------------------------------------------------------------
  const examRow = await openPlanRow(PROVA.unit, '[data-action="plan-exam"]');
  await examRow.locator('[data-action="plan-exam"]').click();
  await expect(pseudo.locator('#exam-progress')).toBeVisible();
  await measure('exam_question', '#screen-exam', pseudo.locator('#exam-taking'));
  await pseudo.locator('#exam-answer-input').fill(TYPED_ANSWERS[0]);
  await pseudo.locator('#exam-next-btn').click();
  await pseudo.locator('#exam-answer-input').fill(TYPED_ANSWERS[1]);
  await pseudo.locator('#exam-submit-btn').click(); // the third question stays blank on purpose
  await measure('exam_submit_warning', '#screen-exam', pseudo.locator('#exam-submit-warning'));
  await pseudo.locator('#exam-submit-confirm-btn').click();
  const items = pseudo.locator('.exam-review-item');
  await expect(items).toHaveCount(3, { timeout: 8000 });
  await measure('exam_correction', '#screen-exam', pseudo.locator('#exam-submitted'));
  await items.nth(0).locator('.exam-correct-btn').click();
  await items.nth(1).locator('.exam-wrong-btn').click();
  await items.nth(2).locator('.exam-wrong-btn').click();
  await measure('exam_judged', '#screen-exam', pseudo.locator('#exam-result-score'));
  await pseudo.locator('#exam-finalize-btn').click();
  await measure('exam_final', '#screen-exam', pseudo.locator('#exam-final-note'));

  // ---- 4. Estatisticas after evidence exists ------------------------------------------------------------------------------------
  await nav('stats');
  await expect(pseudo.locator('#metric-questions')).not.toHaveText('0', { timeout: 8000 });
  await measure('stats_subject', '#screen-stats', pseudo.locator('#stats-verdict'));
  await pseudo.locator('#tab-stats-unit').click();
  await measure('stats_unit', '#screen-stats', pseudo.locator('#view-stats-unit'));
  const exerciseRow = pseudo.locator('#exercise-notes-body .exercise-row').first();
  await expect(exerciseRow).toBeVisible({ timeout: 8000 });
  await exerciseRow.click();
  await measure('stats_exercise_detail', '#exercise-detail-dialog', pseudo.locator('#exercise-detail-dialog .exercise-attempt-item').first());
  await pseudo.locator('#exercise-detail-close').click();

  // ---- 5. Plano with the unit rows expanded, Acompanhamento with its rows -----------------------------------------------------------
  await openPlanRow(PROVA.unit, '.plan-exercise-item');
  await openPlanRow(ESTUDO.unit, '.plan-exercise-item');
  await measure('plan_expanded', '#screen-plan', pseudo.locator('.plan-row', { hasText: ESTUDO.unit }).locator('.plan-evidence-list li').first());
  await nav('tracking');
  await measure('tracking_row', '#screen-tracking', pseudo.locator('.tracking-card').first());

  // ---- 6. Cadastro: the lists expanded and every inline editor open --------------------------------------------------------------------
  await pseudo.evaluate(() => { window.location.hash = '#register'; });
  await expect(pseudo.locator('#screen-register')).toBeVisible();
  const studyEntry = pseudo.locator('.study-row', { hasText: HOJE.unit });
  await expect(studyEntry).toBeVisible({ timeout: 8000 });
  await studyEntry.locator('[data-action="toggle-exercises"]').click();
  await expect(studyEntry.locator('.exercise-item').first()).toBeVisible({ timeout: 8000 });
  await measure('register_lists', '#screen-register', pseudo.locator('#subject-list .subject-row').first());
  await studyEntry.locator('.exercise-item [data-action="edit-exercise"]').first().click();
  await measure('register_exercise_edit', '#screen-register', studyEntry.locator('.exercise-item-edit'));
  await studyEntry.locator('[data-action="cancel-exercise-edit"]').click();
  await studyEntry.locator('[data-action="edit-study"]').click();
  await measure('register_study_edit', '#screen-register', pseudo.locator('.study-row.is-editing'));
  await pseudo.locator('.study-row.is-editing [data-action="cancel-study"]').click();
  await pseudo.locator('.subject-row [data-action="edit-subject"]').first().click();
  await measure('register_subject_edit', '#screen-register', pseudo.locator('.subject-row.is-editing'));
  await pseudo.locator('.subject-row.is-editing [data-action="cancel-subject"]').click();

  // ---- 7. Materiais (only exists with PDF authority): the initial state, then the proposals of a real (fixture) PDF -----------------------
  const local = await openPseudoPage(context, { localAuthority: true });
  servedPages.push(local.counter);
  const materials = local.pseudo;
  await materials.locator('[data-screen="materials"]').click();
  await expect(materials.locator('#sources-card')).toBeVisible({ timeout: 8000 });
  await materials.waitForTimeout(400);
  report.materials_initial = await materials.evaluate(untranslatedOf, ['#screen-materials', STUDENT_TEXT]);
  await materials.setInputFiles('#sources-file-input', { name: 'ZZFlow-material.pdf', mimeType: 'application/pdf', buffer: buildFixturePdf(['ZZFlow Farmacocinetica: absorcao e distribuicao de farmacos.']) });
  await expect(materials.locator('#sources-proposals-panel')).toBeVisible({ timeout: 15000 });
  await expect(materials.locator('#sources-proposals-list li').first()).toBeAttached({ timeout: 8000 });
  await materials.waitForTimeout(400);
  report.materials_proposals = await materials.evaluate(untranslatedOf, ['#screen-materials', STUDENT_TEXT]);

  // ---- report -----------------------------------------------------------------------------------------------------------------------------
  console.log('FLOW_COUNTS ' + JSON.stringify(Object.fromEntries(STATES.map((state) => [state, report[state]?.found.length]))));
  console.log('FLOW_MARKED ' + JSON.stringify(Object.fromEntries(STATES.map((state) => [state, report[state]?.marked]))));
  if (process.env.PSEUDO_VERBOSE) {
    for (const state of STATES) console.log(`FLOW_FOUND ${state}\n  ${(report[state]?.found ?? []).join('\n  ')}`);
    for (const state of STATES) if (report[state]?.mixed.length) console.log(`FLOW_MIXED ${state}\n  ${report[state].mixed.join('\n  ')}`);
  }

  // (a) the pseudo module was actually served for every page measured, (b) every state was reached and measured
  for (const served of servedPages) expect(served.served).toBeGreaterThan(0);
  expect(Object.keys(report).sort()).toEqual([...STATES].sort());
  for (const state of STATES) expect(report[state].missing, `state ${state} was measured on a missing root`).toBe(false);

  // (c) the ratchet is ZERO: nothing the student sees in these states may come from outside the catalog. Two things are not
  // catalog text on purpose: a date shown as a tooltip (formatted by the active locale, the text-node exemption does not cover
  // attributes) and the file name the student uploaded.
  const NOT_CATALOG = (text) => /^(title|aria-label): [A-Z][a-z]{2} \d{2}, \d{4}$/.test(text) || text.includes('ZZFlow');
  for (const state of STATES) {
    const outside = report[state].found.filter((text) => !NOT_CATALOG(text));
    expect(outside, `state ${state} shows texts that do not come from the catalog`).toEqual([]);
    // a state measured on an almost empty screen would pass this ratchet by itself
    expect(report[state].marked, `state ${state} has no catalog text at all: the measurement is not looking at the screen`).toBeGreaterThan(0);
  }
});
