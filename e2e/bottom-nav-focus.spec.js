import { test, expect } from '@playwright/test';

// Phone layout: the bottom nav is fixed, so keyboard focus must scroll above it
// (html { scroll-padding-bottom }) instead of landing hidden underneath.

test('Tab on Hoje at 390px never leaves the focused control under the bottom nav', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
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
  await page.locator('[data-screen="today"]').click();

  const navTop = await page.locator('.app-nav').evaluate((el) => el.getBoundingClientRect().top);
  expect(navTop).toBeLessThan(700);

  await page.locator('body').click({ position: { x: 5, y: 5 } });
  let checked = 0;
  for (let i = 0; i < 60; i += 1) {
    await page.keyboard.press('Tab');
    const state = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body || el.closest('.app-nav')) return null;
      const r = el.getBoundingClientRect();
      return { bottom: r.bottom, h: r.height, label: (el.id || el.className || el.tagName).toString().slice(0, 60) };
    });
    if (!state || state.h === 0) continue;
    checked += 1;
    expect(state.bottom, `focused ${state.label} hidden under bottom nav (tab ${i + 1})`).toBeLessThanOrEqual(navTop + 1);
  }
  expect(checked).toBeGreaterThan(10);
});
