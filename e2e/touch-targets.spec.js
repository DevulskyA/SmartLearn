import { test, expect } from '@playwright/test';

// Phone (390px): visible interactive controls meet WCAG 2.2 target size minimum (24x24 CSS px).

const SCREENS = ['today', 'plan', 'stats', 'settings', 'account'];

test('390px: no visible control smaller than 24x24 on the main screens', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
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

  const small = [];
  for (const screen of SCREENS) {
    const nav = page.locator(`[data-screen="${screen}"]`);
    if (!(await nav.count()) || !(await nav.first().isVisible())) continue;
    await nav.first().click();
    const panel = page.locator(`[data-screen-panel="${screen}"]`);
    await expect(panel).toBeVisible();
    await expect(panel).not.toHaveAttribute('aria-busy', 'true');
    const found = await page.evaluate(() => {
      const sel = 'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [tabindex="0"]';
      const out = [];
      for (const el of document.querySelectorAll(sel)) {
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none') continue;
        if (el.closest('[hidden]') || el.closest('.sr-only')) continue;
        // Replaced by a custom control / visually hidden: the visible stand-in is measured instead.
        if (el.matches('.ui-select-native, .visually-hidden, .theme-select')) continue;
        // Checkbox/radio: the wrapping label is the touch target.
        const hit = el.matches('input[type="checkbox"], input[type="radio"]') ? (el.closest('label') ?? el) : el;
        const r = hit.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.width < 24 || r.height < 24) {
          out.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}#${el.id} ${Math.round(r.width)}x${Math.round(r.height)}`);
        }
      }
      return out;
    });
    for (const f of found) small.push(`${screen}: ${f}`);
  }
  expect(small, `controls under 24x24:\n${small.join('\n')}`).toEqual([]);
});
