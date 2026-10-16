// Concept coverage of a Resumo Mestre against a unit's local source map (keywords only, no book text).
//   node scripts/prompt-lab/coverage.mjs <source-map.json> <run-N.json | file with .summary>   (reads .draft.summary or .summary)
import { readFileSync } from 'node:fs';
import { normalizeForMatch } from '../../server/src/ai/claim-evidence.js';

export const TIERS = ['ESSENTIAL', 'RELEVANT', 'PERIPHERAL'];

const hasGroup = (text, groups) => groups.some((group) => group.every((word) => text.includes(normalizeForMatch(word))));
const mentions = (text, concept) => hasGroup(text, concept.anyOf);
// A question names a concept with ONE distinctive term, while a summary must hold several; so questions match on the optional
// `questionAnyOf` (falling back to `anyOf`). Reusing the summary groups made C06 look unasked when "AINEs" replaced "NSAID" (measured).
const asked = (text, concept) => hasGroup(text, concept.questionAnyOf ?? concept.anyOf);

export function coverageOf(summary, map) {
  const text = normalizeForMatch(summary);
  const rows = map.concepts.map((c) => ({ id: c.id, label: c.label, tier: c.tier ?? null, covered: mentions(text, c) }));
  return { covered: rows.filter((r) => r.covered).length, total: rows.length, missing: rows.filter((r) => !r.covered), rows, ...essentialsOf(rows) };
}

/** Methodology v2 (reactivation): the summary is owed every ESSENTIAL concept; RELEVANT is reported; PERIPHERAL never counts against it. */
function essentialsOf(rows) {
  const essentials = rows.filter((r) => r.tier === 'ESSENTIAL');
  return {
    essentialCovered: essentials.filter((r) => r.covered).length,
    essentialTotal: essentials.length,
    essentialMissing: essentials.filter((r) => !r.covered),
    byTier: Object.fromEntries(TIERS.map((t) => {
      const of = rows.filter((r) => r.tier === t);
      return [t, { covered: of.filter((r) => r.covered).length, total: of.length }];
    })),
  };
}

/** A map is only usable by methodology v2 when every concept carries a known tier and at least one concept is ESSENTIAL. */
export function validateTiers(map) {
  const problems = [];
  const ids = new Set();
  for (const c of map.concepts) {
    if (ids.has(c.id)) problems.push(`${c.id}: duplicated id`);
    ids.add(c.id);
    if (!TIERS.includes(c.tier)) problems.push(`${c.id}: tier must be one of ${TIERS.join('|')} (got ${JSON.stringify(c.tier)})`);
  }
  if (!map.concepts.some((c) => c.tier === 'ESSENTIAL')) problems.push('no ESSENTIAL concept: the reactivation criterion would be vacuous');
  return problems;
}

/**
 * Formulations per concept: how many DISTINCT question types touch the concept (question + answer text; the explanation is ignored on
 * purpose, it names neighbouring ideas). A repeated type is a rephrasing, not a new formulation; this is a proxy for "different
 * ways to retrieve the same knowledge", and it cannot tell two semantically identical questions of different types apart.
 * ESSENTIAL concepts owe at least `minFormulations` (default 2) so that forgetting can be separated from poor understanding.
 */
export function formulationsOf(questions, map, minFormulations = 2) {
  const texts = (questions ?? []).map((q) => ({ text: normalizeForMatch(`${q.question ?? ''} ${q.answer ?? ''}`), type: q.questionType ?? 'UNKNOWN' }));
  const rows = map.concepts.map((c) => {
    const touching = texts.filter((t) => asked(t.text, c));
    return { id: c.id, label: c.label, tier: c.tier ?? null, questions: touching.length, types: [...new Set(touching.map((t) => t.type))].sort() };
  });
  const essentials = rows.filter((r) => r.tier === 'ESSENTIAL');
  const short = essentials.filter((r) => r.types.length < minFormulations);
  return { minFormulations, rows, essentialTotal: essentials.length, essentialWithEnough: essentials.length - short.length, essentialShort: short };
}

/**
 * The pedagogically relevant denominator: the source text without extraction residue. Removed: the site watermark, and lines that carry no
 * sentence (short, no sentence ending: equation fragments, figure labels, table cells). Everything else counts as meaningful.
 */
export function meaningfulChars(sourceText) {
  const withoutWatermark = String(sourceText).replace(/www\.medicalstudyzone\.com/gi, '');
  return withoutWatermark
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length >= 40 || /[.!?]$/.test(line))
    .filter((line) => !/^===/.test(line))
    .reduce((n, line) => n + line.length + 1, 0);
}

const isMain = process.argv[1] && import.meta.url.toLowerCase().endsWith('coverage.mjs') && process.argv[1].toLowerCase().endsWith('coverage.mjs');
if (isMain) {
  const map = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  const data = JSON.parse(readFileSync(process.argv[3], 'utf8'));
  const summary = data.draft?.summary ?? data.summary;
  const r = coverageOf(summary, map);
  console.log(`COVERAGE ${r.covered}/${r.total}; summary ${summary.length} chars`);
  const tierProblems = validateTiers(map);
  if (tierProblems.length === 0) {
    console.log(`ESSENTIAL_COVERAGE ${r.essentialCovered}/${r.essentialTotal}; ${TIERS.map((t) => `${t} ${r.byTier[t].covered}/${r.byTier[t].total}`).join('; ')}`);
    for (const m of r.essentialMissing) console.log(`  essential missing ${m.id} ${m.label}`);
    const questions = data.draft?.questions ?? data.questions;
    if (Array.isArray(questions)) {
      const f = formulationsOf(questions, map);
      console.log(`ESSENTIAL_FORMULATIONS ${f.essentialWithEnough}/${f.essentialTotal} with >=${f.minFormulations} distinct question types (${questions.length} questions)`);
      for (const s of f.essentialShort) console.log(`  short ${s.id} ${s.label}: ${s.questions} question(s), types ${s.types.join(',') || '-'}`);
    }
  } else {
    console.log(`TIERS_INVALID (${tierProblems.length}): the map predates methodology v2; ESSENTIAL metrics skipped`);
  }
  if (process.argv[4]) {
    const source = readFileSync(process.argv[4], 'utf8');
    const meaningful = meaningfulChars(source);
    console.log(`SOURCE_RAW_CHARS=${source.length} SOURCE_MEANINGFUL_CHARS=${meaningful} SUMMARY_CHARS=${summary.length} RAW_RATIO=${(summary.length / source.length).toFixed(2)} MEANINGFUL_RATIO=${(summary.length / meaningful).toFixed(2)}`);
  }
  for (const m of r.missing) console.log(`  missing ${m.id} ${m.label}`);
}
