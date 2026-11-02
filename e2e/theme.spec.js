import { test, expect } from '@playwright/test';

// TEST_COVERAGE_MATRIX.md gap #2: theme.js had zero test evidence — no
// unit test, and no e2e spec either (confirmed by content grep, not just
// filename: no existing spec asserted on data-theme/data-theme-mode/
// theme-picker/theme-toggle anywhere). test/theme.test.js now covers the
// pure resolution logic; this covers the actual DOM/localStorage side
// (applyThemePreference, getStoredThemePreference) that only a real
// browser can exercise honestly.

async function freshApp(page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForLoadState('networkidle');
}

// Since 6f1fe2b the picker is one grouped combo (#theme-select: Sistema / Claros / Escuros), not a row of swatch buttons.
test('picking a theme in Configurações updates data-theme/data-theme-mode and the combo shows the active option', async ({ page }) => {
  await freshApp(page);
  await page.locator('[data-screen="settings"]').click();

  const select = page.locator('#theme-select');
  await expect(select).toBeVisible();
  await expect(select).toHaveValue('auto');
  await expect(page.locator('#theme-select optgroup')).toHaveCount(3);

  await select.selectOption('sepia');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'sepia');
  await expect(page.locator('html')).toHaveAttribute('data-theme-mode', 'light');
  await expect(select).toHaveValue('sepia');
  await expect(page.locator('.theme-live-label')).toContainText('Sépia');

  await select.selectOption('night');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');
  await expect(page.locator('html')).toHaveAttribute('data-theme-mode', 'dark');
  await expect(select).toHaveValue('night');

  await select.selectOption('ocean');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'ocean');
  await expect(page.locator('html')).toHaveAttribute('data-theme-mode', 'light');
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim())).not.toBe('');

  await select.selectOption('dusk');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dusk');
  await expect(page.locator('html')).toHaveAttribute('data-theme-mode', 'dark');
});

test('an explicit theme choice persists across reload (not silently reset to auto)', async ({ page }) => {
  await freshApp(page);
  await page.locator('[data-screen="settings"]').click();
  await page.locator('#theme-select').selectOption('contrast');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'contrast');

  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'contrast');
  await expect(page.locator('html')).toHaveAttribute('data-theme-mode', 'dark');
});

test('"Sistema" follows the OS color scheme on first use and after an explicit selection', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await freshApp(page);
  // Default preference with nothing stored is "auto" — should already have
  // resolved to the dark system preference on first load.
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('smartlearn:theme'))).toBeNull();

  await page.locator('[data-screen="settings"]').click();
  await page.locator('#theme-select').selectOption('auto');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('smartlearn:theme'))).toBe('auto');

  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'paper', { timeout: 5000 });

  // Reload under light system scheme: must still be following "auto", not
  // have persisted the resolved "paper" id as a fixed preference.
  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'paper');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');
});

test('the quick theme-toggle button flips between a light and a dark theme without opening Configurações', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await freshApp(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme-mode', 'light');

  await page.locator('#theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme-mode', 'dark');

  await page.locator('#theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme-mode', 'light');
});
