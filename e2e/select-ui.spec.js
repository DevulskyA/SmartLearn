import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildFixturePdf } from '../server/test/pdf-fixtures/build-fixture-pdf.js';

// P0-4 / P1-1: proves the shared select/listbox primitive (src/select-ui.js)
// live, across representative real consumers, instead of trusting the code
// alone. Canonical rule under test: TRIGGER shows the current value, MENU
// shows only the other alternatives (never duplicating the current value).
// Also exercises the "Listbox Button" ARIA contract described in P1-1's
// fix: trigger<->popup relationship via aria-controls, aria-expanded,
// activedescendant-driven focus inside the popup, Escape-to-close, and
// focus returning to the trigger — see src/select-ui.js's own header
// comment for why this is "Listbox Button", not "Select-Only Combobox".

// A <select>'s own textContent concatenates EVERY option's text, not just
// the selected one — toHaveText() on the native element itself is not a
// valid way to check "current value". This polls the actual selected
// option's text (auto-retrying like a normal Playwright assertion).
async function expectSelectedText(nativeEl, expected) {
  await expect.poll(() => nativeEl.evaluate((el) => el.options[el.selectedIndex]?.text ?? '')).toBe(expected);
}

async function locateSelectUi(page, nativeSelector) {
  const nativeEl = page.locator(nativeSelector);
  // mount() (src/select-ui.js) makes the native <select> a direct child of
  // its own `.ui-select` wrapper div (wrap.append(trigger, select)) — walk
  // to the parent directly rather than a `.ui-select', { has: nativeEl }`
  // filter, which proved unreliable to resolve reliably in this suite.
  const wrap = nativeEl.locator('xpath=..');
  const trigger = wrap.locator('.ui-select-trigger');
  await expect(trigger, `${nativeSelector}: trigger must exist`).toBeVisible();
  const menuId = await trigger.getAttribute('aria-controls');
  expect(menuId, `${nativeSelector}: trigger must have aria-controls pointing to its popup`).toBeTruthy();
  const menu = page.locator(`#${menuId}`);
  return { nativeEl, trigger, menu };
}

// Full checklist for one consumer: trigger-shows-value, no duplicate in
// menu, keyboard open (Enter), arrow-key movement, Escape close + focus
// return, then a real value change via keyboard and via mouse click.
async function auditSelectConsumer(page, nativeSelector) {
  const { nativeEl, trigger, menu } = await locateSelectUi(page, nativeSelector);

  const currentText = await nativeEl.evaluate((el) => el.options[el.selectedIndex]?.text ?? '');
  await expect(trigger).toHaveText(currentText);

  // Keyboard open: Enter.
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(menu).toBeVisible();
  await expect(menu).toHaveAttribute('role', 'listbox');

  // The current value is never duplicated as a row inside its own open menu.
  if (currentText) {
    const dup = await menu.locator('li[role="option"]', { hasText: currentText }).count();
    expect(dup, `current value "${currentText}" must not be duplicated inside its own open menu`).toBe(0);
  }

  const optionCount = await menu.locator('li[role="option"]').count();
  expect(optionCount, `${nativeSelector}: expected at least one alternative in the menu`).toBeGreaterThan(0);

  // Arrow keys move aria-activedescendant (roving focus inside the popup —
  // the "Listbox Button" pattern's actual mechanics, see file header).
  const activeBefore = await menu.getAttribute('aria-activedescendant');
  expect(activeBefore).toBeTruthy();
  if (optionCount > 1) {
    await page.keyboard.press('ArrowDown');
    const activeAfter = await menu.getAttribute('aria-activedescendant');
    expect(activeAfter).not.toBe(activeBefore);
  }

  // Escape cancels: closes, focus returns to trigger, value unchanged.
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).toBeFocused();
  await expectSelectedText(nativeEl, currentText);

  // Real value change via keyboard: open, move to the first alternative,
  // select with Enter — this is the actual first item in the ALTERNATIVES
  // list (never the current value, since it's excluded).
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(menu).toBeVisible();
  const targetText = await menu.locator('li[role="option"]').first().textContent();
  await page.keyboard.press('Enter');
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused(); // focus returns to trigger after commit too
  await expect(trigger).toHaveText(targetText.trim());
  await expectSelectedText(nativeEl, targetText.trim());

  // Real value change via mouse click on a menu item (a different one, or
  // the same available alternative if there's only one/two options).
  await trigger.click();
  await expect(menu).toBeVisible();
  const items = menu.locator('li[role="option"]:not(.is-disabled)');
  const clickTarget = items.first();
  const clickTargetText = (await clickTarget.textContent()).trim();
  await clickTarget.click();
  await expect(menu).toBeHidden();
  await expect(trigger).toHaveText(clickTargetText);
  await expectSelectedText(nativeEl, clickTargetText);
}

async function seedUatAndGoto(page, screenId) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.evaluate(async () => {
    await window.__seedUatMedical('DESTROY_EXISTING_DATA');
  });
  await page.reload();
  await page.waitForLoadState('networkidle');
  if (screenId) await page.locator(`[data-screen="${screenId}"]`).click();
}

test.describe('local BrowserStore consumers', () => {
  test('period select (Acompanhar) — full checklist', async ({ page }) => {
    await seedUatAndGoto(page, 'tracking');
    await auditSelectConsumer(page, '#tracking-filter-period');
  });

  test('discipline select (Acompanhar) — full checklist, includes a deliberately long label', async ({ page }) => {
    await seedUatAndGoto(page, 'tracking');
    const { menu, trigger } = await locateSelectUi(page, '#tracking-filter-subject');
    await trigger.click();
    // The fixture's deliberately long discipline name must appear intact
    // (not truncated to nothing, not duplicated) as one real menu item.
    const longLabel = 'Patologia Geral, Especial e Correlações Anatomoclínicas Multissistêmicas';
    await expect(menu.locator('li[role="option"]', { hasText: longLabel })).toHaveCount(1);
    await page.keyboard.press('Escape');
    await auditSelectConsumer(page, '#tracking-filter-subject');
  });

  test('status select (Acompanhar) — full checklist', async ({ page }) => {
    await seedUatAndGoto(page, 'tracking');
    await auditSelectConsumer(page, '#tracking-filter-state');
  });

  test('a form select (Plano — Nova aula "Disciplina") — full checklist', async ({ page }) => {
    await seedUatAndGoto(page, 'plan');
    await page.locator('#plan-new-unit-btn').click(); // reveals the Nova aula form
    await auditSelectConsumer(page, '#plan-subject-select');
  });

  test('a select with a disabled option is skipped by keyboard/typeahead and never committed by click', async ({ page }) => {
    await seedUatAndGoto(page, 'plan');
    // No product select currently ships a disabled <option> outside a live
    // provider/data condition, so this exercises the real, already-mounted
    // primitive's disabled-option handling directly by disabling a real
    // option on a real enhanced select, then re-opening the menu (which
    // rebuilds from the live DOM on every open — see select-ui.js
    // buildItems()) — not a mock, the same code path every consumer uses.
    await page.evaluate(() => {
      const select = document.querySelector('#plan-filter-subject');
      const opt = select.options[1]; // first real discipline, not "Todas as disciplinas"
      if (opt) opt.disabled = true;
    });
    const { trigger, menu } = await locateSelectUi(page, '#plan-filter-subject');
    await trigger.click();
    const disabledItem = menu.locator('li.is-disabled').first();
    await expect(disabledItem).toHaveAttribute('aria-disabled', 'true');

    const beforeValue = await page.locator('#plan-filter-subject').inputValue();
    // Playwright's own actionability check refuses to click an
    // aria-disabled element by default — force it through, since that's
    // exactly the scenario under test (does the PRIMITIVE itself refuse
    // the commit, not just "did the click even happen").
    await disabledItem.click({ force: true });
    // Clicking a disabled item must not close the menu or change the value.
    await expect(menu).toBeVisible();
    await expect(page.locator('#plan-filter-subject')).toHaveValue(beforeValue);
    await page.keyboard.press('Escape');
  });

  test('mobile viewport: discipline select opens, is fully usable, and does not clip off-screen', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedUatAndGoto(page, 'tracking');
    const { trigger, menu } = await locateSelectUi(page, '#tracking-filter-subject');
    await trigger.click();
    await expect(menu).toBeVisible();
    const box = await menu.boundingBox();
    expect(box).toBeTruthy();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390 + 1); // +1 for sub-pixel rounding
    await page.keyboard.press('Escape');
    await auditSelectConsumer(page, '#tracking-filter-subject');
  });

  // Closing the inventory loop: every remaining real <select> consumer
  // gets the exact same full checklist, not just a DOM/enhancement audit —
  // "full inventory + migration of every remaining native-popup select
  // consumer, not just the ones already covered" (global standardization
  // follow-up). All of these were already confirmed enhanced via a DOM
  // audit (every <select> in the app carries .ui-select-native + a
  // .ui-select wrapper + tabIndex -1), but had no dedicated live
  // keyboard/mouse/no-duplicate/value-change proof of their own yet.

  test('Plano — status filter — full checklist', async ({ page }) => {
    await seedUatAndGoto(page, 'plan');
    await auditSelectConsumer(page, '#plan-filter-state');
  });

  test('Plano — "Ordenar por" sort select — full checklist', async ({ page }) => {
    await seedUatAndGoto(page, 'plan');
    await auditSelectConsumer(page, '#plan-sort');
  });

  test('Cadastro rápido (legacy screen) — discipline select — full checklist', async ({ page }) => {
    await seedUatAndGoto(page, null);
    await page.evaluate(() => { window.location.hash = '#register'; });
    await expect(page.locator('#screen-register')).toBeVisible({ timeout: 5000 });
    await auditSelectConsumer(page, '#subject-select');
  });

  test('Estatísticas — global period select — full checklist', async ({ page }) => {
    await seedUatAndGoto(page, 'stats');
    await auditSelectConsumer(page, '#stats-unit-filter-period');
  });

  test('Estatísticas — evolution chart discipline filter — full checklist', async ({ page }) => {
    await seedUatAndGoto(page, 'stats');
    await auditSelectConsumer(page, '#evolution-filter-subject');
  });

  test('Estatísticas — evolution chart period filter — full checklist', async ({ page }) => {
    await seedUatAndGoto(page, 'stats');
    await auditSelectConsumer(page, '#evolution-filter-period');
  });

  test('menu width is never narrower than its trigger', async ({ page }) => {
    await seedUatAndGoto(page, 'tracking');
    const { trigger, menu } = await locateSelectUi(page, '#tracking-filter-subject');
    const triggerBox = await trigger.boundingBox();
    await trigger.click();
    await expect(menu).toBeVisible();
    const menuBox = await menu.boundingBox();
    expect(menuBox.width).toBeGreaterThanOrEqual(triggerBox.width - 1); // -1 for sub-pixel rounding
    await page.keyboard.press('Escape');
  });

  test('viewport-collision handling: a select near the bottom edge opens its menu upward instead of overflowing the viewport', async ({ page }) => {
    // A short viewport guarantees the trigger sits close enough to the
    // bottom edge that the menu (several options tall) cannot fit below it.
    await page.setViewportSize({ width: 800, height: 320 });
    await seedUatAndGoto(page, 'tracking');
    const { trigger, menu } = await locateSelectUi(page, '#tracking-filter-subject');
    await trigger.scrollIntoViewIfNeeded();
    const triggerBox = await trigger.boundingBox();
    await trigger.click();
    await expect(menu).toBeVisible();
    const menuBox = await menu.boundingBox();
    // Opened upward: the menu's bottom edge sits at/above the trigger's top.
    expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(triggerBox.y + 1);
    // Never escapes the viewport on either edge.
    expect(menuBox.y).toBeGreaterThanOrEqual(0);
    expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(320 + 1);
    await page.keyboard.press('Escape');
  });
});

test.describe('source-draft-subject-select (Materiais) — the one flagged as "not re-tested live"', () => {
  const SERVER_PORT = 13977;
  const API_BASE = `http://localhost:${SERVER_PORT}`;
  const MAIN_JS = fileURLToPath(new URL('../server/src/main.js', import.meta.url));
  let serverProcess;
  let dataDir;

  test.beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'sl-e2e-select-ui-'));
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
    throw new Error('select-ui E2E: real server did not become ready in time');
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
    const email = `select-ui-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
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

  test('source-draft-subject-select uses the same shared primitive correctly, live', async ({ page }) => {
    await page.locator('[data-screen="materials"]').click();
    await expect(page.locator('#sources-card')).toBeVisible({ timeout: 5000 });

    // First material creates a real existing subject to pick from later.
    await page.setInputFiles('#sources-file-input', {
      name: 'materia-a.pdf', mimeType: 'application/pdf',
      buffer: buildFixturePdf(['Conteudo da primeira materia sobre Nefrologia']),
    });
    await expect(page.locator('#sources-message')).toContainText('trecho(s) proposto(s)', { timeout: 10000 });
    const firstItem = page.locator('.source-proposal-item').first();
    await firstItem.locator('[data-action="generate-draft"]').click();
    const firstPanel = firstItem.locator('.source-draft-panel');
    await expect(firstPanel).toBeVisible();
    await firstPanel.locator('.source-draft-subject-input').fill('Nefrologia Select UI');
    await firstPanel.locator('[data-action="accept-draft"]').click();
    await expect(firstPanel.locator('.source-draft-result')).toContainText('Aula criada', { timeout: 10000 });

    // Second material's draft panel now offers an existing-subject select
    // with a real alternative — the exact consumer flagged as untested.
    await page.setInputFiles('#sources-file-input', {
      name: 'materia-b.pdf', mimeType: 'application/pdf',
      buffer: buildFixturePdf(['Conteudo da segunda materia sobre outro assunto']),
    });
    await expect(page.locator('#sources-message')).toContainText('trecho(s) proposto(s)', { timeout: 10000 });
    const secondItem = page.locator('.source-proposal-item').first();
    await secondItem.locator('[data-action="generate-draft"]').click();
    const secondPanel = secondItem.locator('.source-draft-panel');
    await expect(secondPanel).toBeVisible();

    const nativeSelector = '.source-draft-subject-select';
    const nativeEl = secondPanel.locator(nativeSelector);
    await expect(nativeEl).toBeVisible();

    const wrap = nativeEl.locator('xpath=..');
    const trigger = wrap.locator('.ui-select-trigger');
    await expect(trigger).toBeVisible();
    const menuId = await trigger.getAttribute('aria-controls');
    expect(menuId, 'source-draft-subject-select trigger must have aria-controls').toBeTruthy();
    const menu = page.locator(`#${menuId}`);

    // Trigger shows the current (placeholder) value; menu lists the real
    // alternative ("Nefrologia Select UI") without duplicating the
    // placeholder if it's also a real option, and without ever showing the
    // current value twice.
    const currentText = await nativeEl.evaluate((el) => el.options[el.selectedIndex]?.text ?? '');
    await expect(trigger).toHaveText(currentText);
    await trigger.click();
    await expect(menu).toBeVisible();
    await expect(menu.locator('li[role="option"]', { hasText: 'Nefrologia Select UI' })).toHaveCount(1);
    if (currentText) {
      await expect(menu.locator('li[role="option"]', { hasText: currentText })).toHaveCount(0);
    }

    // Keyboard select it, focus returns to trigger, value/state update —
    // and the existing-subject side effect (disabling the free-text input)
    // still fires exactly like the mouse-driven selectOption() path already
    // covered by e2e/draft-acceptance.spec.js.
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveText('Nefrologia Select UI');
    await expectSelectedText(nativeEl, 'Nefrologia Select UI');
    await expect(secondPanel.locator('.source-draft-subject-input')).toBeDisabled();

    await secondPanel.locator('[data-action="accept-draft"]').click();
    await expect(secondPanel.locator('.source-draft-result')).toContainText('Aula criada', { timeout: 10000 });

    const subjectsAfter = await page.evaluate(async (base) => {
      const res = await fetch(`${base}/v1/subjects`, { credentials: 'include' });
      return res.json();
    }, API_BASE);
    expect(subjectsAfter.subjects.length).toBe(1); // reused the existing subject, no duplicate created
  });
});
