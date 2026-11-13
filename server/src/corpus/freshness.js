// FRESHNESS: which question content is stable science and which can be outdated by a new guideline, drug, dose or cut-off.
// A deterministic, conservative reading of the text (no model): a time-sensitive hint makes the item NEED VERIFICATION; it never
// proves the item is wrong, and a stable-looking text is not proof of current validity either, only that nothing here flags it.
// Pure functions, no I/O.

// Clinical content that changes with guidelines. Portuguese, English and Spanish stems are all read.
const TIME_SENSITIVE = [
  /\b(diretriz|diretrizes|guideline|guidelines|gu[ií]a cl[ií]nica|consenso|consensus)\b/i,
  /\b(recomenda[cç][aã]o|recomenda[cç][oõ]es|recommendation|recommendations|recomendaci[oó]n)\b/i,
  /\b(primeira linha|first[- ]line|primera l[ií]nea|tratamento de escolha|treatment of choice)\b/i,
  /\b(dose|doses|posologia|dosage|dosing|mg\/kg|mg\/dia|mg\/day)\b/i,
  /\b(esquema vacinal|calend[aá]rio vacinal|vaccination schedule|vaccine schedule)\b/i,
  /\b(crit[eé]rios? diagn[oó]sticos?|diagnostic criteria|ponto de corte|cut-?off|valor de refer[eê]ncia|reference (range|value))\b/i,
  /\b(atualmente|currently|at present|hoje em dia|nowadays)\b/i,
  /\b(protocolo|protocol)\b/i,
];

/** @returns {{ stability: 'STABLE'|'TIME_SENSITIVE', needsVerification: boolean, reasons: string[] }} */
export function classifyFreshness({ stem = '', explanation = '', topic = '' } = {}) {
  const text = `${stem}\n${explanation ?? ''}\n${topic ?? ''}`;
  const reasons = TIME_SENSITIVE.filter((re) => re.test(text)).map((re) => re.source.split('|')[0].replace(/[\()b?:\[\]]/g, '').slice(0, 24));
  return reasons.length > 0
    ? { stability: 'TIME_SENSITIVE', needsVerification: true, reasons }
    : { stability: 'STABLE', needsVerification: false, reasons: [] };
}

/**
 * Whether an item written from an older edition may be shown as it is for a student now studying a newer one.
 * Stable science carries over; time-sensitive content from an older edition is held for verification, never shown as current.
 * An item with no known edition is judged on its text alone (unknown is not "current").
 */
export function editionVerdict(item, { studyingYear = null } = {}) {
  const older = Number.isInteger(item.year) && Number.isInteger(studyingYear) && item.year < studyingYear;
  if (item.needs_verification !== true) return { ok: true, reason: older ? 'STABLE_ACROSS_EDITIONS' : 'NO_FLAG' };
  if (older) return { ok: false, reason: 'OLDER_EDITION_TIME_SENSITIVE' };
  if (!Number.isInteger(item.year)) return { ok: false, reason: 'UNKNOWN_EDITION_TIME_SENSITIVE' };
  return { ok: true, reason: 'SAME_OR_NEWER_EDITION' };
}
