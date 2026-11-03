import { test, expect } from '@playwright/test';

// Bottom navigation at phone width: EVERY visible destination must be inside
// the viewport and tappable. The bar holds Hoje, Plano, Estatísticas and "Mais" (Materiais joins them only under
// LOCAL_DESKTOP_AUTHORITY); Configurações and Conta sit behind "Mais" so each target stays large and each label legible.
for (const localAuthority of [false, true]) {
  test(`375px bottom nav keeps every destination reachable (${localAuthority ? '5 items, Materiais visible' : '4 items'})`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.addInitScript((local) => {
      window.__SMARTLEARN_REMOTE_MODE__ = true;
      if (local) window.__SMARTLEARN_LOCAL_AUTHORITY__ = true;
    }, localAuthority);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const items = page.locator('.app-nav > .nav-item:visible');
    await expect(items).toHaveCount(localAuthority ? 5 : 4);
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
    await page.locator('#mobile-more-toggle').click();
    await page.locator('.app-nav [data-screen="account"]').click();
    await expect(page.locator('#screen-account')).toBeVisible();
  });
}

// "Mais" is a real disclosure: closed by default, labelled, closes on Escape (focus back on the button), on a
// choice and on an outside tap, and marks itself as the current page while Configurações or Conta is open.
test('375px "Mais" opens Configurações and Conta, closes on Escape and on an outside tap, and shows the current page', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.addInitScript(() => { window.__SMARTLEARN_REMOTE_MODE__ = true; });
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const toggle = page.locator('#mobile-more-toggle');
  const menu = page.locator('#mobile-more-menu');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(menu).toBeHidden();

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(menu.locator('[data-screen="settings"]')).toBeVisible();
  await expect(menu.locator('[data-screen="account"]')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(toggle).toBeFocused();

  await toggle.click();
  await page.locator('.app-main').click({ position: { x: 20, y: 20 } });
  await expect(menu).toBeHidden();

  await toggle.click();
  await menu.locator('[data-screen="account"]').click();
  await expect(page.locator('#screen-account')).toBeVisible();
  await expect(menu).toBeHidden();
  await expect(toggle).toHaveAttribute('aria-current', 'page');
  // Without a session every data screen (Plano included) redirects to Conta, so "Mais" correctly stays current here;
  // the "not current on a bar destination" half needs an authenticated session and is not covered by this test.
  await page.locator('.app-nav > [data-screen="plan"]').click();
  await expect(page.locator('#screen-account')).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-current', 'page');
});

// Desktop keeps the sidebar as it was: no "Mais" button, Configurações and Conta are ordinary items.
test('desktop sidebar has no "Mais" button and lists Configurações and Conta directly', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(() => { window.__SMARTLEARN_REMOTE_MODE__ = true; });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#mobile-more-toggle')).toBeHidden();
  await expect(page.locator('.app-nav [data-screen="settings"]')).toBeVisible();
  await expect(page.locator('.app-nav [data-screen="account"]')).toBeVisible();
});

// MOBILENAV-1: a label must read whole on ONE line (or in an agreed short form), never be cut in the middle of a
// word ("Estatístic/as"). Measured on the visible label of every item, with every destination shown, at 12px or more.
for (const width of [375, 360]) {
  test(`${width}px bottom nav: every visible label is a single unbroken line of 12px or more and each item is a >=44px touch target`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.addInitScript(() => { window.__SMARTLEARN_REMOTE_MODE__ = true; window.__SMARTLEARN_LOCAL_AUTHORITY__ = true; });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const items = page.locator('.app-nav > .nav-item:visible');
    await expect(items).toHaveCount(5);
    const report = await items.evaluateAll((els) => els.map((el) => {
      const labels = [...el.querySelectorAll('span, span span')].filter((s) => s.getClientRects().length > 0 && getComputedStyle(s).position !== 'absolute' && s.textContent.trim() !== '');
      const leaf = labels.filter((s) => !s.querySelector('span')).filter((s) => { const r = s.getBoundingClientRect(); return r.width > 1 && r.height > 1; });
      const visible = leaf[leaf.length - 1] ?? el.querySelector('span');
      const range = document.createRange();
      range.selectNodeContents(visible);
      const lines = new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
      const box = el.getBoundingClientRect();
      return { text: visible.textContent.trim(), lines, overflow: visible.scrollWidth > visible.clientWidth + 1, height: box.height, width: box.width, fontSize: parseFloat(getComputedStyle(visible).fontSize) };
    }));
    for (const r of report) {
      expect(r.lines, `"${r.text}" must be one line`).toBe(1);
      expect(r.overflow, `"${r.text}" must not overflow its item`).toBe(false);
      expect(r.height, `"${r.text}" touch target height`).toBeGreaterThanOrEqual(44);
      expect(r.fontSize, `"${r.text}" label size`).toBeGreaterThanOrEqual(12);
    }
  });
}
