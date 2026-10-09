import { test } from "node:test";
import assert from "node:assert/strict";
import {
  THEME_OPTIONS,
  THEME_STORAGE_KEY,
  resolveThemePreference,
  getThemeOption,
} from "../src/theme.js";

// TEST_COVERAGE_MATRIX.md gap #2: theme.js had zero test evidence (no unit
// test, no e2e spec, verified by content grep not just filename). Only the
// pure logic is covered here, matching this codebase's own established
// split (DOM-touching code — getStoredThemePreference, applyThemePreference
// — goes through e2e, same as select-ui.js/migration-ui.js/etc.; no jsdom
// or DOM shim is used anywhere in this client test suite, and introducing
// one just for this module would be a new pattern for no material gain).

test("resolveThemePreference: 'auto' follows system mode — dark system -> night, light system -> paper", () => {
  assert.equal(resolveThemePreference("auto", "dark"), "night");
  assert.equal(resolveThemePreference("auto", "light"), "paper");
});

test("resolveThemePreference: an explicit valid theme id is returned unchanged regardless of system mode", () => {
  assert.equal(resolveThemePreference("sepia", "dark"), "sepia");
  assert.equal(resolveThemePreference("contrast", "light"), "contrast");
});

test("resolveThemePreference: legacy 'light'/'dark' aliases normalize to 'paper'/'night' before resolution, not treated as 'auto'", () => {
  assert.equal(resolveThemePreference("light", "dark"), "paper");
  assert.equal(resolveThemePreference("dark", "light"), "night");
});

test("resolveThemePreference: an unknown/garbage preference always falls back to 'paper', never to the system-resolved auto theme", () => {
  // Documents a real, specific choice: fallback is the hardcoded light
  // default (THEME_DEFAULTS_BY_MODE.light), not "treat garbage as auto".
  assert.equal(resolveThemePreference("not-a-real-theme", "dark"), "paper");
  assert.equal(resolveThemePreference("", "dark"), "paper");
  assert.equal(resolveThemePreference(undefined, "dark"), "paper");
});

test("getThemeOption returns the matching option for a valid id, null for an unknown one", () => {
  const sepia = getThemeOption("sepia");
  assert.equal(sepia.label, "Sépia");
  assert.equal(sepia.mode, "light");
  assert.equal(getThemeOption("not-a-real-theme"), null);
});

test("THEME_OPTIONS: every id is unique", () => {
  const ids = THEME_OPTIONS.map((o) => o.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("THEME_OPTIONS: every option has a label and description; mode is 'light'/'dark', except 'auto' whose mode is 'auto'", () => {
  for (const option of THEME_OPTIONS) {
    assert.ok(option.label, `${option.id} missing label`);
    assert.ok(option.description, `${option.id} missing description`);
    const validMode = option.id === "auto" ? option.mode === "auto" : option.mode === "light" || option.mode === "dark";
    assert.ok(validMode, `${option.id} has invalid mode ${option.mode}`);
  }
});

// REGRESSION sensor for a real duplication hazard found while writing this
// suite: applyThemePreference (src/theme.js) and the quick theme-toggle
// handler (src/app.js) BOTH decide dark-vs-light by hardcoding
// `themeId === "night" || themeId === "contrast"`, instead of reading each
// option's own `mode` field from THEME_OPTIONS (which already carries this
// exact information). Not fixed here — it works correctly today and
// refactoring two call sites of a data-driven check that currently agrees
// with itself is out of this task's authorized scope, not a proven active
// defect. But the moment a new theme is added to THEME_OPTIONS without also
// updating both hardcoded checks, CSS that keys off `[data-theme-mode]`
// (this app has several, including the exercise-attempt-review dialog)
// would silently render with the wrong palette. This test independently
// derives "is dark" from THEME_OPTIONS.mode and pins it against the exact
// two ids the hardcoded checks use — it will fail the day those two things
// drift apart, which is the earliest possible signal short of refactoring
// the checks to share one source of truth.
test("REGRESSION: the hardcoded night/contrast dark-theme id set in applyThemePreference and the theme-toggle handler still matches THEME_OPTIONS' own mode field", () => {
  const hardcodedDarkIds = new Set(["night", "contrast"]);
  for (const option of THEME_OPTIONS) {
    const isHardcodedDark = hardcodedDarkIds.has(option.id);
    assert.equal(
      isHardcodedDark,
      option.mode === "dark",
      `theme '${option.id}': hardcoded dark-id check says ${isHardcodedDark}, THEME_OPTIONS.mode says ${option.mode}`,
    );
  }
});

test("THEME_STORAGE_KEY is a stable, namespaced localStorage key", () => {
  assert.equal(THEME_STORAGE_KEY, "smartlearn:theme");
});
