import { test, expect } from '@playwright/test';

// Plano's performance badge uses the --band-* tokens (as Estatísticas) and keeps
// WCAG AA text contrast (4.5:1) in every band, in both light and dark themes.

for (const mode of ['light', 'dark']) {
  test(`performance badge bands: AA contrast on --band-* colours (${mode})`, async ({ page }) => {
    // The palette is applied by the theme system (inline tokens + data-theme), so pick a real theme instead of faking the mode attribute.
    await page.addInitScript((id) => localStorage.setItem('smartlearn:theme', id), mode === 'dark' ? 'night' : 'paper');
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const result = await page.evaluate((themeMode) => {
      if (document.documentElement.dataset.themeMode !== themeMode) throw new Error(`theme mode is ${document.documentElement.dataset.themeMode}, expected ${themeMode}`);
      const toRgb = (css) => {
        const c = document.createElement('canvas');
        c.width = c.height = 1;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, 1, 1);
        ctx.fillStyle = css;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        return [r, g, b];
      };
      const lum = ([r, g, b]) => {
        const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const out = {};
      for (const perf of ['strong', 'adequate', 'attention', 'critical']) {
        const el = document.createElement('span');
        el.className = 'performance-badge';
        el.dataset.perf = perf;
        el.textContent = perf;
        document.body.append(el);
        const cs = getComputedStyle(el);
        const fg = lum(toRgb(cs.color));
        const bg = lum(toRgb(cs.backgroundColor));
        out[perf] = (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
        el.remove();
      }
      return out;
    }, mode);
    for (const [perf, ratio] of Object.entries(result)) {
      expect(ratio, `${perf} badge contrast in ${mode}`).toBeGreaterThanOrEqual(4.5);
    }
  });
}
