import { test, expect } from '@playwright/test';

// On narrow screens the most frequent destinations stay immediately
// available. Secondary destinations remain reachable via the More menu.
for (const localAuthority of [false, true]) {
  test(`375px navigation: core destinations and accessible More (${localAuthority ? 'with' : 'without'} Materiais)`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.addInitScript((local) => {
      window.__SMARTLEARN_REMOTE_MODE__ = true;
      if (local) window.__SMARTLEARN_LOCAL_AUTHORITY__ = true;
    }, localAuthority);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const primary = page.locator('.app-nav > .nav-item:visible');
    await expect(primary).toHaveCount(localAuthority ? 5 : 4);
    const boxes = await primary.evaluateAll((elements) => elements.map((el) => {
      const r = el.getBoundingClientRect();
      return { name: el.textContent.trim(), left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
    }));
    for (const box of boxes) {
      expect(box.left, `${box.name} starts within viewport`).toBeGreaterThanOrEqual(-0.5);
      expect(box.right, `${box.name} ends within viewport`).toBeLessThanOrEqual(375.5);
      expect(box.bottom, `${box.name} remains visible`).toBeLessThanOrEqual(814);
      expect(box.width, `${box.name} touch width`).toBeGreaterThanOrEqual(44);
      expect(box.height, `${box.name} touch height`).toBeGreaterThanOrEqual(44);
    }
    expect(new Set(boxes.map((r) => Math.round(r.top))).size).toBe(1);
    const more = page.locator('#mobile-more-toggle');
    await expect(more).toHaveAttribute('aria-expanded', 'false');
    await more.click();
    await expect(more).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#mobile-more-menu .nav-item:visible')).toHaveCount(4);
    await page.keyboard.press('Escape');
    await expect(more).toBeFocused();
    await expect(more).toHaveAttribute('aria-expanded', 'false');

    await more.click();
    await page.locator('#mobile-more-menu [data-screen="account"]').click();
    await expect(page.locator('#screen-account')).toBeVisible();
    await expect(more).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('#mobile-more-menu')).toBeHidden();
  });
}

for (const width of [360, 375, 390]) {
  test(`${width}px: primary labels fit without truncation and all secondary destinations are reachable`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.addInitScript(() => {
      window.__SMARTLEARN_REMOTE_MODE__ = true;
      window.__SMARTLEARN_LOCAL_AUTHORITY__ = true;
    });
    await page.goto('/');
    const items = page.locator('.app-nav > .nav-item:visible');
    await expect(items).toHaveCount(5);
    const report = await items.evaluateAll((els) => els.map((el) => {
      const candidate = el.querySelector('.nav-short')?.getClientRects().length ? el.querySelector('.nav-short') : el.querySelector('span');
      const range = document.createRange();
      range.selectNodeContents(candidate);
      return {
        label: candidate.textContent.trim(),
        lines: new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size,
        overflow: candidate.scrollWidth > candidate.clientWidth + 1,
      };
    }));
    for (const item of report) {
      expect(item.lines, `label ${item.label}`).toBe(1);
      expect(item.overflow, `label ${item.label}`).toBe(false);
    }
    await page.locator('#mobile-more-toggle').click();
    for (const name of ['tracking', 'subjects', 'settings', 'account']) {
      await expect(page.locator(`#mobile-more-menu [data-screen="${name}"]`)).toBeVisible();
    }
  });
}
