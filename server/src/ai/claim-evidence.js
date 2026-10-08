// CONTENT TRUST: which sentence of the summary is backed by which passage of the source.
//
// The model may PROPOSE evidence: summaryEvidence = [{ claim, pageIndex, quote }], where `claim` is words taken verbatim from the
// summary and `quote` is words taken verbatim from one page of the approved source. The SERVER decides whether that holds, with no
// model involved:
//   1. the page is one of the pages of the approved scope;
//   2. the quote really occurs in that page's approved text (after a controlled normalization: case, accents, whitespace, hyphen
//      line breaks, ligatures, typographic dashes and quotes);
//   3. the claim really occurs in the summary as it is NOW (an edit that rewrites the sentence leaves the entry orphaned);
//   4. quote and claim visibly talk about the same thing (every number of the claim is in the quote; some shared medical roots).
// Nothing here is stored as a verdict: the stored data is only what the model proposed, and the verdict is recomputed whenever the
// draft is read, so a changed source, an edited summary or a re-extraction can never leave support that merely looks valid.
// The result is honest about its reach: SOURCE_LINKED means "a real passage of the approved source, related to this sentence, is
// pointed at" — whether it really entails the sentence is what the reviewer reads side by side.

export const MAX_EVIDENCE_ENTRIES = 60;
const MIN_QUOTE_CHARS = 20;
const MAX_QUOTE_CHARS = 600;
const MIN_CLAIM_CHARS = 12;
const MAX_CLAIM_CHARS = 1200;
const MIN_SENTENCE_CHARS = 25;

/** The one normalization every comparison goes through. */
export function normalizeForMatch(text) {
  return String(text)
    .normalize('NFKC') // ligatures (ﬁ -> fi), compatibility forms
    .replace(/[­​‌‍﻿]/g, '') // soft hyphen, zero-width characters
    .replace(/(\p{L})[-‐‑]\s*\n\s*(\p{L})/gu, '$1$2') // a word broken across lines with a hyphen
    .replace(/[‐‑‒–—−]/g, '-')
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const pageTextOf = (segments, pageIndex) => segments.filter((s) => s.pageIndex === pageIndex).map((s) => s.text).join('\n');

// anchors that survive a translation: numbers and the first five letters of long words (shared medical roots in en/pt/es)
function anchorsOf(text) {
  const norm = normalizeForMatch(text);
  const roots = new Set((norm.match(/[a-z]{6,}/g) ?? []).map((w) => w.slice(0, 5)));
  const numbers = new Set((norm.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(',', '.')));
  return { roots, numbers };
}

function related(claim, quote) {
  const c = anchorsOf(claim);
  const q = anchorsOf(quote);
  for (const n of c.numbers) if (!q.numbers.has(n)) return false; // a value the claim states must be in the passage
  let sharedRoots = 0;
  for (const r of c.roots) if (q.roots.has(r)) sharedRoots += 1;
  return sharedRoots >= 2 || (c.numbers.size > 0 && sharedRoots >= 1);
}

/** Why an entry does not hold, or null when it does. `summary` null skips the claim-in-summary test (used by the schema check, which has it separately). */
function entryProblem(entry, { summary, segments, validPages }) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return 'MALFORMED';
  const { claim, quote, pageIndex } = entry;
  if (typeof claim !== 'string' || typeof quote !== 'string' || !Number.isInteger(pageIndex)) return 'MALFORMED';
  if (claim.trim().length < MIN_CLAIM_CHARS || claim.length > MAX_CLAIM_CHARS || quote.length > MAX_QUOTE_CHARS) return 'MALFORMED';
  const nq = normalizeForMatch(quote);
  if (nq.length < MIN_QUOTE_CHARS) return 'QUOTE_TOO_SHORT';
  if (!validPages.has(pageIndex)) return 'PAGE_OUT_OF_SCOPE';
  if (!normalizeForMatch(pageTextOf(segments, pageIndex)).includes(nq)) return 'QUOTE_NOT_IN_PAGE';
  if (summary !== null && !normalizeForMatch(summary).includes(normalizeForMatch(claim))) return 'CLAIM_NOT_IN_SUMMARY';
  if (!related(claim, quote)) return 'QUOTE_UNRELATED';
  return null;
}

/**
 * At generation: keep only the entries the server can confirm. An invented quote, a page outside the approved scope or a claim that
 * is not in the summary is dropped (and counted). An entry whose quote is real but unrelated to its claim is dropped too: a real
 * page that does not support the sentence is not grounding.
 * @returns {{ kept: object[], rejected: number }}
 */
export function validateSummaryEvidence(raw, { summary, segments }) {
  if (raw === undefined || raw === null) return { kept: [], rejected: 0 };
  if (!Array.isArray(raw)) return { kept: [], rejected: 1 };
  const validPages = new Set(segments.map((s) => s.pageIndex));
  const kept = [];
  let rejected = Math.max(0, raw.length - MAX_EVIDENCE_ENTRIES);
  for (const entry of raw.slice(0, MAX_EVIDENCE_ENTRIES)) {
    if (entryProblem(entry, { summary, segments, validPages }) === null) kept.push({ claim: entry.claim, pageIndex: entry.pageIndex, quote: entry.quote });
    else rejected += 1;
  }
  return { kept, rejected };
}

const sentencesOf = (text) => String(text).split(/\n+|(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length >= MIN_SENTENCE_CHARS);

/**
 * The state of the summary NOW, recomputed from the stored proposals, the current summary text and the current source.
 *   SOURCE_LINKED a verified entry points at a real, related passage of the approved source (existence and relation, NOT entailment)
 *   PARTLY_LINKED a verified entry backs the sentence, but a value the sentence states is in none of its passages
 *   NOT_LINKED    nothing points anywhere (or whatever did no longer holds: the sentence or the source changed)
 * `orphaned` counts stored entries that no longer hold (claim rewritten, source changed) so the screen can say so.
 */
export function groundSummary(summary, evidence, segments) {
  const validPages = new Set(segments.map((s) => s.pageIndex));
  const entries = Array.isArray(evidence) ? evidence : [];
  const live = [];
  let orphaned = 0;
  for (const entry of entries) {
    if (entryProblem(entry, { summary, segments, validPages }) === null) live.push(entry);
    else orphaned += 1;
  }
  const numbersOf = (t) => new Set((normalizeForMatch(t).match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(',', '.')));
  const sentences = sentencesOf(summary).map((text) => {
    const n = normalizeForMatch(text);
    const hits = live.filter((e) => n.includes(normalizeForMatch(e.claim)));
    if (hits.length === 0) return { text, status: 'NOT_LINKED', pageIndex: null, quote: null };
    // A sentence is linked in full only when every value it states is in a passage it points at: a quote that backs the first half of
    // a sentence must not make its numbers look backed too.
    const backed = new Set(hits.flatMap((e) => [...numbersOf(e.quote)]));
    const missing = [...numbersOf(text)].filter((v) => !backed.has(v));
    return { text, status: missing.length === 0 ? 'SOURCE_LINKED' : 'PARTLY_LINKED', pageIndex: hits[0].pageIndex, quote: hits[0].quote, ...(missing.length > 0 ? { valuesWithoutPassage: missing } : {}) };
  });
  const supported = sentences.filter((s) => s.status === 'SOURCE_LINKED').length;
  return { sentences, supported, unsupported: sentences.length - supported, total: sentences.length, orphaned };
}
