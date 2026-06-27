export const THEME_STORAGE_KEY = "smartlearn:theme";

export const THEME_OPTIONS = [
  {
    id: "auto",
    label: "Automático",
    mode: "auto",
    description: "Segue o tema do sistema.",
  },
  {
    id: "paper",
    label: "Papel",
    mode: "light",
    description: "Claro, calmo e legível.",
  },
  {
    id: "sepia",
    label: "Sépia",
    mode: "light",
    description: "Mais quente para leitura longa.",
  },
  {
    id: "night",
    label: "Noite",
    mode: "dark",
    description: "Escuro, estável e discreto.",
  },
  {
    id: "contrast",
    label: "Alto contraste",
    mode: "dark",
    description: "Mais nítido para leitura rápida.",
  },
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

const THEME_VARIABLES = {
  paper: {
    themeColor: "#f7f7f3",
    tokens: {
      "--color-bg": "oklch(0.972 0.008 262)",
      "--color-surface": "oklch(0.998 0.003 262)",
      "--color-surface-sunken": "oklch(0.955 0.01 262)",
      "--color-text": "oklch(0.29 0.035 264)",
      "--color-muted": "oklch(0.55 0.025 260)",
      "--color-border": "oklch(0.905 0.013 260)",
      "--color-primary": "oklch(0.52 0.155 264)",
      "--color-primary-strong": "oklch(0.46 0.16 264)",
      "--color-primary-soft": "oklch(0.955 0.03 264)",
      "--color-on-primary": "oklch(0.985 0.01 264)",
      "--status-overdue-text": "oklch(0.48 0.13 60)",
      "--status-overdue-fill": "oklch(0.95 0.055 75)",
      "--status-done-text": "oklch(0.48 0.11 155)",
      "--status-done-fill": "oklch(0.945 0.05 158)",
      "--shadow-card": "0 1px 2px oklch(0.35 0.03 80 / 0.06), 0 10px 28px oklch(0.35 0.03 80 / 0.08)",
    },
  },
  sepia: {
    themeColor: "#f5efe5",
    tokens: {
      "--color-bg": "oklch(0.968 0.011 84)",
      "--color-surface": "oklch(0.994 0.005 84)",
      "--color-surface-sunken": "oklch(0.946 0.014 84)",
      "--color-text": "oklch(0.305 0.03 80)",
      "--color-muted": "oklch(0.53 0.022 82)",
      "--color-border": "oklch(0.89 0.012 82)",
      "--color-primary": "oklch(0.52 0.155 264)",
      "--color-primary-strong": "oklch(0.46 0.16 264)",
      "--color-primary-soft": "oklch(0.948 0.028 264)",
      "--color-on-primary": "oklch(0.985 0.01 264)",
      "--status-overdue-text": "oklch(0.48 0.13 60)",
      "--status-overdue-fill": "oklch(0.95 0.055 75)",
      "--status-done-text": "oklch(0.48 0.11 155)",
      "--status-done-fill": "oklch(0.945 0.05 158)",
      "--shadow-card": "0 1px 2px oklch(0.35 0.03 80 / 0.05), 0 10px 28px oklch(0.35 0.03 80 / 0.07)",
    },
  },
  night: {
    themeColor: "#171c26",
    tokens: {
      "--color-bg": "oklch(0.2 0.012 262)",
      "--color-surface": "oklch(0.255 0.014 262)",
      "--color-surface-sunken": "oklch(0.175 0.012 262)",
      "--color-text": "oklch(0.94 0.012 262)",
      "--color-muted": "oklch(0.72 0.018 262)",
      "--color-border": "oklch(0.34 0.014 262)",
      "--color-primary": "oklch(0.72 0.15 264)",
      "--color-primary-strong": "oklch(0.8 0.14 264)",
      "--color-primary-soft": "oklch(0.3 0.055 264)",
      "--color-on-primary": "oklch(0.19 0.01 262)",
      "--status-overdue-text": "oklch(0.83 0.13 72)",
      "--status-overdue-fill": "oklch(0.34 0.06 60)",
      "--status-done-text": "oklch(0.82 0.12 156)",
      "--status-done-fill": "oklch(0.32 0.05 156)",
      "--shadow-card": "0 1px 2px oklch(0 0 0 / 0.35), 0 10px 28px oklch(0 0 0 / 0.42)",
    },
  },
  contrast: {
    themeColor: "#10141d",
    tokens: {
      "--color-bg": "oklch(0.115 0.01 262)",
      "--color-surface": "oklch(0.165 0.012 262)",
      "--color-surface-sunken": "oklch(0.225 0.014 262)",
      "--color-text": "oklch(0.985 0.005 262)",
      "--color-muted": "oklch(0.84 0.012 262)",
      "--color-border": "oklch(0.41 0.015 262)",
      "--color-primary": "oklch(0.86 0.14 264)",
      "--color-primary-strong": "oklch(0.93 0.14 264)",
      "--color-primary-soft": "oklch(0.25 0.04 264)",
      "--color-on-primary": "oklch(0.12 0.01 262)",
      "--status-overdue-text": "oklch(0.88 0.12 72)",
      "--status-overdue-fill": "oklch(0.28 0.05 60)",
      "--status-done-text": "oklch(0.88 0.11 156)",
      "--status-done-fill": "oklch(0.27 0.05 156)",
      "--shadow-card": "0 1px 2px oklch(0 0 0 / 0.45), 0 10px 28px oklch(0 0 0 / 0.52)",
    },
  },
};

function getSystemThemeMode() {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function getStoredThemePreference() {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY) || "auto";
    return LEGACY_THEME_ALIASES[saved] || saved;
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

export function applyThemePreference(preference, { persist = false } = {}) {
  const themeId = resolveThemePreference(preference);
  const theme = THEME_VARIABLES[themeId] || THEME_VARIABLES.paper;
  const root = document.documentElement;

  root.dataset.theme = themeId;
  root.dataset.themeMode = themeId === "night" || themeId === "contrast" ? "dark" : "light";
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
