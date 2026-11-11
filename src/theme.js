import { t } from "./i18n/index.js";

export const THEME_STORAGE_KEY = "smartlearn:theme";

// label and description are read through t() on every access, so they follow the active interface language; the texts live in
// src/i18n/locales/pt-BR.js under theme.<id>.label / theme.<id>.description.
const themeOption = (id, mode) => ({
  id,
  mode,
  get label() { return t(`theme.${id}.label`); },
  get description() { return t(`theme.${id}.description`); },
});

export const THEME_OPTIONS = [
  themeOption("auto", "auto"),
  themeOption("paper", "light"),
  themeOption("sepia", "light"),
  themeOption("ocean", "light"),
  themeOption("forest", "light"),
  themeOption("night", "dark"),
  themeOption("contrast", "dark"),
  themeOption("dusk", "dark"),
  themeOption("dracula", "dark"),
  themeOption("catppuccin", "dark"),
  themeOption("onedark", "dark"),
  themeOption("gruvbox", "dark"),
  themeOption("neon", "dark"),
  themeOption("premium", "dark"),
  themeOption("tokyo", "dark"),
  themeOption("midnight", "dark"),
  themeOption("forest-serenity", "dark"),
  themeOption("sunset", "dark"),
  themeOption("cyberpunk", "dark"),
  themeOption("catppuccin-latte", "light"),
  themeOption("gruvbox-light", "light"),
  themeOption("solarized-light", "light"),
  themeOption("dracula-light", "light"),
  themeOption("tokyo-day", "light"),
];

const THEME_OPTIONS_BY_ID = new Map(THEME_OPTIONS.map((option) => [option.id, option]));

const THEME_DEFAULTS_BY_MODE = {
  light: "paper",
  dark: "night",
};

const LEGACY_THEME_ALIASES = {
  light: "paper",
  dark: "night",
};

export const THEME_VARIABLES = {
  paper: {
    themeColor: "#f2f6fb",
    tokens: {
      "--color-bg": "#f2f6fb",
      "--color-surface": "#ffffff",
      "--color-surface-sunken": "#edf0fb",
      "--color-text": "#202640",
      "--color-muted": "#536077",
      "--color-border": "#d4dcf0",
      "--color-primary": "#6437e3",
      "--color-primary-strong": "#4c26b6",
      "--color-primary-soft": "#e9e2ff",
      "--color-on-primary": "#ffffff",
      "--status-overdue-text": "oklch(0.48 0.13 60)",
      "--status-overdue-fill": "oklch(0.95 0.055 75)",
      "--status-done-text": "oklch(0.48 0.11 155)",
      "--status-done-fill": "oklch(0.945 0.05 158)",
      "--shadow-card": "0 1px 2px oklch(0.35 0.03 80 / 0.06), 0 10px 28px oklch(0.35 0.03 80 / 0.08)",
    },
  },
  sepia: {
    themeColor: "#f8f1e9",
    tokens: {
      "--color-bg": "#f8f1e9",
      "--color-surface": "#fffcf6",
      "--color-surface-sunken": "#f4e8d7",
      "--color-text": "#30291f",
      "--color-muted": "#70543c",
      "--color-border": "#e5d3be",
      "--color-primary": "#ad4619",
      "--color-primary-strong": "#84300e",
      "--color-primary-soft": "#f9e7d6",
      "--color-on-primary": "#ffffff",
      "--status-overdue-text": "oklch(0.48 0.13 60)",
      "--status-overdue-fill": "oklch(0.95 0.055 75)",
      "--status-done-text": "oklch(0.48 0.11 155)",
      "--status-done-fill": "oklch(0.945 0.05 158)",
      "--shadow-card": "0 1px 2px oklch(0.35 0.03 80 / 0.05), 0 10px 28px oklch(0.35 0.03 80 / 0.07)",
    },
  },
  ocean: {
    themeColor: "#edf7fa",
    tokens: {
      "--color-bg": "oklch(0.972 0.018 215)",
      "--color-surface": "oklch(0.998 0.006 215)",
      "--color-surface-sunken": "oklch(0.948 0.022 215)",
      "--color-text": "oklch(0.29 0.045 225)",
      "--color-muted": "oklch(0.52 0.035 220)",
      "--color-border": "oklch(0.89 0.025 215)",
      "--color-primary": "oklch(0.5 0.1 220)",
      "--color-primary-strong": "oklch(0.46 0.15 220)",
      "--color-primary-soft": "oklch(0.94 0.045 215)",
      "--color-on-primary": "oklch(0.985 0.01 215)",
      "--status-overdue-text": "oklch(0.48 0.13 60)",
      "--status-overdue-fill": "oklch(0.95 0.055 75)",
      "--status-done-text": "oklch(0.48 0.11 155)",
      "--status-done-fill": "oklch(0.945 0.05 158)",
      "--shadow-card": "0 1px 2px oklch(0.3 0.04 215 / 0.06), 0 10px 28px oklch(0.3 0.04 215 / 0.08)",
    },
  },
  forest: {
    themeColor: "#f1f7f1",
    tokens: {
      "--color-bg": "oklch(0.972 0.018 150)",
      "--color-surface": "oklch(0.998 0.006 150)",
      "--color-surface-sunken": "oklch(0.948 0.022 150)",
      "--color-text": "oklch(0.29 0.045 150)",
      "--color-muted": "oklch(0.51 0.035 150)",
      "--color-border": "oklch(0.89 0.022 150)",
      "--color-primary": "oklch(0.5 0.13 150)",
      "--color-primary-strong": "oklch(0.43 0.14 150)",
      "--color-primary-soft": "oklch(0.94 0.04 150)",
      "--color-on-primary": "oklch(0.985 0.01 150)",
      "--status-overdue-text": "oklch(0.48 0.13 60)",
      "--status-overdue-fill": "oklch(0.95 0.055 75)",
      "--status-done-text": "oklch(0.48 0.11 155)",
      "--status-done-fill": "oklch(0.945 0.05 158)",
      "--shadow-card": "0 1px 2px oklch(0.3 0.04 150 / 0.06), 0 10px 28px oklch(0.3 0.04 150 / 0.08)",
    },
  },
  night: {
    themeColor: "#111527",
    tokens: {
      "--color-bg": "#111527",
      "--color-surface": "#1e2538",
      "--color-surface-sunken": "#272f49",
      "--color-text": "#f2f5ff",
      "--color-muted": "#c1c9dd",
      "--color-border": "#414a69",
      "--color-primary": "#baa3ff",
      "--color-primary-strong": "#dacaff",
      "--color-primary-soft": "#393258",
      "--color-on-primary": "#1c1630",
      "--status-overdue-text": "oklch(0.83 0.13 72)",
      "--status-overdue-fill": "oklch(0.34 0.06 60)",
      "--status-done-text": "oklch(0.82 0.12 156)",
      "--status-done-fill": "oklch(0.32 0.05 156)",
      "--shadow-card": "0 1px 2px oklch(0 0 0 / 0.35), 0 10px 28px oklch(0 0 0 / 0.42)",
    },
  },
  contrast: {
    themeColor: "#080a10",
    tokens: {
      "--color-bg": "#080a10",
      "--color-surface": "#141925",
      "--color-surface-sunken": "#242b3d",
      "--color-text": "#ffffff",
      "--color-muted": "#e1e6f2",
      "--color-border": "#929cb9",
      "--color-primary": "#d5b6ff",
      "--color-primary-strong": "#ead6ff",
      "--color-primary-soft": "#3a2c53",
      "--color-on-primary": "#180e29",
      "--status-overdue-text": "oklch(0.88 0.12 72)",
      "--status-overdue-fill": "oklch(0.28 0.05 60)",
      "--status-done-text": "oklch(0.88 0.11 156)",
      "--status-done-fill": "oklch(0.27 0.05 156)",
      "--shadow-card": "0 1px 2px oklch(0 0 0 / 0.45), 0 10px 28px oklch(0 0 0 / 0.52)",
    },
  },
  dusk: {
    themeColor: "#1b1727",
    tokens: {
      "--color-bg": "oklch(0.2 0.025 300)",
      "--color-surface": "oklch(0.255 0.03 300)",
      "--color-surface-sunken": "oklch(0.175 0.025 300)",
      "--color-text": "oklch(0.94 0.018 300)",
      "--color-muted": "oklch(0.72 0.028 300)",
      "--color-border": "oklch(0.35 0.03 300)",
      "--color-primary": "oklch(0.73 0.14 315)",
      "--color-primary-strong": "oklch(0.81 0.13 315)",
      "--color-primary-soft": "oklch(0.31 0.06 315)",
      "--color-on-primary": "oklch(0.19 0.02 300)",
      "--status-overdue-text": "oklch(0.83 0.13 72)",
      "--status-overdue-fill": "oklch(0.34 0.06 60)",
      "--status-done-text": "oklch(0.82 0.12 156)",
      "--status-done-fill": "oklch(0.32 0.05 156)",
      "--shadow-card": "0 1px 2px oklch(0 0 0 / 0.35), 0 10px 28px oklch(0 0 0 / 0.42)",
    },
  },
};

// Contrast: every foreground token here is held at WCAG AA (4.5:1 text, 3:1 UI) on the backgrounds it is drawn on, enforced for all themes by
// test/theme-contrast.test.js. When a palette fails, change only the failing foreground token's lightness (same hue), never the backgrounds.
// SmartPrompt2 theme tokens adapted to SmartLearn's semantic token contract.
// The source project uses RGB triplets; keeping them as CSS rgb() values here
// preserves the palettes while allowing the rest of SmartLearn to consume the
// same --color-* variables as its native themes.
const SMARTPROMPT_THEME_DEFINITIONS = [
  ["dracula", "dark", [6, 7, 10], [10, 11, 15], [38, 40, 54], [100, 100, 120], [248, 248, 242], [220, 223, 228], [189, 147, 249], [255, 121, 198]],
  ["catppuccin", "dark", [10, 10, 20], [12, 12, 22], [30, 30, 46], [90, 90, 110], [245, 224, 220], [203, 208, 245], [137, 180, 250], [243, 139, 168]],
  ["onedark", "dark", [10, 10, 16], [13, 13, 20], [31, 31, 43], [90, 95, 110], [171, 178, 191], [198, 207, 221], [97, 175, 239], [229, 192, 123]],
  ["gruvbox", "dark", [10, 10, 10], [14, 14, 14], [32, 32, 32], [100, 90, 80], [235, 219, 178], [213, 196, 161], [251, 241, 199], [241, 77, 63]],
  ["neon", "dark", [5, 5, 5], [8, 8, 8], [28, 28, 28], [80, 80, 80], [255, 255, 255], [200, 200, 200], [6, 182, 212], [236, 72, 153]],
  ["premium", "dark", [8, 10, 18], [12, 16, 28], [20, 28, 48], [30, 45, 75], [248, 250, 252], [148, 163, 184], [34, 211, 238], [6, 182, 212]],
  ["tokyo", "dark", [10, 11, 18], [13, 14, 22], [31, 32, 46], [90, 95, 120], [224, 225, 232], [187, 191, 209], [122, 162, 247], [187, 154, 214]],
  ["midnight", "dark", [11, 14, 20], [21, 27, 40], [30, 41, 59], [51, 65, 85], [248, 250, 252], [148, 163, 184], [124, 131, 255], [129, 140, 248]],
  ["forest-serenity", "dark", [10, 18, 14], [20, 34, 26], [28, 46, 36], [45, 74, 58], [236, 253, 245], [167, 243, 208], [74, 222, 128], [52, 211, 153]],
  ["sunset", "dark", [28, 15, 25], [46, 22, 40], [68, 30, 58], [112, 36, 89], [255, 241, 242], [253, 164, 175], [244, 114, 182], [251, 146, 60]],
  ["cyberpunk", "dark", [2, 2, 2], [18, 18, 18], [35, 35, 35], [60, 60, 60], [255, 255, 255], [212, 212, 216], [250, 204, 21], [6, 182, 212]],
  ["catppuccin-latte", "light", [239, 241, 245], [230, 233, 239], [220, 224, 232], [220, 224, 232], [76, 79, 105], [94, 98, 120], [30, 58, 138], [60, 99, 163]],
  ["gruvbox-light", "light", [251, 241, 199], [235, 219, 178], [213, 196, 161], [213, 196, 161], [60, 56, 54], [80, 73, 69], [169, 0, 0], [156, 37, 0]],
  ["solarized-light", "light", [253, 246, 227], [238, 232, 213], [220, 213, 197], [220, 213, 197], [59, 81, 89], [75, 96, 104], [0, 96, 157], [32, 85, 149]],
  ["dracula-light", "light", [248, 246, 247], [231, 230, 233], [211, 210, 214], [211, 210, 214], [40, 42, 54], [68, 71, 90], [105, 76, 145], [164, 33, 117]],
  ["tokyo-day", "light", [227, 230, 239], [248, 250, 253], [236, 240, 251], [200, 205, 216], [37, 39, 56], [65, 70, 92], [75, 102, 161], [127, 96, 152]],
].map(([id, mode, background, surface, hover, border, text, muted, primary, primaryStrong]) => ({
  id,
  mode,
  themeColor: `rgb(${background.join(" ")})`,
  tokens: {
    "--color-bg": `rgb(${background.join(" ")})`,
    "--color-surface": `rgb(${surface.join(" ")})`,
    "--color-surface-sunken": `rgb(${hover.join(" ")})`,
    "--color-text": `rgb(${text.join(" ")})`,
    "--color-muted": `rgb(${muted.join(" ")})`,
    "--color-border": `rgb(${border.join(" ")})`,
    "--color-primary": `rgb(${primary.join(" ")})`,
    "--color-primary-strong": `rgb(${primaryStrong.join(" ")})`,
    "--color-primary-soft": `rgb(${hover.join(" ")})`,
    "--color-on-primary": mode === "dark" ? "rgb(8 10 18)" : "rgb(255 255 255)",
    "--status-overdue-text": mode === "dark" ? "oklch(0.83 0.13 72)" : "oklch(0.48 0.13 60)",
    "--status-overdue-fill": mode === "dark" ? "oklch(0.34 0.06 60)" : "oklch(0.95 0.055 75)",
    "--status-done-text": mode === "dark" ? "oklch(0.82 0.12 156)" : "oklch(0.48 0.11 155)",
    "--status-done-fill": mode === "dark" ? "oklch(0.32 0.05 156)" : "oklch(0.945 0.05 158)",
    "--shadow-card": mode === "dark" ? "0 1px 2px rgb(0 0 0 / 0.35), 0 10px 28px rgb(0 0 0 / 0.42)" : "0 1px 2px rgb(0 0 0 / 0.06), 0 10px 28px rgb(0 0 0 / 0.08)",
  },
}));

Object.assign(THEME_VARIABLES, Object.fromEntries(
  SMARTPROMPT_THEME_DEFINITIONS.map(({ id, themeColor, tokens }) => [id, { themeColor, tokens }]),
));

function getSystemThemeMode() {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function getStoredThemePreference() {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (!saved) return "auto";
    const normalized = LEGACY_THEME_ALIASES[saved] || saved;
    return THEME_OPTIONS_BY_ID.has(normalized) ? normalized : "auto";
  } catch {
    return "auto";
  }
}

export function resolveThemePreference(preference, systemMode = getSystemThemeMode()) {
  const normalizedPreference = LEGACY_THEME_ALIASES[preference] || preference;

  if (normalizedPreference === "auto") {
    return THEME_DEFAULTS_BY_MODE[systemMode] || THEME_DEFAULTS_BY_MODE.light;
  }

  return THEME_OPTIONS_BY_ID.has(normalizedPreference)
    ? normalizedPreference
    : THEME_DEFAULTS_BY_MODE.light;
}

// Quick light/dark button: flips the mode but remembers, per mode, the preference the user was on, so the second click returns to it
// (picking Dracula, toggling to light and back lands on Dracula, not on Noite). `preference` may be "auto"; it is remembered as such.
export const QUICK_TOGGLE_MEMORY_KEY = "smartlearn:theme-quick-memory";

export function quickToggleTarget(preference, systemMode, memory = {}) {
  const modeOf = (pref) => (THEME_OPTIONS_BY_ID.get(resolveThemePreference(pref, systemMode))?.mode === "dark" ? "dark" : "light");
  const mode = modeOf(preference);
  const other = mode === "dark" ? "light" : "dark";
  const remembered = memory[other];
  const usable = typeof remembered === "string" && (remembered === "auto" || THEME_OPTIONS_BY_ID.has(remembered)) && modeOf(remembered) === other;
  return { target: usable ? remembered : THEME_DEFAULTS_BY_MODE[other], memory: { ...memory, [mode]: preference } };
}

export function readQuickToggleMemory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(QUICK_TOGGLE_MEMORY_KEY) || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(["light", "dark"].filter((mode) => typeof parsed[mode] === "string").map((mode) => [mode, parsed[mode]]));
  } catch {
    return {};
  }
}

export function writeQuickToggleMemory(memory) {
  try {
    localStorage.setItem(QUICK_TOGGLE_MEMORY_KEY, JSON.stringify(memory));
  } catch {
    // localStorage indisponível: a lembrança vale só nesta sessão (o chamador guarda a memória em variável).
  }
}

export function applyThemePreference(preference, { persist = false } = {}) {
  const themeId = resolveThemePreference(preference);
  const theme = THEME_VARIABLES[themeId] || THEME_VARIABLES.paper;
  const themeOption = THEME_OPTIONS_BY_ID.get(themeId);
  const root = document.documentElement;

  root.dataset.theme = themeId;
  root.dataset.themeMode = themeOption?.mode === "dark" ? "dark" : "light";
  root.style.colorScheme = root.dataset.themeMode;

  for (const [property, value] of Object.entries(theme.tokens)) {
    root.style.setProperty(property, value);
  }

  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) {
    metaThemeColor.setAttribute("content", theme.themeColor);
  }

  if (persist) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, preference);
    } catch {
      // localStorage indisponível: tema vale só nesta sessão.
    }
  }

  return {
    preference,
    themeId,
    theme,
    mode: root.dataset.themeMode,
  };
}

export function getThemeOption(themeId) {
  return THEME_OPTIONS_BY_ID.get(themeId) || null;
}
