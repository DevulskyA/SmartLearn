// PERFORMANCE_BAND != MASTERY: thresholds are visual display heuristics, not scientific truth.
// States indicate "worth attention", not absolute capability.

export const THRESHOLDS = {
  STRONG: 80,
  ADEQUATE: 65,
  ATTENTION: 50,
};

export const TREND_DELTA_MIN = 0.03;

// Fewer questions than this is "not enough evidence", never "difficulty": the colour stays neutral, as it already does
// with no evidence. Same value as the server's MIN_SAMPLE_QUESTIONS and the trend minimum (a test pins the equality).
export const MIN_SAMPLE_QUESTIONS = 10;

// VERDICT-1 (human-approved): the aggregate "Meu estudo está funcionando?" headline says "Resultado misto" only
// when BOTH improving and worsening subjects each hold at least this share of the compared question volume.
export const VERDICT_MIXED_VOLUME_SHARE_MIN = 0.25;

export const PERFORMANCE_STATES = {
  STRONG: 'STRONG',
  ADEQUATE: 'ADEQUATE',
  ATTENTION: 'ATTENTION',
  CRITICAL: 'CRITICAL',
  NO_EVIDENCE: 'NO_EVIDENCE',
};

export const SUBJECT_COLORS = {
  'DISC-BLUE': { light: '#2563eb', dark: '#60a5fa', css: 'disc-blue' },
  'DISC-GREEN': { light: '#16a34a', dark: '#4ade80', css: 'disc-green' },
  'DISC-PURPLE': { light: '#7c3aed', dark: '#c084fc', css: 'disc-purple' },
  'DISC-ORANGE': { light: '#ea580c', dark: '#fb923c', css: 'disc-orange' },
  'DISC-RED': { light: '#dc2626', dark: '#f87171', css: 'disc-red' },
  'DISC-TEAL': { light: '#0d9488', dark: '#2dd4bf', css: 'disc-teal' },
  'DISC-PINK': { light: '#db2777', dark: '#f472b6', css: 'disc-pink' },
  'DISC-INDIGO': { light: '#4338ca', dark: '#818cf8', css: 'disc-indigo' },
  'DISC-LIME': { light: '#65a30d', dark: '#a3e635', css: 'disc-lime' },
  'DISC-AMBER': { light: '#d97706', dark: '#fbbf24', css: 'disc-amber' },
  'DISC-CYAN': { light: '#0891b2', dark: '#22d3ee', css: 'disc-cyan' },
  'DISC-ROSE': { light: '#e11d48', dark: '#fb7185', css: 'disc-rose' },
  'DISC-FUCHSIA': { light: '#c026d3', dark: '#e879f9', css: 'disc-fuchsia' },
  'DISC-SLATE': { light: '#475569', dark: '#94a3b8', css: 'disc-slate' },
  'DISC-BROWN': { light: '#92400e', dark: '#d4a373', css: 'disc-brown' },
  'DISC-EMERALD': { light: '#059669', dark: '#34d399', css: 'disc-emerald' },
  'DISC-SKY': { light: '#0284c7', dark: '#38bdf8', css: 'disc-sky' },
  'DISC-OLIVE': { light: '#4d7c0f', dark: '#9aa84a', css: 'disc-olive' },
};

export const DEFAULT_SUBJECT_COLOR = 'DISC-BLUE';

export const SUBJECT_COLOR_KEYS = Object.keys(SUBJECT_COLORS);

// The colour a new discipline starts with: the first one no existing discipline uses, so students who never open the picker do not end up with all-blue disciplines.
export function firstUnusedSubjectColor(usedColors = []) {
  const used = new Set(usedColors);
  return SUBJECT_COLOR_KEYS.find((key) => !used.has(key)) ?? DEFAULT_SUBJECT_COLOR;
}

export function getState(weightedAccuracy, totalQuestions) {
  if (totalQuestions == null || totalQuestions === 0) return PERFORMANCE_STATES.NO_EVIDENCE;
  const pct = Number(weightedAccuracy);
  if (!Number.isFinite(pct)) return PERFORMANCE_STATES.NO_EVIDENCE;
  if (pct >= THRESHOLDS.STRONG) return PERFORMANCE_STATES.STRONG;
  if (pct >= THRESHOLDS.ADEQUATE) return PERFORMANCE_STATES.ADEQUATE;
  if (pct >= THRESHOLDS.ATTENTION) return PERFORMANCE_STATES.ATTENTION;
  return PERFORMANCE_STATES.CRITICAL;
}

export function colorVarForKey(colorKey) {
  const key = SUBJECT_COLORS[colorKey] ? colorKey : DEFAULT_SUBJECT_COLOR;
  return `--disc-color-${SUBJECT_COLORS[key].css}`;
}

// PERFORMANCE_COLOR != SUBJECT_COLOR. This is a continuous visual signal for
// how well a subject/unit is doing (0%=red, 60-79%=yellow, 80%=blue, 100%=dark blue); it does
// not identify or replace the subject's own color (colorVarForKey above).
// Keep the neutral performance state readable in every theme. `--color-text-muted`
// was never part of the theme contract, so browsers fell back to the inherited
// foreground and could render the neutral label with the wrong contrast.
export const PERFORMANCE_COLOR_NEUTRAL = 'var(--color-muted)';
// Contrato cromático V7.2 (decisão do dono: sem verde para desempenho). Pontos de referência, interpolados linearmente
// dentro de cada faixa: 0-50 vermelho>laranja, 50-65 laranja>âmbar, 65-79,99 âmbar>amarelo; em 80% o azul começa (salto
// intencional) e escurece até 100%. Há um conjunto para temas claros e outro para escuros.
const PERFORMANCE_STOPS = {
  light: [
    { pct: 0, rgb: [220, 38, 38] },     // #DC2626
    { pct: 50, rgb: [234, 88, 12] },    // #EA580C
    { pct: 65, rgb: [245, 158, 11] },   // #F59E0B
    { pct: 79.99, rgb: [234, 179, 8] }, // #EAB308
    { pct: 80, rgb: [96, 165, 250] },   // #60A5FA
    { pct: 90, rgb: [37, 99, 235] },    // #2563EB
    { pct: 100, rgb: [30, 58, 138] },   // #1E3A8A
  ],
  dark: [
    { pct: 0, rgb: [248, 113, 113] },    // #F87171
    { pct: 50, rgb: [251, 146, 60] },    // #FB923C
    { pct: 65, rgb: [251, 191, 36] },    // #FBBF24
    { pct: 79.99, rgb: [253, 224, 71] }, // #FDE047
    { pct: 80, rgb: [147, 197, 253] },   // #93C5FD
    { pct: 90, rgb: [96, 165, 250] },    // #60A5FA
    { pct: 100, rgb: [59, 130, 246] },   // #3B82F6
  ],
};

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}

export function performanceColor(weightedAccuracy, totalQuestions, { dark = false } = {}) {
  if (totalQuestions == null || totalQuestions < MIN_SAMPLE_QUESTIONS) return PERFORMANCE_COLOR_NEUTRAL;
  const pct = Number(weightedAccuracy);
  if (!Number.isFinite(pct)) return PERFORMANCE_COLOR_NEUTRAL;
  const clamped = Math.min(100, Math.max(0, pct));
  const stops = PERFORMANCE_STOPS[dark ? 'dark' : 'light'];
  const hiIndex = stops.findIndex((stop) => clamped <= stop.pct);
  const hi = stops[hiIndex];
  const lo = stops[Math.max(0, hiIndex - 1)];
  const t = hi.pct === lo.pct ? 0 : (clamped - lo.pct) / (hi.pct - lo.pct);
  const [r, g, b] = [0, 1, 2].map((i) => lerp(lo.rgb[i], hi.rgb[i], t));
  return `rgb(${r}, ${g}, ${b})`;
}

// VOLUME != PERFORMANCE: how much a subject was practiced, scaled relative
// to the largest volume in the currently displayed set — never mapped
// through performanceColor, and never a factor in it either.
export function volumeBarWidth(totalQuestions, maxVolume) {
  if (!maxVolume) return 0;
  return Math.min(100, Math.max(0, (Number(totalQuestions) || 0) / maxVolume * 100));
}
