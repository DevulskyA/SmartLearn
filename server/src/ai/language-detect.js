// CROSS-LANGUAGE AUDIT. The deterministic screen compares the WORDS of a draft with the words of its source. That is a sound
// signal when both are in the same language and meaningless across languages: a faithful Portuguese paraphrase of an English
// textbook shares almost no word with it, and flagging "term not in the source" for every translated word buries the real
// findings (the real Costanzo draft got 67 such alerts). So the screen first asks whether the two texts are in the same
// language; when they are demonstrably not, word-overlap checks are replaced by the checks that do not depend on language
// (numbers, units, citations, duplicates, leaks) plus the semantic audit and the reviewer.
//
// Detection is by function words (articles, prepositions, conjunctions): they are the most frequent words of any text and
// do not overlap much between languages. Deliberately conservative: a short or ambiguous text is "unknown", and unknown is
// treated as "same language" so the existing checks keep running.

const WORDS = {
  pt: 'de da do das dos que em para com uma um os as não por mais como ao na no nas nos é são se seu sua pelo pela entre foi ser há também quando mas ou sobre ainda'.split(' '),
  en: 'the of and to in is that for with as are by this from at which be on or an was were it its not can has have their these those than when into also may'.split(' '),
  es: 'el la los las de que en y un una por con para es se del al lo como más pero sus este esta entre también cuando sobre ya fue son'.split(' '),
};
const SETS = Object.fromEntries(Object.entries(WORDS).map(([k, v]) => [k, new Set(v)]));
const MIN_TOKENS = 40;
const MIN_SHARE = 0.12;
const DOMINANCE = 1.4;

const wordsOf = (text) => String(text).toLowerCase().match(/\p{L}+/gu) ?? [];

/** @returns {{language: 'pt'|'en'|'es'|'unknown', confidence: number}} */
export function detectLanguage(text) {
  const words = wordsOf(text);
  if (words.length < MIN_TOKENS) return { language: 'unknown', confidence: 0 };
  const scores = Object.entries(SETS).map(([language, set]) => [language, words.filter((w) => set.has(w)).length / words.length]).sort((a, b) => b[1] - a[1]);
  const [top, second] = scores;
  if (top[1] < MIN_SHARE || top[1] < second[1] * DOMINANCE) return { language: 'unknown', confidence: top[1] };
  return { language: top[0], confidence: top[1] };
}

/** True only when BOTH texts have a confidently detected language and the languages differ. */
export function differentLanguages(a, b) {
  const la = detectLanguage(a);
  const lb = detectLanguage(b);
  return la.language !== 'unknown' && lb.language !== 'unknown' && la.language !== lb.language;
}
