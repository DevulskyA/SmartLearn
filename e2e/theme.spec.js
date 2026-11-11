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

// The picker is a library of theme cards grouped Automático / Claros / Escuros (.sl-theme-option[data-value]); the chosen card is aria-pressed.
test('picking a theme in Configurações updates data-theme/data-theme-mode and the card shows the active option', async ({ page }) => {
  await freshApp(page);
  await page.locator('[data-screen="settings"]').click();

  const card = (id) => page.locator(`.sl-theme-option[data-value="${id}"]`);
  await expect(card('auto')).toBeVisible();
  await expect(card('auto')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.sl-theme-group')).toHaveCount(3);
  await expect(page.locator('.sl-theme-option')).toHaveCount(24);

  await card('sepia').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'sepia');
  await expect(page.locator('html')).toHaveAttribute('data-theme-mode', 'light');
  await expect(card('sepia')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.theme-live-label')).toContainText('Sépia');

  await card('night').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');
  await expect(page.locator('html')).toHaveAttribute('data-theme-mode', 'dark');
  await expect(card('night')).toHaveAttribute('aria-pressed', 'true');

  await card('ocean').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'ocean');
  await expect(page.locator('html')).toHaveAttribute('data-theme-mode', 'light');
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim())).not.toBe('');

  await card('dusk').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dusk');
  await expect(page.locator('html')).toHaveAttribute('data-theme-mode', 'dark');
});

test('an explicit theme choice persists across reload (not silently reset to auto)', async ({ page }) => {
  await freshApp(page);
  await page.locator('[data-screen="settings"]').click();
  await page.locator('.sl-theme-option[data-value=\"contrast\"]').click();
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
  await page.locator('.sl-theme-option[data-value=\"auto\"]').click();
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

// Card "Corrigir o contraste de 8 temas e o botão lua/sol" (T-06): the quick button used to overwrite the chosen theme with Papel/Noite,
// and under "Sistema" + dark OS its first click did nothing (a boolean was passed where "dark"/"light" is expected).
test('the quick theme-toggle returns to the theme the user had chosen instead of erasing it', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await freshApp(page);
  await page.locator('[data-screen="settings"]').click();
  await page.locator('.sl-theme-option[data-value=\"dracula\"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dracula');

  await page.locator('#theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'paper');
  await expect(page.locator('.sl-theme-option[data-value=\"paper\"]')).toHaveAttribute('aria-pressed', 'true');

  await page.locator('#theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dracula');
  await expect(page.locator('.sl-theme-option[data-value=\"dracula\"]')).toHaveAttribute('aria-pressed', 'true');

  // the memory survives a reload (per-viewer convenience in localStorage)
  await page.locator('#theme-toggle').click();
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.locator('#theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dracula');
});

test('the quick theme-toggle changes the theme on the FIRST click under "Sistema" with a dark OS, and a second click returns to "Sistema"', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await freshApp(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');

  await page.locator('#theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme-mode', 'light');

  await page.locator('#theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');
  await page.locator('[data-screen="settings"]').click();
  await expect(page.locator('.sl-theme-option[data-value=\"auto\"]')).toHaveAttribute('aria-pressed', 'true');
});

test('the quick theme-toggle is a named button whose icon keeps AA contrast on its card in a corrected theme', async ({ page }) => {
  await freshApp(page);
  await page.locator('[data-screen="settings"]').click();
  await page.locator('.sl-theme-option[data-value=\"solarized-light\"]').click();
  const button = page.locator('#theme-toggle');
  await expect(button).toHaveAccessibleName(/tema/i);
  const readRatio = () => button.evaluate((el) => {
    // computed color-mix() results come back as `color(srgb 0.89 0.88 0.82)` (0..1), plain colors as `rgb(59, 81, 89)` (0..255)
    const parse = (c) => { const n = c.match(/[\d.]+/g).map(Number).slice(0, 3); return c.startsWith('color(srgb') ? n.map((v) => v * 255) : n; };
    const lin = (v) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
    const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    const style = getComputedStyle(el);
    const [hi, lo] = [lum(parse(style.color)), lum(parse(style.backgroundColor))].sort((a, b) => b - a);
    return (hi + 0.05) / (lo + 0.05);
  });
  // the button animates color/background for 140 ms after a theme switch: poll until it has settled
  await expect.poll(readRatio).toBeGreaterThanOrEqual(4.5);
});
