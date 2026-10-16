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

test('picking a theme in Configurações updates data-theme/data-theme-mode and highlights the active option', async ({ page }) => {
  await freshApp(page);
  await page.locator('[data-screen="settings"]').click();

  const sepiaOption = page.locator('[data-theme-option="sepia"]');
  await expect(sepiaOption).toBeVisible();
  await sepiaOption.click();

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'sepia');
  await expect(page.locator('html')).toHaveAttribute('data-theme-mode', 'light');
  await expect(sepiaOption).toHaveAttribute('aria-checked', 'true');
  await expect(sepiaOption).toHaveClass(/is-active/);

  const nightOption = page.locator('[data-theme-option="night"]');
  await nightOption.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');
  await expect(page.locator('html')).toHaveAttribute('data-theme-mode', 'dark');
  // Only one option is ever active at a time.
  await expect(sepiaOption).toHaveAttribute('aria-checked', 'false');
  await expect(nightOption).toHaveAttribute('aria-checked', 'true');
});

test('an explicit theme choice persists across reload (not silently reset to auto)', async ({ page }) => {
  await freshApp(page);
  await page.locator('[data-screen="settings"]').click();
  await page.locator('[data-theme-option="contrast"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'contrast');

  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'contrast');
  await expect(page.locator('html')).toHaveAttribute('data-theme-mode', 'dark');
});

test('"Automático" follows the OS color scheme, both at load and on a live change, and persists "auto" itself (not the resolved theme)', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await freshApp(page);
  // Default preference with nothing stored is "auto" — should already have
  // resolved to the dark system preference on first load.
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');

  await page.locator('[data-screen="settings"]').click();
  await page.locator('[data-theme-option="auto"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');

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
