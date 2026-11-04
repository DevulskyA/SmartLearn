import { test } from "node:test";
import assert from "node:assert/strict";
import {
  THEME_OPTIONS,
  THEME_STORAGE_KEY,
  resolveThemePreference,
  getThemeOption,
  getStoredThemePreference,
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
  assert.equal(resolveThemePreference("ocean", "dark"), "ocean");
  assert.equal(resolveThemePreference("dusk", "light"), "dusk");
  assert.equal(resolveThemePreference("dracula", "light"), "dracula");
  assert.equal(resolveThemePreference("solarized-light", "dark"), "solarized-light");
});

test("getStoredThemePreference: first use follows the system without creating a stored choice", () => {
  const originalStorage = globalThis.localStorage;
  const reads = [];
  globalThis.localStorage = {
    getItem(key) { reads.push(key); return null; },
    setItem() { throw new Error("first use must not write"); },
  };
  try {
    assert.equal(getStoredThemePreference(), "auto");
    assert.deepEqual(reads, [THEME_STORAGE_KEY]);
  } finally {
    globalThis.localStorage = originalStorage;
  }
});

test("getStoredThemePreference: an explicit choice is kept and an unknown value returns to System", () => {
  const originalStorage = globalThis.localStorage;
  let saved = "ocean";
  globalThis.localStorage = { getItem() { return saved; } };
  try {
    assert.equal(getStoredThemePreference(), "ocean");
    saved = "removed-theme";
    assert.equal(getStoredThemePreference(), "auto");
  } finally {
    globalThis.localStorage = originalStorage;
  }
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

test("THEME_OPTIONS: every dark theme is represented by its declared mode", () => {
  assert.deepEqual(
    THEME_OPTIONS.filter((option) => option.mode === "dark").map((option) => option.id),
    ["night", "contrast", "dusk", "dracula", "catppuccin", "onedark", "gruvbox", "neon", "premium", "tokyo", "midnight", "forest-serenity", "sunset", "cyberpunk"],
  );
});

test("THEME_STORAGE_KEY is a stable, namespaced localStorage key", () => {
  assert.equal(THEME_STORAGE_KEY, "smartlearn:theme");
});

// i18n: the labels come from the catalog (src/i18n/locales/pt-BR.js). These
// pin the exact pt-BR texts rendered by the picker and prove every id has both
// keys (a missing key would silently show "theme.x.label").
test("THEME_OPTIONS: pt-BR texts match the theme picker catalog", () => {
  assert.deepEqual(
    THEME_OPTIONS.map(({ id, label, description }) => [id, label, description]),
    [
      ["auto", "Sistema", "Segue o tema do sistema."],
      ["paper", "Papel", "Claro, calmo e legível."],
      ["sepia", "Sépia", "Mais quente para leitura longa."],
      ["ocean", "Oceano", "Azul sereno para foco prolongado."],
      ["forest", "Floresta", "Verde suave, natural e equilibrado."],
      ["night", "Noite", "Escuro, estável e discreto."],
      ["contrast", "Alto contraste", "Mais nítido para leitura rápida."],
      ["dusk", "Crepúsculo", "Escuro violeta para ambientes tranquilos."],
      ["dracula", "Dracula", "Violeta escuro com acentos rosados."],
      ["catppuccin", "Catppuccin", "Escuro suave e aconchegante."],
      ["onedark", "One Dark", "Escuro técnico com azul sereno."],
      ["gruvbox", "Gruvbox", "Terroso, quente e confortável."],
      ["neon", "Neon", "Preto intenso com cyan e magenta."],
      ["premium", "Premium", "Azul profundo com destaque cyan."],
      ["tokyo", "Tokyo Night", "Noturno, azul e violeta."],
      ["midnight", "Midnight Pro", "Azul meia-noite profissional."],
      ["forest-serenity", "Forest Serenity", "Verde profundo e tranquilo."],
      ["sunset", "Sunset Vibes", "Violeta quente com acentos de pôr do sol."],
      ["cyberpunk", "Cyberpunk 2077", "Alto contraste com amarelo elétrico."],
      ["catppuccin-latte", "Catppuccin Latte", "Claro, macio e azulado."],
      ["gruvbox-light", "Gruvbox Light", "Claro, terroso e acolhedor."],
      ["solarized-light", "Solarized Light", "Claro, equilibrado e confortável."],
      ["dracula-light", "Dracula Light", "Claro com violeta e rosa."],
      ["tokyo-day", "Tokyo Day", "Claro, frio e luminoso."],
    ],
  );
});

test("THEME_OPTIONS: every id has its label and description keys in the catalog, and the texts follow the active locale", async () => {
  const { has, registerCatalog, setLocale } = await import("../src/i18n/index.js");
  for (const { id } of THEME_OPTIONS) {
    assert.ok(has(`theme.${id}.label`), `theme.${id}.label is missing from the catalog`);
    assert.ok(has(`theme.${id}.description`), `theme.${id}.description is missing from the catalog`);
  }
  registerCatalog("en", { "theme.paper.label": "Paper" });
  try {
    setLocale("en");
    assert.equal(getThemeOption("paper").label, "Paper");
    assert.equal(getThemeOption("paper").description, "Claro, calmo e legível.", "no en text yet: falls back to pt-BR per key");
  } finally {
    setLocale("pt-BR");
    registerCatalog("en", undefined);
  }
});

// The A-18/T-01 primary-button contrast test lived here; its regex had lost its backslashes and skipped every theme, so it proved nothing.
// WCAG contrast for every token pair of all themes (including --color-on-primary on --color-primary) is now test/theme-contrast.test.js.
