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
