import { test, expect } from '@playwright/test';

// Kit audit 1F-04: the mobile captures of Hoje end mid-card, so nobody had shown that the LAST control of a long screen can be reached.
// The fixed bottom navigation sits over the scrolling area; .app-main reserves space for it. This proves it: scrolled to the end, the last
// visible element of each main screen ends above the navigation bar (nothing the student needs is hidden under it).

test.use({ viewport: { width: 390, height: 844 } });

const SCREENS = ['today', 'plan', 'stats', 'settings'];

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
});

for (const screen of SCREENS) {
  test(`mobile 390 px: the end of ${screen} is not covered by the bottom navigation`, async ({ page }) => {
    await page.goto(`/#${screen}`);
    await page.waitForLoadState('networkidle');
    const nav = page.locator('.app-nav');
    await expect(nav).toBeVisible();
    const result = await page.evaluate(() => {
      const main = document.querySelector('.app-main');
      main.scrollTop = main.scrollHeight;
      const navTop = document.querySelector('.app-nav').getBoundingClientRect().top;
      const panel = [...document.querySelectorAll('[data-screen-panel]')].find((p) => !p.hidden);
      // The panel's own bottom edge is the end of the screen's in-flow content (closed <details> and visually-hidden helpers add nothing to it).
      const lastBottom = panel.getBoundingClientRect().bottom;
      const lastLabel = `panel ${panel.dataset.screenPanel}`;
      return { navTop, lastBottom, lastLabel, scrolledToEnd: Math.abs(main.scrollTop + main.clientHeight - main.scrollHeight) < 2 };
    });
    expect(result.scrolledToEnd, 'the screen was scrolled to its end').toBe(true);
    expect(result.lastBottom, `last element (${result.lastLabel}) must end above the navigation bar`).toBeLessThanOrEqual(result.navTop + 0.5);
  });
}
