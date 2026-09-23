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

// MOBILENAV-1: a label must read whole on ONE line (or in an agreed short form), never be cut in the middle of a
// word ("Estatístic/as"). Measured on the visible label of every item, with all 8 destinations shown.
for (const width of [375, 360]) {
  test(`${width}px bottom nav: every visible label is a single unbroken line and each item is a >=44px touch target`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.addInitScript(() => { window.__SMARTLEARN_REMOTE_MODE__ = true; window.__SMARTLEARN_LOCAL_AUTHORITY__ = true; });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const items = page.locator('.app-nav .nav-item:visible');
    await expect(items).toHaveCount(8);
    const report = await items.evaluateAll((els) => els.map((el) => {
      const labels = [...el.querySelectorAll('span, span span')].filter((s) => s.getClientRects().length > 0 && getComputedStyle(s).position !== 'absolute' && s.textContent.trim() !== '');
      const leaf = labels.filter((s) => !s.querySelector('span')).filter((s) => { const r = s.getBoundingClientRect(); return r.width > 1 && r.height > 1; });
      const visible = leaf[leaf.length - 1] ?? el.querySelector('span');
      const range = document.createRange();
      range.selectNodeContents(visible);
      const lines = new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
      const box = el.getBoundingClientRect();
      return { text: visible.textContent.trim(), lines, overflow: visible.scrollWidth > visible.clientWidth + 1, height: box.height, width: box.width };
    }));
    for (const r of report) {
      expect(r.lines, `"${r.text}" must be one line`).toBe(1);
      expect(r.overflow, `"${r.text}" must not overflow its item`).toBe(false);
      expect(r.height, `"${r.text}" touch target height`).toBeGreaterThanOrEqual(44);
    }
  });
}
