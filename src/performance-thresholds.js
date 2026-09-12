// PERFORMANCE_BAND != MASTERY: thresholds are visual display heuristics, not scientific truth.
// States indicate "worth attention", not absolute capability.

export const THRESHOLDS = {
  STRONG: 80,
  ADEQUATE: 65,
  ATTENTION: 50,
};

export const TREND_DELTA_MIN = 0.03;

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
};

export const DEFAULT_SUBJECT_COLOR = 'DISC-BLUE';

export const SUBJECT_COLOR_KEYS = Object.keys(SUBJECT_COLORS);

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
// how well a subject/unit is doing (0%=red, 60%=yellow, 100%=green); it does
// not identify or replace the subject's own color (colorVarForKey above).
export const PERFORMANCE_COLOR_NEUTRAL = 'var(--color-text-muted)';
const PERFORMANCE_COLOR_STOPS = [
  { pct: 0, rgb: [220, 38, 38] },   // red-600
  { pct: 60, rgb: [234, 179, 8] },  // yellow-500
  { pct: 100, rgb: [22, 163, 74] }, // green-600
];

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}

export function performanceColor(weightedAccuracy, totalQuestions) {
  if (totalQuestions == null || totalQuestions === 0) return PERFORMANCE_COLOR_NEUTRAL;
  const pct = Number(weightedAccuracy);
  if (!Number.isFinite(pct)) return PERFORMANCE_COLOR_NEUTRAL;
  const clamped = Math.min(100, Math.max(0, pct));

  const [lo, hi] = clamped <= 60
    ? [PERFORMANCE_COLOR_STOPS[0], PERFORMANCE_COLOR_STOPS[1]]
    : [PERFORMANCE_COLOR_STOPS[1], PERFORMANCE_COLOR_STOPS[2]];
  const t = (clamped - lo.pct) / (hi.pct - lo.pct);

  const [r, g, b] = [0, 1, 2].map((i) => lerp(lo.rgb[i], hi.rgb[i], t));
  return `rgb(${r}, ${g}, ${b})`;
}
