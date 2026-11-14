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
const words = (s) => strip(s).match(/[\p{L}\p{N}]+(?:[.,][\p{N}]+)?/gu) ?? [];
const stem = (w) => (w.length > 5 ? w.slice(0, 5) : w);
const contentStems = (s) => new Set(words(s).filter((w) => w.length > 2 && !STOPWORDS.has(w) && !/^\d/.test(w)).map(stem));

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

/**
 * @returns {{ checked: number, lost: Array<{ kind: string, term: string, sourceSentence: string, summarySentence: string }> }}
 * checked = source sentences that carry at least one flagged term AND have a summary sentence on the same idea.
 */
export function measureFidelityLoss(sourceText, summary, { minOverlap = 0.5 } = {}) {
  const summarySentences = sentences(summary).map((text) => ({ text, stems: contentStems(text), terms: new Set(flaggedIn(text).map((f) => f.term)) }));
  const lost = [];
  let checked = 0;
  for (const sourceSentence of sentences(sourceText)) {
    const flagged = flaggedIn(sourceSentence);
    if (flagged.length === 0) continue;
    const stems = contentStems(sourceSentence);
    if (stems.size < 3) continue;
    let best = null;
    for (const cand of summarySentences) {
      let shared = 0;
      for (const s of cand.stems) if (stems.has(s)) shared += 1;
      const score = shared / Math.min(stems.size, cand.stems.size || 1);
      if (shared >= 3 && score >= minOverlap && (!best || score > best.score)) best = { cand, score };
    }
    if (!best) continue;
    checked += 1;
    const seen = new Set();
    for (const f of flagged) {
      const key = `${f.kind}:${f.term}`;
      if (seen.has(key) || best.cand.terms.has(f.term)) continue;
      seen.add(key);
      lost.push({ kind: f.kind, term: f.term, sourceSentence, summarySentence: best.cand.text });
    }
  }
  return { checked, lost };
}
