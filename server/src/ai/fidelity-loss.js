// Deterministic measure (no AI, no cost) of the loss that flips meaning (P1-9): a word the source states (a negation, a qualifier, a condition,
// a number) that is missing from the summary sentence that restates the same idea. Reports only; it never edits the summary and it does not
// replace the model audit. Source sentences are matched to summary sentences by shared content words, so a summary that rewords freely is judged
// on the idea, not on the exact phrase. Pure function.

const LEXICON = {
  NEGATION: ['não', 'nunca', 'nenhum', 'nenhuma', 'sem', 'jamais', 'tampouco', 'not', 'no', 'never', 'none', 'without', 'neither', 'nor', 'cannot', 'nunca', 'ningún', 'ninguna', 'sin', 'tampoco'],
  QUALIFIER: ['apenas', 'somente', 'só', 'exclusivamente', 'principalmente', 'geralmente', 'raramente', 'sempre', 'todos', 'todas', 'alguns', 'algumas', 'maioria', 'only', 'solely', 'mainly', 'usually', 'rarely', 'always', 'all', 'some', 'most', 'solo', 'sólo', 'principalmente', 'siempre', 'todos', 'algunos', 'mayoría', 'mais', 'menos', 'more', 'less', 'más', 'menos'],
  CONDITION: ['se', 'quando', 'exceto', 'salvo', 'desde que', 'caso', 'unless', 'except', 'if', 'when', 'provided', 'only if', 'si', 'cuando', 'excepto', 'salvo que'],
};
const STOPWORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'a', 'o', 'as', 'os', 'e', 'em', 'um', 'uma', 'que', 'para', 'por', 'com', 'na', 'no', 'nas', 'nos', 'é', 'são', 'the', 'of', 'and', 'in', 'to', 'is', 'are', 'a', 'an', 'for', 'with', 'on', 'el', 'la', 'los', 'las', 'y', 'en', 'un', 'una', 'es', 'son', 'del', 'se', 'ao', 'à']);

const strip = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const words = (s) => strip(s).match(/[\p{L}\p{N}]+(?:[.,]\p{N}+)?/gu) ?? [];
const stem = (w) => (w.length > 5 ? w.slice(0, 5) : w);
const contentStems = (s) => new Set(words(s).filter((w) => w.length > 2 && !STOPWORDS.has(w) && !/^\d/.test(w)).map(stem));

// Function words that belong to ONE language, to tell whether the source and the summary are written in the same one. Words shared by
// Portuguese and Spanish ("de", "que") are left out on purpose.
const LANGUAGE_MARKERS = {
  en: ['the', 'of', 'and', 'is', 'are', 'that', 'with', 'this', 'which', 'from', 'by', 'be', 'it', 'as', 'for', 'was', 'were', 'has', 'have', 'or', 'an', 'in', 'to', 'at'],
  pt: ['não', 'uma', 'dos', 'das', 'são', 'é', 'pelo', 'pela', 'também', 'os', 'ao', 'mais', 'do', 'da', 'um', 'com', 'na', 'em', 'ela', 'ele', 'ou'],
  es: ['los', 'las', 'una', 'del', 'y', 'es', 'son', 'también', 'pero', 'más'],
};
const MARKER_SETS = Object.fromEntries(Object.entries(LANGUAGE_MARKERS).map(([lang, list]) => [lang, new Set(list.map((w) => w.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()))]));

/** Dominant language of a text by marker words, or null when the evidence is thin (fewer than 3 markers, or no clear lead over the runner-up). */
function dominantLanguage(text) {
  const counts = { en: 0, pt: 0, es: 0 };
  for (const w of words(text)) for (const lang of Object.keys(counts)) if (MARKER_SETS[lang].has(w)) counts[lang] += 1;
  const [[lang, n], [, second]] = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return n >= 3 && n >= second * 1.5 ? lang : null;
}

// A figure caption or a chart's labels are not statements a summary should repeat: skip them (their numbers are axis values and figure ids).
const FIGURE_SENTENCE = /\b(fig(ura|ure)?\.?|tabela|table|quadro|box)\s*\d/i;
const isFigureMaterial = (sentence) => FIGURE_SENTENCE.test(sentence) || (sentence.match(/·/g) ?? []).length >= 3;

function sentences(text) {
  return String(text).replace(/^#{1,6}\s.*$/gm, ' ').split(/(?<=[.!?;])\s+|\n+/).map((s) => s.trim()).filter((s) => s.length > 12);
}

const FLAGGED = (() => {
  const map = new Map();
  for (const [kind, list] of Object.entries(LEXICON)) for (const w of list) if (!map.has(strip(w))) map.set(strip(w), kind);
  return map;
})();

/** Flagged terms of a sentence: [{ kind, term }]. Single-word conditions like "se" are too common to count alone, so CONDITION needs a longer word. */
function flaggedIn(sentence) {
  const found = [];
  const ws = words(sentence);
  for (const w of ws) {
    const kind = FLAGGED.get(w);
    if (kind && !(kind === 'CONDITION' && w.length < 4) && !(kind === 'QUALIFIER' && w.length < 3)) found.push({ kind, term: w });
    else if (/^\d/.test(w) && (w.includes('.') || w.includes(',') || w.length >= 2)) found.push({ kind: 'NUMBER', term: w.replace(',', '.') });
  }
  return found;
}

/** The summary sentence that restates the same idea (most shared content stems, at least 3 and `minOverlap` of the shorter sentence), or null. */
function closestSummarySentence(stems, summarySentences, minOverlap) {
  let best = null;
  for (const cand of summarySentences) {
    let shared = 0;
    for (const s of cand.stems) if (stems.has(s)) shared += 1;
    const score = shared / Math.min(stems.size, cand.stems.size || 1);
    if (shared >= 3 && score >= minOverlap && (!best || score > best.score)) best = { cand, score };
  }
  return best?.cand ?? null;
}

/**
 * @returns {{ checked: number, lost: Array<{ kind: string, term: string, sourceSentence: string, summarySentence: string }> }}
 * checked = source sentences that carry at least one flagged term AND have a summary sentence on the same idea.
 */
export function measureFidelityLoss(sourceText, summary, { minOverlap = 0.5 } = {}) {
  // Another language than the source: the words cannot match, so every negation and qualifier would look lost. Not judged (the model audit
  // still checks it); `skipped` says why, so the screen does not read "nothing found" as "nothing lost".
  const sourceLanguage = dominantLanguage(sourceText);
  const summaryLanguage = dominantLanguage(summary);
  if (sourceLanguage && summaryLanguage && sourceLanguage !== summaryLanguage) return { checked: 0, lost: [], skipped: 'LANGUAGE_MISMATCH' };
  const summarySentences = sentences(summary).map((text) => ({ text, stems: contentStems(text), terms: new Set(flaggedIn(text).map((f) => f.term)) }));
  const lost = [];
  let checked = 0;
  for (const sourceSentence of sentences(sourceText)) {
    if (isFigureMaterial(sourceSentence)) continue;
    const flagged = flaggedIn(sourceSentence);
    if (flagged.length === 0) continue;
    const stems = contentStems(sourceSentence);
    if (stems.size < 3) continue;
    const match = closestSummarySentence(stems, summarySentences, minOverlap);
    if (!match) continue;
    checked += 1;
    const missing = flagged.filter((f, i) => !match.terms.has(f.term) && flagged.findIndex((g) => g.kind === f.kind && g.term === f.term) === i);
    for (const f of missing) lost.push({ kind: f.kind, term: f.term, sourceSentence, summarySentence: match.text });
  }
  return { checked, lost };
}
