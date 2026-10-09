// PROMPT LAB metrics: deterministic, source-grounded measurements of one generated draft. Pure functions, no I/O, no model.
// They are SIGNALS for a human reviewer and for comparing prompt variants side by side; none of them is a verdict on medical
// correctness (that stays with the rubric and the human). Everything here must be cheap to explain.

const STOP = new Set(['para', 'como', 'qual', 'quais', 'pela', 'pelo', 'pelas', 'pelos', 'uma', 'umas', 'uns', 'que', 'por', 'com', 'sem', 'dos', 'das', 'nos', 'nas', 'sobre', 'entre', 'esse', 'essa', 'esses', 'essas', 'isso', 'esta', 'este', 'seu', 'sua', 'seus', 'suas', 'mais', 'menos', 'também', 'quando', 'onde', 'porque', 'pois', 'ser', 'são', 'foi', 'ele', 'ela', 'eles', 'elas', 'não', 'nem', 'mas', 'ainda', 'cada', 'todo', 'toda', 'todos', 'todas', 'muito', 'apenas', 'segundo', 'texto', 'the', 'and', 'for', 'that', 'with', 'from', 'this', 'are', 'was', 'has', 'have']);

const strip = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export function contentWords(text) {
  return strip(text).split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !STOP.has(w));
}
const set = (words) => new Set(words);
function overlap(a, b) { // share of A's content words that also occur in B
  const A = set(a);
  if (A.size === 0) return 0;
  const B = set(b);
  let n = 0;
  for (const w of A) if (B.has(w)) n += 1;
  return n / A.size;
}
function jaccard(a, b) {
  const A = set(a); const B = set(b);
  if (A.size === 0 && B.size === 0) return 0;
  let n = 0;
  for (const w of A) if (B.has(w)) n += 1;
  return n / (A.size + B.size - n);
}

/** Numbers as written, normalised so "0,45", "0.45" and "−35"/"-35" compare equal; years and single digits are ignored (noise). */
export function numbersIn(text) {
  const out = [];
  for (const m of String(text ?? '').replace(/[−–]/g, '-').matchAll(/(?<![\w.,])-?\d+(?:[.,]\d+)?(?![\w])/g)) {
    const norm = m[0].replace(',', '.').replace(/^-/, '');
    const value = Number(norm);
    if (!Number.isFinite(value)) continue;
    if (norm.length <= 1) continue; // single digits: list numbering, "3 camadas"
    out.push(norm);
  }
  return out;
}

/**
 * @param {{ summary: string, questions: Array<{question:string, answer:string, explanation?:string|null, hint?:string|null, questionType?:string|null, sourceSpans?:Array<{pageIndex:number}>}> }} draft
 * @param {{ sourceText: string, pages?: number[], outOfScopeTerms?: string[], leakThreshold?: number, echoThreshold?: number, duplicateThreshold?: number }} ctx
 */
export function measureDraft(draft, ctx) {
  const { sourceText, pages = [], outOfScopeTerms = [], leakThreshold = 0.6, echoThreshold = 0.85, duplicateThreshold = 0.6 } = ctx;
  const questions = draft.questions ?? [];
  const sourceChars = sourceText.length;
  const sourceNumbers = new Set(numbersIn(sourceText));
  const sourceWords = set(contentWords(sourceText));

  const perQuestion = questions.map((q, i) => {
    const answerWords = contentWords(q.answer);
    const hintWords = contentWords(q.hint);
    const explanationWords = contentWords(q.explanation);
    const hintLeak = hintWords.length > 0 ? overlap(hintWords, answerWords) : 0;
    const explanationEcho = explanationWords.length > 0 ? overlap(explanationWords, [...answerWords, ...contentWords(q.question)]) : 0;
    const unsupportedNumbers = [...new Set(numbersIn(`${q.question} ${q.answer} ${q.explanation ?? ''} ${q.hint ?? ''}`))].filter((n) => !sourceNumbers.has(n));
    return {
      index: i + 1,
      hintLeak: Number(hintLeak.toFixed(2)),
      explanationEcho: Number(explanationEcho.toFixed(2)),
      missingExplanation: !String(q.explanation ?? '').trim(),
      missingHint: !String(q.hint ?? '').trim(),
      unsupportedNumbers,
      novelWordShare: Number((1 - overlap(contentWords(`${q.question} ${q.answer}`), [...sourceWords])).toFixed(2)),
      outOfScope: outOfScopeTerms.filter((t) => strip(`${q.question} ${q.answer} ${q.explanation ?? ''}`).includes(strip(t))),
    };
  });

  const duplicates = [];
  for (let i = 0; i < questions.length; i += 1) {
    for (let j = i + 1; j < questions.length; j += 1) {
      const sim = jaccard(contentWords(questions[i].question), contentWords(questions[j].question));
      if (sim >= duplicateThreshold) duplicates.push({ a: i + 1, b: j + 1, similarity: Number(sim.toFixed(2)) });
    }
  }

  const cited = new Map();
  for (const q of questions) for (const s of q.sourceSpans ?? []) cited.set(s.pageIndex, (cited.get(s.pageIndex) ?? 0) + 1);
  const summaryUnsupportedNumbers = [...new Set(numbersIn(draft.summary))].filter((n) => !sourceNumbers.has(n));
  const types = {};
  for (const q of questions) types[q.questionType ?? 'NONE'] = (types[q.questionType ?? 'NONE'] ?? 0) + 1;

  return {
    sourceChars,
    questionCount: questions.length,
    questionsPer1kSourceChars: sourceChars ? Number(((questions.length / sourceChars) * 1000).toFixed(2)) : null,
    summaryChars: String(draft.summary ?? '').length,
    summaryToSourceRatio: sourceChars ? Number((String(draft.summary ?? '').length / sourceChars).toFixed(2)) : null,
    questionTypes: types,
    hintsLeaking: perQuestion.filter((p) => p.hintLeak >= leakThreshold).map((p) => p.index),
    explanationsEchoing: perQuestion.filter((p) => p.explanationEcho >= echoThreshold).map((p) => p.index),
    missingExplanations: perQuestion.filter((p) => p.missingExplanation).map((p) => p.index),
    unsupportedNumbers: perQuestion.filter((p) => p.unsupportedNumbers.length).map((p) => ({ question: p.index, numbers: p.unsupportedNumbers })),
    summaryUnsupportedNumbers,
    outOfScopeQuestions: perQuestion.filter((p) => p.outOfScope.length).map((p) => ({ question: p.index, terms: p.outOfScope })),
    outOfScopeInSummary: outOfScopeTerms.filter((t) => strip(draft.summary).includes(strip(t))),
    nearDuplicateQuestions: duplicates,
    pagesWithoutQuestions: pages.filter((p) => !cited.has(p)),
    questionsPerPage: Object.fromEntries([...cited.entries()].sort((a, b) => a[0] - b[0])),
    perQuestion,
  };
}

/** One compact line per variant for the comparison table. */
export function summarizeMeasures(m) {
  return {
    questions: m.questionCount,
    per1k: m.questionsPer1kSourceChars,
    summaryChars: m.summaryChars,
    summaryRatio: m.summaryToSourceRatio,
    hintsLeaking: m.hintsLeaking.length,
    explanationsEchoing: m.explanationsEchoing.length,
    missingExplanations: m.missingExplanations.length,
    questionsWithUnsupportedNumbers: m.unsupportedNumbers.length,
    summaryUnsupportedNumbers: m.summaryUnsupportedNumbers.length,
    outOfScopeQuestions: m.outOfScopeQuestions.length,
    outOfScopeInSummary: m.outOfScopeInSummary.length,
    nearDuplicates: m.nearDuplicateQuestions.length,
    pagesWithoutQuestions: m.pagesWithoutQuestions.length,
  };
}
