// CONTENT TRUST: deterministic checks for the changes that matter most in medicine and that a word-overlap screen cannot see:
// a unit swapped for another of the same kind (mg for g), a negation lost or invented, a hedge ("may", "usually", "only") lost or an
// absolute ("always", "never") invented. No model is involved and none of it pretends to judge meaning:
//   - UNIT_MISMATCH needs no alignment: the draft states a value with a unit that the source never gives that value with, while it
//     gives it with another unit of the SAME dimension. Different dimensions are ignored on purpose (a clearance computed from a
//     concentration and a rate is a legitimate derived value).
//   - NEGATION and QUALIFIER checks only compare sentences that can be paired with confidence (many shared anchors, and each is the
//     other's best match). A pair that cannot be made is simply not judged: silence here means "not checked", never "verified".
// Languages: the cue lists exist for en, pt and es. When either language is unknown only the unit check runs.

import { detectLanguage } from './language-detect.js';

const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const clip = (s, n = 240) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// ---------------------------------------------------------------------------------------------------------------------------
// UNITS
// canonical unit -> { dimension, spellings (already normalized: lower case, no accents, no spaces) }
const UNITS = [
  ['mg', 'mass', ['mg', 'miligrama', 'miligramas', 'milligram', 'milligrams', 'miligramo', 'miligramos']],
  ['g', 'mass', ['g', 'grama', 'gramas', 'gram', 'grams', 'gramo', 'gramos']],
  ['ug', 'mass', ['ug', 'mcg', 'µg', 'μg', 'micrograma', 'microgramas', 'microgram', 'micrograms']],
  ['kg', 'mass', ['kg', 'quilograma', 'quilogramas', 'kilogram', 'kilograms']],
  ['ml', 'volume', ['ml', 'mililitro', 'mililitros', 'milliliter', 'milliliters', 'millilitre', 'millilitres']],
  ['l', 'volume', ['l', 'litro', 'litros', 'liter', 'liters', 'litre', 'litres']],
  ['dl', 'volume', ['dl', 'decilitro', 'decilitros', 'deciliter', 'deciliters']],
  ['mmhg', 'pressure', ['mmhg', 'mmdehg']],
  ['kpa', 'pressure', ['kpa', 'quilopascal', 'kilopascal']],
  ['nm', 'length', ['nm', 'nanometro', 'nanometros', 'nanometer', 'nanometers']],
  ['um', 'length', ['um', 'µm', 'μm', 'micrometro', 'micrometros', 'micrometer', 'micrometers', 'micron', 'microns']],
  ['mm', 'length', ['mm', 'milimetro', 'milimetros', 'millimeter', 'millimeters']],
  ['cm', 'length', ['cm', 'centimetro', 'centimetros', 'centimeter', 'centimeters']],
  ['s', 'time', ['s', 'seg', 'segundo', 'segundos', 'second', 'seconds']],
  ['min', 'time', ['min', 'minuto', 'minutos', 'minute', 'minutes']],
  ['h', 'time', ['h', 'hr', 'hora', 'horas', 'hour', 'hours']],
  ['day', 'time', ['dia', 'dias', 'day', 'days']],
  ['mol', 'amount', ['mol', 'mols']],
  ['mmol', 'amount', ['mmol', 'milimol', 'milimols']],
  ['meq', 'amount', ['meq']],
  ['pct', 'fraction', ['%', 'porcento', 'percent']],
];
const UNIT_OF = new Map();
for (const [canonical, dimension, spellings] of UNITS) for (const sp of spellings) UNIT_OF.set(norm(sp), { canonical, dimension });

// number, optional range end, then a unit word. Rates ("mL/min") are read as ONE unit when the part after the slash is a unit too.
const NUM = String.raw`[-–−+]?\d+(?:[.,]\d+)?`;
const QUANTITY = new RegExp(String.raw`(${NUM})(?:\s?[–-]\s?(${NUM}))?\s?(%|mm\s?Hg|[\p{L}µμ]{1,16})(?:\s?\/\s?([\p{L}]{1,12}))?`, 'gu');

function keyOfNumber(raw) {
  return String(raw).replace(/[−–]/g, '-').replace(/^\+/, '').replace(',', '.').replace(/^-/, '');
}

/** Quantities in a text: [{ value, unit: 'mg' | 'mg/ml' ..., dimension, index }] — only units this file knows. */
export function quantitiesIn(text) {
  const out = [];
  for (const m of String(text).matchAll(QUANTITY)) {
    const first = UNIT_OF.get(norm(m[3]).replace(/\s/g, ''));
    if (!first) continue;
    let unit = first.canonical;
    let dimension = first.dimension;
    if (m[4]) {
      const per = UNIT_OF.get(norm(m[4]));
      if (!per) continue;
      unit = `${first.canonical}/${per.canonical}`;
      dimension = `${first.dimension}/${per.dimension}`;
    }
    for (const raw of [m[1], m[2]]) {
      if (raw === undefined) continue;
      out.push({ value: keyOfNumber(raw), unit, dimension, index: m.index });
    }
  }
  return out;
}

function sentenceAt(text, index) {
  let start = 0;
  for (const m of text.matchAll(/(?<=[.!?])\s+/g)) {
    if (m.index >= index) return text.slice(start, m.index).trim();
    start = m.index + m[0].length;
  }
  return text.slice(start).trim();
}

function sourceQuantityIndex(segments) {
  const byValue = new Map(); // value -> Map(unit -> { dimension, sentence, pageIndex })
  for (const seg of segments) {
    for (const q of quantitiesIn(seg.text)) {
      if (!byValue.has(q.value)) byValue.set(q.value, new Map());
      const units = byValue.get(q.value);
      if (!units.has(q.unit)) units.set(q.unit, { dimension: q.dimension, sentence: sentenceAt(seg.text, q.index), pageIndex: seg.pageIndex });
    }
  }
  return byValue;
}

function auditUnits(units, text, scope) {
  const findings = [];
  const seen = new Set();
  for (const q of quantitiesIn(text)) {
    const given = units.get(q.value);
    if (!given || given.has(q.unit)) continue;
    const sameDimension = [...given].filter(([, info]) => info.dimension === q.dimension);
    if (sameDimension.length === 0) continue; // another kind of quantity: possibly derived, not judged
    const key = `${scope}|${q.value}|${q.unit}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const [sourceUnit, info] = sameDimension[0];
    findings.push({
      issue: 'UNIT_MISMATCH',
      severity: 'HIGH',
      scope,
      generatedClaim: clip(sentenceAt(text, q.index)),
      sourceEvidence: `p. ${info.pageIndex}: ${clip(info.sentence)}`,
      repair: `A fonte traz ${q.value} em ${sourceUnit}, não em ${q.unit}. Use a unidade da fonte.`,
    });
  }
  return findings;
}

// ---------------------------------------------------------------------------------------------------------------------------
// NEGATION AND QUALIFIERS (per language). Cues are matched as whole words on accent-free lower case text.
const CUES = {
  negation: {
    en: ['not', 'no', 'never', 'neither', 'nor', 'without', 'cannot', 'none', 'nothing', 'unable', 'absent', 'absence', 'lack', 'lacks', 'prevents', 'prevent', 'impermeable', 'fails'],
    pt: ['nao', 'nunca', 'nem', 'sem', 'nenhum', 'nenhuma', 'nada', 'incapaz', 'ausente', 'ausencia', 'falta', 'impede', 'impedem', 'impedindo', 'impermeavel', 'falha', 'jamais', 'evita', 'bloqueia'],
    es: ['no', 'nunca', 'ni', 'sin', 'ningun', 'ninguno', 'ninguna', 'nada', 'incapaz', 'ausente', 'ausencia', 'falta', 'impide', 'impiden', 'impermeable', 'jamas', 'evita', 'bloquea'],
  },
  qualifiers: {
    ONLY: { en: ['only', 'solely', 'exclusively', 'alone'], pt: ['apenas', 'somente', 'so', 'exclusivamente', 'unicamente'], es: ['solo', 'solamente', 'unicamente', 'exclusivamente'] },
    ALWAYS: { en: ['always', 'invariably'], pt: ['sempre', 'invariavelmente'], es: ['siempre', 'invariablemente'] },
    NEVER: { en: ['never'], pt: ['nunca', 'jamais'], es: ['nunca', 'jamas'] },
    HEDGE_FREQUENCY: { en: ['usually', 'generally', 'typically', 'commonly', 'often', 'mostly', 'frequently', 'sometimes', 'rarely', 'seldom'], pt: ['geralmente', 'habitualmente', 'tipicamente', 'comumente', 'frequentemente', 'usualmente', 'normalmente', 'as vezes', 'raramente', 'raro'], es: ['generalmente', 'habitualmente', 'tipicamente', 'comunmente', 'frecuentemente', 'normalmente', 'a veces', 'raramente'] },
    HEDGE_POSSIBILITY: { en: ['may', 'might', 'can', 'could', 'possibly', 'perhaps'], pt: ['pode', 'podem', 'poderia', 'possivelmente', 'podendo', 'talvez', 'possivel'], es: ['puede', 'pueden', 'podria', 'posiblemente', 'quizas', 'posible'] },
  },
};
// strengthening a claim is what a reader cannot spot: these are the cues a draft must not add
const ABSOLUTES = new Set(['ONLY', 'ALWAYS', 'NEVER']);

function cueSets(lang) {
  return {
    negation: new Set(CUES.negation[lang]),
    qualifiers: Object.fromEntries(Object.entries(CUES.qualifiers).map(([name, byLang]) => [name, byLang[lang]])),
  };
}
const wordsOf = (s) => norm(s).match(/[a-z]+/g) ?? [];
const hasCue = (padded, cue) => padded.includes(` ${cue} `);

function cuesIn(sentence, sets) {
  const padded = ` ${wordsOf(sentence).join(' ')} `;
  const negation = [...sets.negation].filter((w) => hasCue(padded, w));
  const qualifiers = Object.entries(sets.qualifiers).filter(([, list]) => list.some((w) => hasCue(padded, w))).map(([name]) => name);
  return { negation, qualifiers };
}

// alignment ---------------------------------------------------------------------------------------------------------------
// Anchors are what survives a translation: numbers and the first five letters of long words (Latin/Greek medical roots are shared
// by en, pt and es). Pairing is deliberately strict.
const MIN_ANCHORS = 4;
const anchorsOf = (sentence) => {
  const out = new Set();
  for (const w of norm(sentence).match(/[a-z]{6,}/g) ?? []) out.add(`w:${w.slice(0, 5)}`);
  for (const n of String(sentence).match(/\d+(?:[.,]\d+)?/g) ?? []) out.add(`n:${n.replace(',', '.')}`);
  return out;
};
const sentencesOf = (text) => String(text).replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length >= 25);
const overlap = (a, b) => { let n = 0; for (const x of a) if (b.has(x)) n += 1; return n; };

function pairSentences(sourceItems, draftItems) {
  const bestOf = (item, pool) => {
    let best = null; let score = 0; let second = 0;
    for (const other of pool) {
      const s = overlap(item.anchors, other.anchors);
      if (s > score) { second = score; score = s; best = other; } else if (s > second) second = s;
    }
    return { best, score, second };
  };
  const pairs = [];
  for (const d of draftItems) {
    const { best: s, score, second } = bestOf(d, sourceItems);
    if (!s || score < MIN_ANCHORS || score === second) continue;
    const back = bestOf(s, draftItems);
    if (back.best !== d || back.score === back.second) continue; // each must be the other's unique best
    pairs.push({ draft: d, source: s });
  }
  return pairs;
}

// A draft sentence often folds two neighbouring source sentences into one ("... stays constant; only below 80 ..."), so a cue that
// the OTHER side carries in the neighbouring sentence is not a change. The window is the paired sentence plus its direct neighbours.
function windowCues(items, at, sets, own) {
  const out = { negation: new Set(own.negation), qualifiers: new Set(own.qualifiers) };
  for (const k of [at - 1, at + 1]) {
    const near = items[k];
    if (!near || near.group !== items[at].group) continue;
    const c = cuesIn(near.text, sets);
    c.negation.forEach((x) => out.negation.add(x));
    c.qualifiers.forEach((x) => out.qualifiers.add(x));
  }
  return out;
}

function auditPairs(pairs, sets, scopeOf, { sourceItems, draftItems }) {
  const findings = [];
  for (const { draft, source } of pairs) {
    const d = cuesIn(draft.text, sets.draft);
    const s = cuesIn(source.text, sets.source);
    const sourceWindow = windowCues(sourceItems, sourceItems.indexOf(source), sets.source, s);
    const draftWindow = windowCues(draftItems, draftItems.indexOf(draft), sets.draft, d);
    const scope = scopeOf(draft);
    const evidence = `p. ${source.pageIndex}: ${clip(source.text)}`;
    for (const q of s.qualifiers) {
      if (!draftWindow.qualifiers.has(q) && !(q.startsWith('HEDGE') && [...draftWindow.qualifiers].some((x) => x.startsWith('HEDGE')))) {
        findings.push({ issue: 'QUALIFIER_LOST', severity: 'MEDIUM', scope, generatedClaim: clip(draft.text), sourceEvidence: evidence,
          repair: 'A fonte restringe esta afirmação (por exemplo "apenas", "geralmente", "pode") e a frase do rascunho não traz a restrição. Sem ela a afirmação fica mais forte do que a fonte.' });
        break;
      }
    }
    for (const q of d.qualifiers) {
      if (ABSOLUTES.has(q) && !sourceWindow.qualifiers.has(q) && !(q === 'NEVER' && sourceWindow.negation.size > 0)) {
        findings.push({ issue: 'QUALIFIER_ADDED', severity: 'MEDIUM', scope, generatedClaim: clip(draft.text), sourceEvidence: evidence,
          repair: 'A frase do rascunho usa um termo absoluto ("sempre", "nunca", "apenas", "todos") que o trecho correspondente da fonte não usa. Confira se a afirmação não foi exagerada.' });
        break;
      }
    }
  }
  return findings;
}

/**
 * @param draft     { summary, questions: [{question, answer, explanation, hint}] }
 * @param segments  [{ pageIndex, text }] — the approved source scope
 * @returns findings in the shape draft-audit.js produces
 */
export function auditRisk(draft, { segments }) {
  const findings = [];
  const units = sourceQuantityIndex(segments);
  findings.push(...auditUnits(units, draft.summary ?? '', 'summary'));
  (draft.questions ?? []).forEach((q, i) => {
    findings.push(...auditUnits(units, [q.question, q.answer, q.explanation ?? ''].join('. '), `question:${i}`));
  });

  const sourceText = segments.map((s) => s.text).join(' ');
  const draftText = [draft.summary, ...(draft.questions ?? []).map((q) => `${q.question} ${q.answer} ${q.explanation ?? ''}`)].join(' ');
  const sourceLang = detectLanguage(sourceText).language;
  const draftLang = detectLanguage(draftText).language;
  if (!CUES.negation[sourceLang] || !CUES.negation[draftLang]) return findings;

  const sourceItems = segments.flatMap((seg) => sentencesOf(seg.text).map((text) => ({ text, pageIndex: seg.pageIndex, group: seg.pageIndex, anchors: anchorsOf(text) })));
  const draftItems = [
    ...sentencesOf(draft.summary ?? '').map((text) => ({ text, where: 'summary', group: 'summary', anchors: anchorsOf(text) })),
    ...(draft.questions ?? []).flatMap((q, i) => sentencesOf([q.answer, q.explanation ?? ''].join('. ')).map((text) => ({ text, where: `question:${i}`, group: `question:${i}`, anchors: anchorsOf(text) }))),
  ];
  const pairs = pairSentences(sourceItems, draftItems);
  findings.push(...auditPairs(pairs, { source: cueSets(sourceLang), draft: cueSets(draftLang) }, (d) => d.where, { sourceItems, draftItems }));
  return findings;
}
