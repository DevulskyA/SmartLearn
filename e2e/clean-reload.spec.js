import { test, expect } from '@playwright/test';

// F5 must be clean: before any module runs, the page already carries the redesign class, the canvas has the last theme's colour and the
// body is hidden (never shown half-styled). If the app script never arrives, a timer still releases the body.

test('before the app script runs the page is already styled, the canvas has the cached theme colour and the body is hidden', async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('smartlearn:theme-paint', JSON.stringify({ bg: '#11131a', mode: 'dark' })); } catch { /* storage blocked */ }
  });
  // the app script never answers: this is the state the first paint sees
  await page.route('**/src/app.js*', () => new Promise(() => {}));
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForFunction(() => document.readyState !== 'loading' || !!document.body, null, { timeout: 15000 });
  const state = await page.evaluate(() => {
    const root = document.documentElement;
    return {
      redesign: root.classList.contains('sl-redesign'),
      booting: root.classList.contains('sl-booting'),
      sheets: document.styleSheets.length,
      canvas: getComputedStyle(root).backgroundColor,
      bodyVisibility: getComputedStyle(document.body).visibility,
    };
  });
  expect(state.redesign).toBe(true);
  expect(state.sheets).toBeGreaterThan(0);
  expect(state.canvas).toBe('rgb(17, 19, 26)');
  expect(state.booting).toBe(true);
  expect(state.bodyVisibility).toBe('hidden');
});

test('if the app script never runs, the body is released after the failsafe timer', async ({ page }) => {
  await page.route('**/src/app.js*', () => new Promise(() => {}));
  await page.goto('/', { waitUntil: 'commit' });
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).visibility), { timeout: 30000 }).toBe('visible');
});

test('on a slow connection the body stays hidden until the stylesheets have arrived (never raw HTML)', async ({ page }) => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  await page.route('**/src/experience.css*', async (route) => { await gate; await route.continue(); });
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForFunction(() => !!document.body && document.readyState !== 'loading' ? true : !!document.body, null, { timeout: 15000 });
  await page.waitForTimeout(2500); // long enough for app.js and theme.js to have run while the CSS is still pending
  expect(await page.evaluate(() => getComputedStyle(document.body).visibility)).toBe('hidden');
  release();
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).visibility), { timeout: 15000 }).toBe('visible');
  expect(await page.evaluate(() => document.styleSheets.length)).toBeGreaterThan(1);
});

test('after a normal load the body is visible, the redesign class stays and the theme is cached for the next F5', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('body')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('sl-booting'))).toBe(false);
  expect(await page.evaluate(() => document.documentElement.classList.contains('sl-redesign'))).toBe(true);
  const paint = await page.evaluate(() => JSON.parse(localStorage.getItem('smartlearn:theme-paint')));
  expect(paint.bg).toMatch(/^#[0-9a-f]{6}$/i);
  expect(['light', 'dark']).toContain(paint.mode);
});
