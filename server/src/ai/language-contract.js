// LANGUAGE CONTRACT (R-13). Three languages are never the same value:
//   sourceLanguage     detected from the approved source text (what the document is written in)
//   generationLocale   the student's persisted preference (what the content must be written in)
//   uiLocale           the interface (irrelevant here)
// The content a provider returns must be in generationLocale. Another language is a contract failure, not a quality opinion:
// the draft is refused and never stored. The check is deliberately conservative (language-detect.js): a text too short or
// ambiguous to classify is NOT claimed as verified — it is stored as UNVERIFIED unless the provider's own declaration
// matches the target.
import { detectLanguage } from './language-detect.js';
import { languageOf } from '../../../shared/locales.js';

export class LanguageMismatch extends Error {
  constructor(message) {
    super(message);
    this.code = 'LANGUAGE_MISMATCH';
  }
}

/** The language of the approved source payload: 'pt' | 'en' | 'es' | 'unknown'. Never inferred from preferences. */
export function detectSourceLanguage(segments) {
  return detectLanguage((segments ?? []).map((s) => s.text ?? '').join('\n')).language;
}

/** Every piece of pedagogical text the student will read, joined for detection. */
function pedagogicalText(draft) {
  const parts = [draft.summary];
  for (const q of draft.questions ?? []) parts.push(q.question, q.answer, q.explanation, q.hint);
  return parts.filter((p) => typeof p === 'string' && p.trim()).join('\n');
}

/**
 * @param declared  the provider's own `language` field when it sends one (a BCP 47 tag or bare language)
 * @returns {{status: 'VERIFIED'|'UNVERIFIED', detected: string, declared: string|null}}
 * @throws LanguageMismatch when the declaration or a confident detection contradicts the target
 */
export function checkDraftLanguage(draft, generationLocale, declared = null) {
  const target = languageOf(generationLocale);
  const declaredLanguage = typeof declared === 'string' && declared.trim() ? languageOf(declared) : null;
  if (declaredLanguage && declaredLanguage !== target) {
    throw new LanguageMismatch(`O provedor declarou o conteúdo em "${declared}", mas o idioma do conteúdo é "${generationLocale}". Nada foi salvo.`);
  }
  const detected = detectLanguage(pedagogicalText(draft)).language;
  if (detected !== 'unknown' && detected !== target) {
    throw new LanguageMismatch(`O conteúdo foi produzido em "${detected}", mas o idioma do conteúdo é "${generationLocale}". Nada foi salvo.`);
  }
  const verified = detected === target || declaredLanguage === target;
  return { status: verified ? 'VERIFIED' : 'UNVERIFIED', detected, declared: declaredLanguage };
}
