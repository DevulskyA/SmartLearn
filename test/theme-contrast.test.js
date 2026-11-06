import { test } from "node:test";
import assert from "node:assert/strict";
import { THEME_OPTIONS, THEME_VARIABLES } from "../src/theme.js";

// WCAG 2.1 AA contrast over EVERY theme token pair the stylesheet actually draws (src/styles.css): text 4.5:1 (1.4.3),
// non-text UI 3:1 (1.4.11). Tokens are rgb() or oklch(); oklch is converted with the CSS Color 4 matrices and clamped to
// sRGB (browsers gamut-map; for the in-gamut tokens used here the two agree, and e2e/accessibility.spec.js re-checks the
// corrected themes with axe on the computed colors). Borders are decorative here (every control also has a text/icon label)
// and are deliberately not asserted.

const parseColor = (value) => {
  const rgb = /^rgb\((\d+) (\d+) (\d+)\)$/.exec(value);
  if (rgb) return rgb.slice(1).map((x) => srgbToLinear(Number(x) / 255));
  const ok = /^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/.exec(value);
  if (ok) return oklchToLinear(Number(ok[1]), Number(ok[2]), Number(ok[3]));
  throw new Error(`unsupported color token: ${value}`);
};
const srgbToLinear = (x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
function oklchToLinear(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map(clamp01);
}
const luminance = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
export const contrastRatio = (fg, bg) => {
  const [hi, lo] = [luminance(parseColor(fg)), luminance(parseColor(bg))].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// [foreground token, background token, minimum ratio, where it is drawn]
const TEXT = 4.5;
const UI = 3;
const PAIRS = [
  ["--color-text", "--color-bg", TEXT, "body text"],
  ["--color-text", "--color-surface", TEXT, "card text"],
  ["--color-text", "--color-surface-sunken", TEXT, "inset text"],
  ["--color-muted", "--color-bg", TEXT, "secondary text"],
  ["--color-muted", "--color-surface", TEXT, "secondary text on cards and the quick theme button icon"],
  ["--color-muted", "--color-surface-sunken", TEXT, "secondary text, inset"],
  ["--color-primary", "--color-bg", TEXT, "brand and eyebrow text"],
  ["--color-primary", "--color-surface", TEXT, "link-like text on cards"],
  ["--color-primary", "--color-primary-soft", TEXT, "active nav item and badges"],
  ["--color-primary-strong", "--color-surface", TEXT, "selected lesson tab and mode button text"],
  ["--color-primary-strong", "--color-primary-soft", TEXT, "primary action banner text and strong badge"],
  ["--color-on-primary", "--color-primary", TEXT, "primary button"],
  ["--status-overdue-text", "--status-overdue-fill", TEXT, "overdue badge"],
  ["--status-done-text", "--status-done-fill", TEXT, "done badge"],
  ["--color-primary", "--color-surface", UI, "focus ring and outlined controls"],
  ["--color-primary", "--color-bg", UI, "focus ring on the page background"],
];

const CONCRETE_THEMES = THEME_OPTIONS.filter((option) => option.id !== "auto").map((option) => option.id);

test("the contrast suite covers every concrete theme (24 options, 'auto' only resolves to another)", () => {
  assert.equal(THEME_OPTIONS.length, 24);
  assert.deepEqual(Object.keys(THEME_VARIABLES).sort(), [...CONCRETE_THEMES].sort());
});

test("contrast math matches WCAG reference values", () => {
  assert.equal(contrastRatio("rgb(0 0 0)", "rgb(255 255 255)").toFixed(2), "21.00");
  assert.equal(contrastRatio("rgb(119 119 119)", "rgb(255 255 255)").toFixed(2), "4.48");
  assert.equal(contrastRatio("oklch(1 0 0)", "oklch(0 0 0)").toFixed(1), "21.0");
});

test("theme consumers use only declared semantic color tokens", async () => {
  const { readFile } = await import("node:fs/promises");
  const [styles, performanceThresholds] = await Promise.all([
    readFile(new URL("../src/styles.css", import.meta.url), "utf8"),
    readFile(new URL("../src/performance-thresholds.js", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(styles, /var\(--color-surface-alt\b/);
  assert.doesNotMatch(performanceThresholds, /var\(--color-text-muted\b/);
  for (const id of CONCRETE_THEMES) {
    const tokens = THEME_VARIABLES[id].tokens;
    for (const value of Object.values(tokens)) {
      if (typeof value === "string" && value.startsWith("var(")) {
        assert.match(value, /^var\(--[a-z0-9-]+\)$/);
      }
    }
  }
});

for (const id of CONCRETE_THEMES) {
  test(`theme ${id}: every drawn token pair reaches WCAG AA (text 4.5:1, UI 3:1)`, () => {
    const tokens = THEME_VARIABLES[id].tokens;
    const failing = [];
    for (const [fg, bg, min, where] of PAIRS) {
      const ratio = contrastRatio(tokens[fg], tokens[bg]);
      if (ratio < min) failing.push(`${fg} on ${bg} = ${ratio.toFixed(2)} < ${min} (${where})`);
    }
    assert.deepEqual(failing, []);
  });
}
