import { test, expect } from '@playwright/test';

// Global select/combobox standardization: the discipline context switcher
// (Estatísticas / Por conteúdo) is a LOCKED, already-approved pattern
// (trigger = current discipline, menu = alternatives only) that used to
// only support click-to-open + Escape-to-close, missing the arrow-key/
// Home-End/typeahead roving focus every select-ui.js consumer already
// has. It now shares the exact same wireListboxKeyboard mechanics
// (src/select-ui.js) as every real <select> in the app. This file proves
// that live, without touching the switcher's own approved visual/click
// behavior (covered already by e2e/stats-discipline-drilldown.spec.js).

async function seedUatAndOpenContentSwitcher(page) {
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
  await page.locator('[data-screen="stats"]').click();
  await page.locator('#tab-stats-unit').click();
  await expect(page.locator('#content-context-plate')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await seedUatAndOpenContentSwitcher(page);
});

test('Enter/Space on the trigger opens the menu and moves focus into it (roving activedescendant)', async ({ page }) => {
  const trigger = page.locator('#content-context-plate');
  const menu = page.locator('#discipline-switch-list');
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(menu).toBeVisible();
  await expect(menu).toBeFocused();
  const active = await menu.getAttribute('aria-activedescendant');
  expect(active).toBeTruthy();
});

test('ArrowDown/ArrowUp move the active item, wrapping at the ends', async ({ page }) => {
  const trigger = page.locator('#content-context-plate');
  const menu = page.locator('#discipline-switch-list');
  await trigger.click();
  await expect(menu).toBeVisible();
  const first = await menu.getAttribute('aria-activedescendant');
  await page.keyboard.press('ArrowDown');
  const second = await menu.getAttribute('aria-activedescendant');
  expect(second).not.toBe(first);
  await page.keyboard.press('ArrowUp');
  const backToFirst = await menu.getAttribute('aria-activedescendant');
  expect(backToFirst).toBe(first);
  // Wrap: ArrowUp from the first item goes to the last.
  await page.keyboard.press('ArrowUp');
  const last = await menu.getAttribute('aria-activedescendant');
  expect(last).not.toBe(first);
});

test('Home/End jump to the first/last item', async ({ page }) => {
  const trigger = page.locator('#content-context-plate');
  const menu = page.locator('#discipline-switch-list');
  await trigger.click();
  await expect(menu).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Home');
  const items = menu.locator('li[role="menuitem"]');
  const firstId = await items.first().getAttribute('id');
  expect(await menu.getAttribute('aria-activedescendant')).toBe(firstId);
  await page.keyboard.press('End');
  const lastId = await items.last().getAttribute('id');
  expect(await menu.getAttribute('aria-activedescendant')).toBe(lastId);
});

test('Enter commits the active item, closes the menu, updates Por conteúdo, and returns focus to the trigger', async ({ page }) => {
  const trigger = page.locator('#content-context-plate');
  const menu = page.locator('#discipline-switch-list');
  const before = await trigger.textContent();
  await trigger.click();
  await expect(menu).toBeVisible();
  const items = menu.locator('li[role="menuitem"]');
  const targetLabel = (await items.first().textContent()).trim();
  await page.keyboard.press('Enter');
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveText(targetLabel);
  expect(targetLabel).not.toBe(before);
  // Por conteúdo actually re-rendered for the newly selected discipline.
  const chips = page.locator('#unit-stats-list .subject-cell--compact');
  const count = await chips.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) await expect(chips.nth(i)).toHaveText(targetLabel);
});

test('Escape closes without changing the selection and returns focus to the trigger', async ({ page }) => {
  const trigger = page.locator('#content-context-plate');
  const menu = page.locator('#discipline-switch-list');
  const before = await trigger.textContent();
  await trigger.click();
  await expect(menu).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveText(before);
});

test('typeahead jumps to the first alternative whose name starts with the typed letter', async ({ page }) => {
  const trigger = page.locator('#content-context-plate');
  const menu = page.locator('#discipline-switch-list');
  await trigger.click();
  await expect(menu).toBeVisible();
  await page.keyboard.press('n'); // "Neurologia" is one of the fixture's disciplines
  const activeId = await menu.getAttribute('aria-activedescendant');
  const activeItem = page.locator(`#${activeId}`);
  await expect(activeItem).toContainText(/Neurologia/i);
  await page.keyboard.press('Escape');
});

test('the current discipline is never duplicated inside its own open menu (canonical rule, still true after the keyboard upgrade)', async ({ page }) => {
  const trigger = page.locator('#content-context-plate');
  const menu = page.locator('#discipline-switch-list');
  const currentLabel = (await trigger.textContent()).trim();
  await trigger.click();
  await expect(menu).toBeVisible();
  await expect(menu.locator('li[role="menuitem"]', { hasText: currentLabel })).toHaveCount(0);
  await page.keyboard.press('Escape');
});
