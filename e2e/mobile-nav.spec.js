import { test, expect } from '@playwright/test';

// Bottom navigation at phone width: EVERY visible destination must be inside
// the viewport and tappable. Materiais only appears under LOCAL_DESKTOP_
// AUTHORITY, which makes 8 items; a fixed 7-column grid used to push the
// 8th ("Conta") onto an invisible second row.
for (const localAuthority of [false, true]) {
  test(`375px bottom nav keeps every destination reachable (${localAuthority ? '8 items, Materiais visible' : '7 items'})`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.addInitScript((local) => {
      window.__SMARTLEARN_REMOTE_MODE__ = true;
      if (local) window.__SMARTLEARN_LOCAL_AUTHORITY__ = true;
    }, localAuthority);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const items = page.locator('.app-nav .nav-item:visible');
    await expect(items).toHaveCount(localAuthority ? 8 : 7);
    const boxes = await items.evaluateAll((els) => els.map((el) => {
      const r = el.getBoundingClientRect();
      return { name: el.textContent.trim(), left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    }));
    for (const box of boxes) {
      expect(box.left, `${box.name} starts inside the viewport`).toBeGreaterThanOrEqual(-0.5);
      expect(box.right, `${box.name} ends inside the viewport`).toBeLessThanOrEqual(375.5);
      expect(box.bottom, `${box.name} is not pushed below the viewport`).toBeLessThanOrEqual(814);
    }
    // One single row: all items share the same top edge.
    expect(new Set(boxes.map((b) => Math.round(b.top))).size).toBe(1);
    await page.locator('.app-nav [data-screen="account"]').click();
    await expect(page.locator('#screen-account')).toBeVisible();
  });
}
