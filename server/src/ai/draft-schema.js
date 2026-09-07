// T37: the ONE validation boundary both providers (fake and real) go
// through identically — a provider adapter never decides for itself
// whether its own output is trustworthy. Rejects malformed shapes and
// quarantines (drops) any citation that does not resolve to a real page
// actually present in the input segments; a question left with zero valid
// citations after quarantine is itself dropped, never kept unattributed
// (AC-19/AC-21: "every proposed unit is attributable to exact source
// segments").

export class DraftValidationError extends Error {
  constructor(code, message, field) {
    super(message);
    this.code = code;
    if (field) this.field = field;
  }
}

const MAX_SUMMARY_LENGTH = 2000;
const MAX_QUESTIONS = 50;
const MAX_QUESTION_LENGTH = 1000;
const MAX_ANSWER_LENGTH = 2000;
const ALLOWED_DRAFT_KEYS = new Set(['summary', 'questions', 'modelVersion', 'promptVersion']);
const ALLOWED_QUESTION_KEYS = new Set(['question', 'answer', 'hint', 'sourceSpans']);

function requireString(value, field, maxLength) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new DraftValidationError('INVALID_DRAFT', `${field} deve ser uma string não vazia.`, field);
  }
  if (maxLength && value.length > maxLength) {
    throw new DraftValidationError('INVALID_DRAFT', `${field} excede o tamanho máximo de ${maxLength}.`, field);
  }
}

function validSourceSpans(rawSpans, validPageIndexes) {
  if (!Array.isArray(rawSpans)) return [];
  return rawSpans.filter((span) => {
    if (!span || typeof span !== 'object') return false;
    const keys = Object.keys(span);
    if (keys.length !== 1 || keys[0] !== 'pageIndex') return false;
    return Number.isInteger(span.pageIndex) && validPageIndexes.has(span.pageIndex);
  });
}

/**
 * @param {unknown} raw the provider's raw output (fake or real, untrusted
 *   either way).
 * @param {{segments: {pageIndex:number, text:string}[]}} context the exact
 *   segments that were actually sent to the provider — the only source of
 *   truth for "is this citation real".
 * @returns {{summary:string, questions:object[], modelVersion:string,
 *   promptVersion:string, quarantinedCount:number}}
 */
export function validateDraft(raw, { segments }) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new DraftValidationError('INVALID_DRAFT', 'A resposta do provedor não é um objeto JSON válido.');
  }
  for (const key of Object.keys(raw)) {
    if (!ALLOWED_DRAFT_KEYS.has(key)) {
      throw new DraftValidationError('INVALID_DRAFT', `Campo não suportado no rascunho: ${key}.`, key);
    }
  }

  requireString(raw.summary, 'summary', MAX_SUMMARY_LENGTH);
  requireString(raw.modelVersion, 'modelVersion');
  requireString(raw.promptVersion, 'promptVersion');
  if (!Array.isArray(raw.questions) || raw.questions.length === 0) {
    throw new DraftValidationError('INVALID_DRAFT', 'questions deve ser uma lista não vazia.', 'questions');
  }
  if (raw.questions.length > MAX_QUESTIONS) {
    throw new DraftValidationError('INVALID_DRAFT', `questions excede o máximo de ${MAX_QUESTIONS} itens.`, 'questions');
  }

  const validPageIndexes = new Set(segments.map((s) => s.pageIndex));
  let quarantinedCount = 0;
  const acceptedQuestions = [];

  for (const rawQuestion of raw.questions) {
    if (!rawQuestion || typeof rawQuestion !== 'object' || Array.isArray(rawQuestion)) {
      throw new DraftValidationError('INVALID_DRAFT', 'Cada item de questions deve ser um objeto.', 'questions');
    }
    for (const key of Object.keys(rawQuestion)) {
      if (!ALLOWED_QUESTION_KEYS.has(key)) {
        throw new DraftValidationError('INVALID_DRAFT', `Campo não suportado em uma questão: ${key}.`, key);
      }
    }
    requireString(rawQuestion.question, 'question', MAX_QUESTION_LENGTH);
    requireString(rawQuestion.answer, 'answer', MAX_ANSWER_LENGTH);
    if (rawQuestion.hint !== null && rawQuestion.hint !== undefined && typeof rawQuestion.hint !== 'string') {
      throw new DraftValidationError('INVALID_DRAFT', 'hint deve ser uma string ou nulo.', 'hint');
    }

    const spans = validSourceSpans(rawQuestion.sourceSpans, validPageIndexes);
    const rawSpanCount = Array.isArray(rawQuestion.sourceSpans) ? rawQuestion.sourceSpans.length : 0;
    quarantinedCount += rawSpanCount - spans.length;

    // A question left with zero real citations after quarantine is not
    // "unattributed content we kept anyway" — it is dropped entirely.
    if (spans.length === 0) {
      quarantinedCount += 1;
      continue;
    }

    acceptedQuestions.push({
      question: rawQuestion.question,
      answer: rawQuestion.answer,
      hint: rawQuestion.hint ?? null,
      sourceSpans: spans,
    });
  }

  if (acceptedQuestions.length === 0) {
    throw new DraftValidationError('INVALID_DRAFT', 'Nenhuma questão do rascunho tinha citação válida — rascunho descartado.', 'questions');
  }

  return {
    summary: raw.summary,
    questions: acceptedQuestions,
    modelVersion: raw.modelVersion,
    promptVersion: raw.promptVersion,
    quarantinedCount,
  };
}
