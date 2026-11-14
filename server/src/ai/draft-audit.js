// CONTENT-QUALITY: a deterministic SCREEN over a generated draft, run after the structural
// validation (draft-schema.js) and before a human reviews it. It is deliberately honest about
// what it is: a high-recall flagger of things a reviewer should look at, not a medical verifier.
// `PASS` means "no flag raised". Semantic judgement (a contradiction, a subtly wrong mechanism)
// is the model auditor's job (live provider only, see draft-audit-model.js) and, in the end,
// the human's — a draft always stays DRAFT until a person accepts it.
//
// Finding shape (one per issue, no decorative score):
//   { issue, severity: 'HIGH'|'MEDIUM'|'LOW', scope: 'summary'|'question:<index>',
//     generatedClaim, sourceEvidence, repair }
// Result: REPAIR when any HIGH or MEDIUM finding that triggersRepair() exists, else PASS (LOW and lexical-only signals = advisory only).

import { differentLanguages } from './language-detect.js';
import { auditRisk } from './risk-checks.js';
import { msg, resolveMessages } from './audit-messages.js';
import { stripSummaryMarkup } from '../../../shared/summary-figure-refs.js';

export const AUDIT_RESULT = { PASS: 'PASS', REPAIR: 'REPAIR' };

// A word-level difference (a term or a concept the source does not repeat) is a SIGNAL for the reviewer, never proof of an error: a faithful
// paraphrase, synonym or translation trips it. Such findings stay in the list but never make the result REPAIR nor trigger the model repair.
const LEXICAL_ONLY = { blocksRepair: false };
export const triggersRepair = (f) => (f.severity === 'HIGH' || f.severity === 'MEDIUM') && f.blocksRepair !== false;

// T-F2-03: identity of the deterministic rule set. Opening a draft only COMPARES the stored audit's version with this one (never
// recalculates); "Reauditar" is the explicit action that recomputes. BUMP this whenever a rule (this file or language-detect.js)
// changes (draft-audit.js, language-detect.js, risk-checks.js, draft-audit-model.js):draft-audit-rules-version.test.js pins a hash of the files to a version and fails when the rules change without a new one.
export const AUDIT_RULES_VERSION = 'audit-rules-16';

const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const tokens = (s) => (String(s).match(/\p{L}+/gu) ?? []).map((w) => ({ raw: w.toLowerCase(), key: norm(w) }));
const stem = (key) => (key.length >= 6 ? key.slice(0, 5) : key);

// Gerunds and -mente adverbs ("sustentando", "diretamente") are how a paraphrase is written, not a
// specific term; flagging them as "not in the source" only teaches the reviewer to ignore the screen.
const isPhrasing = (key) => /(?:ando|endo|indo|ondo|mente)$/.test(key);

// Generic connective/academic words a faithful paraphrase may add without adding any fact.
const GENERIC = new Set([
  'importante', 'importantes', 'principal', 'principais', 'fundamental', 'fundamentais', 'geralmente', 'normalmente',
  'resultado', 'resultados', 'processo', 'processos', 'mecanismo', 'mecanismos', 'consequentemente', 'portanto',
  'entretanto', 'conforme', 'segundo', 'especialmente', 'diretamente', 'indiretamente', 'aproximadamente',
  'relacionado', 'relacionada', 'responsavel', 'responsaveis', 'necessario', 'necessaria', 'presente', 'presentes',
  'contudo', 'enquanto', 'durante', 'quando', 'atraves', 'resumindo', 'considerando', 'apresenta', 'representa',
  'depende', 'dependem', 'determina', 'determinam', 'consiste', 'permite', 'permitindo', 'exemplo', 'situacao',
  'caracteriza', 'caracterizada', 'caracterizado', 'refere', 'utilizado', 'utilizada', 'observado', 'observada',
]);

// An exponent is one number however it is written: extraction gives "10¹¹", a summary may say "10^11". Both read as base 10
// and the exponent "e11", so neither an equal exponent is flagged nor a different one ("10^13") let through.
const SUPERSCRIPT_TO_ASCII = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁺': '', '⁻': '-' };
const SUPERSCRIPT_DIGITS = new Set('⁰¹²³⁴⁵⁶⁷⁸⁹');
const SUPERSCRIPT_SIGNS = new Set(['⁺', '⁻']);
const isDigit = (ch) => ch >= '0' && ch <= '9';

function exponentLength(text, start) {
  if (text[start] !== '^') return 0;
  let at = start + 1;
  if (/\s/.test(text[at] ?? '')) at += 1;
  if (text[at] === '-' || text[at] === '−') at += 1;
  const firstDigit = at;
  while (isDigit(text[at] ?? '')) at += 1;
  return at > firstDigit ? at - start : 0;
}

function superscriptLength(text, start) {
  let at = start;
  if (SUPERSCRIPT_SIGNS.has(text[at])) at += 1;
  const firstDigit = at;
  while (SUPERSCRIPT_DIGITS.has(text[at])) at += 1;
  return at > firstDigit ? at - start : 0;
}

function decimalLength(text, start) {
  let at = start;
  while (isDigit(text[at] ?? '')) at += 1;
  if (at === start) return 0;
  if (text[at] === '.' || text[at] === ',') {
    let end = at + 1;
    while (isDigit(text[end] ?? '')) end += 1;
    if (end > at + 1) at = end;
  }
  return at - start;
}

function numbersIn(text) {
  const out = [];
  const source = String(text);
  for (let index = 0; index < source.length;) {
    const length = exponentLength(source, index) || superscriptLength(source, index) || decimalLength(source, index);
    if (length === 0) { index += 1; continue; }
    const raw = source.slice(index, index + length);
    const isExponent = raw.startsWith('^') || /^[⁺⁻⁰¹²³⁴⁵⁶⁷⁸⁹]/.test(raw);
    const key = isExponent
      ? `e${[...raw].map((ch) => SUPERSCRIPT_TO_ASCII[ch] ?? ch).join('').replace(/[\^\s]/g, '').replace('−', '-')}`
      : raw.replace(',', '.');
    out.push({ raw, key, index });
    index += length;
  }
  return out;
}

const sentencesOf = (text) => String(text).split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);

// A typeset equation can come out of the PDF with its decimal points detached ("10 3 45 / 6 55 / . / .": the values 3.45 and 6.55).
// On text that shows such detached points (a line holding nothing but ".") two digit groups written next to each other are ALSO read
// as a decimal number, so a value the source really states is not reported as invented. Elsewhere nothing changes.
function sourceNumberKeys(text) {
  const keys = new Set(numbersIn(text).map((n) => n.key));
  if (/(^|\n)[ \t]*\.[ \t]*(\n|$)/.test(String(text))) {
    // every neighbouring pair (lookahead, so "10 3 45" gives 10.3 and 3.45)
    for (const m of String(text).matchAll(/(?<![\d.,])(\d{1,3})(?=[ \t\n]+(\d{1,3})(?![\d.,]))/g)) keys.add(`${m[1]}.${m[2]}`);
  }
  return keys;
}

function sourceStemSet(segments) {
  const set = new Set();
  for (const seg of segments) for (const t of tokens(seg.text)) set.add(stem(t.key));
  return set;
}

function overlapScore(a, b) {
  const sa = new Set(tokens(a).map((t) => stem(t.key)).filter((k) => k.length >= 4));
  let n = 0;
  for (const t of tokens(b)) if (sa.has(stem(t.key)) && stem(t.key).length >= 4) n += 1;
  return n;
}

/** The source sentence that talks about the same thing as `claim` — what a reviewer should compare against. */
function closestSourceSentence(claim, segments) {
  let best = null;
  let bestScore = 0;
  for (const seg of segments) {
    for (const sentence of sentencesOf(seg.text)) {
      const score = overlapScore(claim, sentence);
      if (score > bestScore) { best = { sentence, pageIndex: seg.pageIndex }; bestScore = score; }
    }
  }
  return best ? msg('EVIDENCE_SOURCE_PASSAGE', { page: best.pageIndex, text: best.sentence.slice(0, 240) }) : msg('EVIDENCE_NO_SOURCE_PASSAGE');
}

const clip = (s, n = 200) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** The sentence of `text` that holds character `index` — the unit a reviewer actually reads. */
function sentenceContaining(text, index) {
  let start = 0;
  for (const m of text.matchAll(/(?<=[.!?])\s+/g)) {
    if (m.index >= index) return text.slice(start, m.index).trim();
    start = m.index + m[0].length;
  }
  return text.slice(start).trim();
}

// 1) Values (doses, pressures, rates...) that the source never states are the classic invented fact.
function unsupportedSummaryValueFindings(summary, segments, sourceNumbers) {
  const findings = [];
  const badNumbers = numbersIn(summary).filter((n) => !sourceNumbers.has(n.key) && (n.key.includes('.') || n.key.length >= 2));
  for (const n of badNumbers) {
    const claim = clip(sentenceContaining(summary, n.index), 240);
    findings.push({
      issue: 'SUMMARY_UNSUPPORTED_VALUE',
      severity: 'HIGH',
      scope: 'summary',
      generatedClaim: claim,
      // compare on what the value is ABOUT (the words right before it), not on the whole sentence
      sourceEvidence: closestSourceSentence(summary.slice(Math.max(0, n.index - 60), n.index), segments),
      repair: msg('REPAIR_SUMMARY_UNSUPPORTED_VALUE', { value: n.raw }),
    });
  }
  return findings;
}

// 2) Specific terms with no counterpart in the source; word comparison only applies within one language.
function unsupportedSummaryTermFinding(summary, segments, lexical) {
  const srcStems = sourceStemSet(segments);
  const seen = new Set();
  const unsupportedTerms = [];
  for (const t of lexical ? tokens(summary) : []) {
    if (t.key.length < 8 || GENERIC.has(t.key) || isPhrasing(t.key)) continue;
    const s = stem(t.key);
    if (srcStems.has(s) || seen.has(s)) continue;
    seen.add(s);
    unsupportedTerms.push(t.raw);
  }
  if (unsupportedTerms.length === 0) return null;
  return {
      issue: 'SUMMARY_UNSUPPORTED_TERM',
      ...LEXICAL_ONLY,
      severity: 'MEDIUM',
      scope: 'summary',
      generatedClaim: unsupportedTerms.slice(0, 5).join(', '),
      sourceEvidence: msg('EVIDENCE_SUMMARY_TERMS_ABSENT'),
      repair: msg('REPAIR_SUMMARY_UNSUPPORTED_TERM'),
  };
}

// 3) Central concepts of the source that the summary dropped silently.
function centralSummaryConceptFinding(summary, segments, lexical) {
  const counts = new Map();
  const order = [];
  for (const seg of segments) {
    for (const t of tokens(seg.text)) {
      if (t.key.length < 6 || GENERIC.has(t.key)) continue;
      const s = stem(t.key);
      if (!counts.has(s)) { counts.set(s, { n: 0, shown: t.raw }); order.push(s); }
      counts.get(s).n += 1;
    }
  }
  const central = order.filter((s) => counts.get(s).n >= 2)
    .sort((a, b) => counts.get(b).n - counts.get(a).n || order.indexOf(a) - order.indexOf(b))
    .slice(0, 5);
  if (!lexical || central.length < 3) return null;
  const summaryStems = new Set(tokens(summary).map((t) => stem(t.key)));
  const missing = central.filter((s) => !summaryStems.has(s));
  if ((central.length - missing.length) / central.length >= 0.5) return null;
  return {
        issue: 'SUMMARY_OMITS_CENTRAL_CONCEPT',
        ...LEXICAL_ONLY,
        severity: 'MEDIUM',
        scope: 'summary',
        generatedClaim: clip(summary, 160),
        sourceEvidence: msg('EVIDENCE_CENTRAL_TERMS_MISSING', { terms: missing.map((s) => counts.get(s).shown).join(', ') }),
        repair: msg('REPAIR_SUMMARY_OMITS_CENTRAL_CONCEPT'),
  };
}

// 4) A token summary over a substantial source.
function thinSummaryFinding(summary, sourceText) {
  const summaryWords = tokens(summary).length;
  const sourceWords = tokens(sourceText).length;
  if (summaryWords >= 12 || sourceWords < 40) return null;
  return {
      issue: 'SUMMARY_TOO_THIN',
      severity: 'HIGH',
      scope: 'summary',
      generatedClaim: clip(summary, 160),
      sourceEvidence: msg('EVIDENCE_SUMMARY_TOO_THIN', { sourceWords, summaryWords }),
      repair: msg('REPAIR_SUMMARY_TOO_THIN'),
  };
}

function auditSummary(summary, segments, { lexical = true } = {}) {
  const sourceText = segments.map((s) => s.text).join(' ');
  const sourceNumbers = sourceNumberKeys(segments.map((seg) => seg.text).join('\n'));
  const findings = unsupportedSummaryValueFindings(summary, segments, sourceNumbers);
  const unsupportedTerms = unsupportedSummaryTermFinding(summary, segments, lexical);
  if (unsupportedTerms) findings.push(unsupportedTerms);
  const centralConcept = centralSummaryConceptFinding(summary, segments, lexical);
  if (centralConcept) findings.push(centralConcept);
  const tooThin = thinSummaryFinding(summary, sourceText);
  if (tooThin) findings.push(tooThin);
  return findings;
}

// The "core" of an answer: what a student would type to get it right — the text before the first
// clause break. Used to detect an answer given away in the question or the hint.
// An answer may open by restating the condition the question itself names ("Quando a perfusão renal cai, a angiotensina II
// ..."); the generation prompt asks for that. That opening gives nothing away, so the claim that follows it is the core.
const LEADING_CONDITION = /^(quando|se|em|na|no|nos|nas|durante|caso|ao)\s/;
function answerCore(answer) {
  const clean = (s) => (s ?? '').replace(/\s+/g, ' ').trim();
  const clauses = norm(answer).split(/[,;:.(]| porque /).map(clean);
  const core = LEADING_CONDITION.test(clauses[0]) && clauses.length > 1 && clauses[1] ? clauses[1] : clauses[0];
  return core.length >= 4 || /\d/.test(core) ? core : '';
}
const squash = (s) => norm(s).replace(/\s+/g, ' ');

// Feedback must teach, and the answer must not be given away by the question or hint.
function addQuestionFeedbackFindings(q, answerWords, explanationWords, add) {
  if (answerWords + explanationWords < 4) {
    add('QUESTION_ANSWER_TOO_THIN', 'HIGH', q.answer, msg('EVIDENCE_ANSWER_TOO_THIN'), msg('REPAIR_ANSWER_TOO_THIN'));
  }
  if (explanationWords === 0) {
    add('EXPLANATION_MISSING', 'MEDIUM', q.answer, msg('EVIDENCE_EXPLANATION_MISSING'), msg('REPAIR_EXPLANATION_MISSING'));
  }
  const core = answerCore(q.answer);
  if (core && squash(q.question).includes(core)) {
    add('QUESTION_ANSWER_LEAKED', 'HIGH', q.question, msg('EVIDENCE_ANSWER_IN_QUESTION', { answer: clip(q.answer, 60) }), msg('REPAIR_ANSWER_LEAKED'));
  }
  if (core && q.hint && squash(q.hint).includes(core)) {
    add('HINT_REVEALS_ANSWER', 'HIGH', q.hint, msg('EVIDENCE_ANSWER_IN_HINT', { answer: clip(q.answer, 60) }), msg('REPAIR_HINT_REVEALS_ANSWER'));
  }
}

// Numbers already stated in the question are not a hint leak; single-digit values are too common to count.
function addHintValueFinding(q, add) {
  if (!q.hint) return;
  const questionNumbers = new Set(numbersIn(q.question).map((n) => n.key));
  const hintNumbers = new Set(numbersIn(q.hint).map((n) => n.key));
  const leaked = numbersIn(q.answer).find((n) => (n.key.includes('.') || n.key.length >= 2) && hintNumbers.has(n.key) && !questionNumbers.has(n.key));
  if (leaked) add('HINT_REVEALS_VALUE', 'HIGH', q.hint, msg('EVIDENCE_HINT_HAS_VALUE', { value: leaked.raw }), msg('REPAIR_HINT_REVEALS_VALUE'));
}

// Only an exact restatement is reliable to flag deterministically; semantic "why" quality belongs to model audit.
function addCircularExplanationFinding(q, explanationWords, add) {
  if (explanationWords < 5) return;
  const known = new Set(tokens(`${q.question} ${q.answer}`).map((t) => stem(t.key)));
  const knownNumbers = new Set(numbersIn(`${q.question} ${q.answer}`).map((n) => n.key));
  const contentStems = [...new Set(tokens(q.explanation).filter((t) => t.key.length >= 5 && !GENERIC.has(t.key) && !isPhrasing(t.key)).map((t) => stem(t.key)))];
  const addsTerm = contentStems.some((s) => !known.has(s));
  const addsNumber = numbersIn(q.explanation).some((n) => !knownNumbers.has(n.key));
  if (contentStems.length >= 3 && !addsTerm && !addsNumber) {
    add('EXPLANATION_ADDS_NOTHING', 'MEDIUM', q.explanation, msg('EVIDENCE_EXPLANATION_CIRCULAR'), msg('REPAIR_EXPLANATION_CIRCULAR'));
  }
}

// Facts absent from the cited page are reported before word-level term signals.
function addUnsupportedQuestionValueFindings(teaching, cited, segments, citedText, add) {
  const citedNumbers = sourceNumberKeys(citedText);
  for (const n of numbersIn(teaching)) {
    if (citedNumbers.has(n.key) || !(n.key.includes('.') || n.key.length >= 2)) continue;
    const claim = sentenceContaining(teaching, n.index);
    add('QUESTION_UNSUPPORTED_VALUE', 'HIGH', claim,
      closestSourceSentence(teaching.slice(Math.max(0, n.index - 60), n.index), cited.length > 0 ? cited : segments),
      msg('REPAIR_QUESTION_UNSUPPORTED_VALUE', { value: n.raw }));
  }
}

function addUnsupportedQuestionTermFinding(teaching, citedStems, questionStems, lexical, add) {
  const seen = new Set();
  const unsupported = [];
  for (const t of lexical ? tokens(teaching) : []) {
    if (t.key.length < 8 || GENERIC.has(t.key) || isPhrasing(t.key)) continue;
    const s = stem(t.key);
    if (citedStems.has(s) || questionStems.has(s) || seen.has(s)) continue;
    seen.add(s);
    unsupported.push(t.raw);
  }
  if (unsupported.length > 0) {
    add('QUESTION_UNSUPPORTED_TERM', 'MEDIUM', unsupported.slice(0, 5).join(', '),
      msg('EVIDENCE_QUESTION_TERMS_ABSENT'), msg('REPAIR_QUESTION_UNSUPPORTED_TERM'), LEXICAL_ONLY);
  }
}

// Little lexical footing on the cited page is advisory and only applies within one language.
function addLowSourceSupportFinding(q, cited, citedStems, questionStems, teaching, lexical, add) {
  if (!lexical || cited.length === 0) return;
  const contentStems = [...new Set(tokens(teaching).filter((t) => t.key.length >= 5 && !GENERIC.has(t.key)).map((t) => stem(t.key)))]
    .filter((s) => !questionStems.has(s));
  if (contentStems.length < 4) return;
  const supported = contentStems.filter((s) => citedStems.has(s)).length;
  if (supported / contentStems.length < 0.4) {
    add('QUESTION_LOW_SOURCE_SUPPORT', 'MEDIUM', q.answer,
      msg('EVIDENCE_LOW_SOURCE_SUPPORT', { supported, total: contentStems.length }), msg('REPAIR_LOW_SOURCE_SUPPORT'), LEXICAL_ONLY);
  }
}

// Duplicates and verbatim copies are reported last, preserving their established finding order.
function addDuplicateQuestionFindings(q, citedText, seenQuestions, index, add) {
  const key = squash(q.question);
  if (seenQuestions.has(key)) {
    add('QUESTION_DUPLICATE', 'MEDIUM', q.question, msg('EVIDENCE_DUPLICATE_OF', { number: seenQuestions.get(key) + 1 }), msg('REPAIR_DUPLICATE'));
  } else {
    seenQuestions.set(key, index);
  }
  const answerNorm = squash(q.answer);
  if (answerNorm.length >= 60 && squash(citedText).includes(answerNorm)) {
    add('QUESTION_LITERAL_COPY', 'LOW', q.answer, msg('EVIDENCE_LITERAL_COPY'), msg('REPAIR_LITERAL_COPY'));
  }
}

function auditQuestions(questions, segments, { lexical = true } = {}) {
  const findings = [];
  const seenQuestions = new Map();
  questions.forEach((q, index) => {
    const scope = `question:${index}`;
    const add = (issue, severity, generatedClaim, sourceEvidence, repair, extra = {}) =>
      findings.push({ issue, severity, scope, generatedClaim: clip(generatedClaim, 240), sourceEvidence, repair, ...extra });
    const cited = segments.filter((s) => (q.sourceSpans ?? []).some((span) => span.pageIndex === s.pageIndex));
    const citedText = cited.map((s) => s.text).join(' ');
    const teaching = `${q.answer} ${q.explanation ?? ''}`;
    const answerWords = tokens(q.answer).length;
    const explanationWords = tokens(q.explanation ?? '').length;
    const citedStems = sourceStemSet(cited.length > 0 ? cited : segments);
    const questionStems = new Set(tokens(q.question).map((t) => stem(t.key)));

    addQuestionFeedbackFindings(q, answerWords, explanationWords, add);
    addHintValueFinding(q, add);
    addCircularExplanationFinding(q, explanationWords, add);
    addUnsupportedQuestionValueFindings(teaching, cited, segments, citedText, add);
    addUnsupportedQuestionTermFinding(teaching, citedStems, questionStems, lexical, add);
    addLowSourceSupportFinding(q, cited, citedStems, questionStems, teaching, lexical, add);
    addDuplicateQuestionFindings(q, citedText, seenQuestions, index, add);
  });
  return findings;
}

// T-F2-06 (HG-01, reversible default): how many questions a source supports is a function of its SIZE, judged here and not in the prompt.
// Proportional with a cap: at most one question per ~300 characters (never fewer than 5, never more than 40) and, for large units, at
// least one per ~4000 characters. Out of range is an ADVISORY (LOW): it never blocks acceptance, never triggers a model repair, and
// nothing is cut silently — the reviewer decides.
const QUESTION_VOLUME_POLICY = Object.freeze({ charsPerMaxQuestion: 300, charsPerMinQuestion: 4000, floorMax: 5, capMax: 40 });
function expectedQuestionRange(sourceChars, policy = QUESTION_VOLUME_POLICY) {
  const max = Math.min(policy.capMax, Math.max(policy.floorMax, Math.ceil(sourceChars / policy.charsPerMaxQuestion)));
  const min = Math.max(1, Math.floor(sourceChars / policy.charsPerMinQuestion));
  return { min: Math.min(min, max), max };
}
function auditQuestionVolume(count, sourceChars) {
  const { min, max } = expectedQuestionRange(sourceChars);
  if (count >= min && count <= max) return null;
  return {
    issue: 'QUESTION_VOLUME_OUT_OF_RANGE',
    severity: 'LOW',
    scope: 'draft',
    generatedClaim: msg('CLAIM_VOLUME_COUNT', { count }),
    sourceEvidence: msg('EVIDENCE_VOLUME_EXPECTED', { chars: sourceChars, min, max }),
    repair: msg(count > max ? 'REPAIR_VOLUME_TOO_MANY' : 'REPAIR_VOLUME_TOO_FEW'),
  };
}
// R-3: how much text the audit could actually SEE. A scanned or image-heavy PDF extracts little or nothing, and then "no point raised" means
// very little. The reviewer is told so: an advisory (LOW) that never blocks, never triggers a repair and never says the draft is wrong.
export const SOURCE_SUFFICIENCY = Object.freeze({ minCharsPerPage: 250, emptyPageLetters: 10, garbledReplacementChars: 5 });
const lettersIn = (text) => (String(text).match(/\p{L}/gu) ?? []).length;
function auditSourceSufficiency(segments, policy = SOURCE_SUFFICIENCY) {
  const pages = segments.length;
  if (pages === 0) return null;
  const chars = segments.reduce((n, seg) => n + String(seg.text).trim().length, 0);
  const emptyPages = segments.filter((seg) => lettersIn(seg.text) < policy.emptyPageLetters).map((seg) => seg.pageIndex);
  // the replacement character is what a broken extraction leaves behind. A low share of letters is NOT used: tables and formulas are mostly digits
  const garbledPages = segments.filter((seg) => (String(seg.text).match(/\uFFFD/g) ?? []).length >= policy.garbledReplacementChars).map((seg) => seg.pageIndex);
  const thin = pages >= 2 && chars / pages < policy.minCharsPerPage;
  const reasons = [...(thin ? ["THIN"] : []), ...(emptyPages.length > 0 ? ["EMPTY_PAGES"] : []), ...(garbledPages.length > 0 ? ["GARBLED"] : [])];
  if (reasons.length === 0) return null;
  return {
    issue: "SOURCE_TEXT_INSUFFICIENT",
    severity: "LOW",
    scope: "draft",
    generatedClaim: msg('CLAIM_SOURCE_TEXT_STATS', { chars, pages }),
    sourceEvidence: msg('EVIDENCE_SOURCE_TEXT_THIN'),
    repair: msg('REPAIR_SOURCE_TEXT_ADVICE'),
    reasons, sourceChars: chars, pageCount: pages, emptyPages, garbledPages,
  };
}

/**
 * @param {{summary:string, questions:object[]}} draft an already schema-validated draft
 * @param {{segments:{pageIndex:number,text:string}[]}} context the exact source pages sent to the provider
 */
export function auditDraft(rawDraft, { segments }) {
  // The summary's technical markers ([[fig:UUID]] lines, \( \) \[ \] delimiters) are not claims: their digits and letters must not be read as
  // invented values or terms. The equations themselves stay in the text and are still screened like any other content.
  const draft = { ...rawDraft, summary: stripSummaryMarkup(rawDraft.summary) };
  // Word overlap says nothing across languages (an English textbook, a Portuguese lesson): those checks step aside, loudly but
  // as an advisory, and the language-independent ones — values, units, citations, duplicates, leaks — keep running.
  const sourceText = segments.map((s) => s.text).join(' ');
  const draftText = [draft.summary, ...(draft.questions ?? []).map((q) => `${q.question} ${q.answer} ${q.explanation ?? ''}`)].join(' ');
  const lexical = !differentLanguages(sourceText, draftText);
  const findings = [...auditSummary(draft.summary, segments, { lexical }), ...auditQuestions(draft.questions ?? [], segments, { lexical })];
  if (!lexical) {
    findings.push({
      issue: 'LEXICAL_CHECK_SKIPPED_CROSS_LANGUAGE',
      severity: 'LOW',
      scope: 'draft',
      generatedClaim: msg('CLAIM_LANGUAGES_DIFFER'),
      sourceEvidence: msg('EVIDENCE_LEXICAL_SKIPPED'),
      repair: msg('REPAIR_CROSS_LANGUAGE'),
    });
  }
  // Units swapped inside one dimension and qualifiers added or lost (ai/risk-checks.js); independent of the language of the draft.
  findings.push(...auditRisk(draft, { segments }));
  const volume = auditQuestionVolume((draft.questions ?? []).length, sourceText.length);
  if (volume) findings.push(volume);
  const sufficiency = auditSourceSufficiency(segments);
  if (sufficiency) findings.push(sufficiency);
  const blocking = findings.some(triggersRepair);
  return { result: blocking ? AUDIT_RESULT.REPAIR : AUDIT_RESULT.PASS, findings: findings.map(resolveMessages), auditedBy: 'DETERMINISTIC' };
}
