// LOCALES (R-13). Three different things are never the same value:
//   sourceLanguage     the language of the document/unit (detected, per source)
//   uiLocale           the language of the application interface (a preference)
//   generationLocale   the language the pedagogical content is produced in (a preference)
// This module only knows which locales the product supports and how to resolve a tag to one of them. It is deliberately a
// plain list: adding a language is adding one entry here (and, for the interface, a catalog), not a code change elsewhere.

/** BCP 47 tags the product supports for BOTH preferences. Variants (es-MX, en-US...) are added here only when a real need appears. */
export const SUPPORTED_LOCALES = Object.freeze(['pt-BR', 'es', 'en']);
export const DEFAULT_LOCALE = 'pt-BR';

/** Which supported locale a bare language (from a system locale, an Accept-Language header) maps to. */
const LANGUAGE_DEFAULT = new Map([['pt', 'pt-BR'], ['es', 'es'], ['en', 'en']]);
const BY_LOWERCASE = new Map(SUPPORTED_LOCALES.map((locale) => [locale.toLowerCase(), locale]));

/**
 * An EXPLICIT choice must be exactly one of the supported tags (case is normalized). Anything else is null, so the caller
 * can refuse it instead of silently picking something near.
 */
export function resolveSupportedLocale(tag) {
  if (typeof tag !== 'string') return null;
  return BY_LOWERCASE.get(tag.trim().toLowerCase()) ?? null;
}

/**
 * A HINT (system locale, header) is allowed to be approximate: an exact supported tag, otherwise the supported locale of its
 * language ("es-MX" -> "es", "pt" -> "pt-BR"). Unknown languages are null so the caller falls back to its own default.
 */
export function localeFromHint(tag) {
  if (typeof tag !== 'string' || !tag.trim()) return null;
  const exact = resolveSupportedLocale(tag);
  if (exact) return exact;
  const language = tag.trim().toLowerCase().split(/[-_]/)[0];
  return LANGUAGE_DEFAULT.get(language) ?? null;
}

/** The bare language of a locale ("pt-BR" -> "pt"), the vocabulary language-detect.js speaks. */
export function languageOf(locale) {
  return String(locale ?? '').split(/[-_]/)[0].toLowerCase();
}
