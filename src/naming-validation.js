import { t } from './i18n/index.js';

// NAMING_PATTERN: discipline/subject names only. Accepts letters (accented), numbers, spaces,
// hyphens, slashes, parentheses, basic punctuation, and valid medical/scientific typography
// (Greek letters, superscripts/subscripts, en/em dash, common math symbols — AC-05). Still
// rejects curly quotes and sentence-signal symbols (@ # $ % ^ ` ~ | \) that indicate a pasted
// sentence rather than a typed category name.
export const NAMING_PATTERN = /^[a-zA-ZÀ-ÖØ-öø-ÿ0-9 \-\/\(\)\.\,\:\;\'\°\+\=\[\]–—Ͱ-Ͽ⁰-₟²³¹±µ×÷<>]+$/;

// C0 controls, DEL, C1 controls and Unicode line/paragraph separators.
// Does NOT restrict medical typography: em dash, superscripts, Greek letters, etc.
const TITLE_CONTROL_RE = /[\x00-\x1F\x7F\u0080-\u009F\u2028\u2029]/;

export function validateNamingField(value, label) {
  if (!value) return t('validation.name.empty', { label });
  if (value.length < 2) return t('validation.name.tooShort', { label });
  if (!NAMING_PATTERN.test(value)) return t('validation.name.invalidChars', { label });
  return null;
}

// validateTitleField: for unit titles and free one-line text. More permissive than
// validateNamingField. Allows em dash (\u2014), medical symbols (Na+, B, O2, ug, etc.)
// and broad Unicode. Rejects only empty/invisible content and control characters.
export function validateTitleField(value, label) {
  if (typeof value !== 'string' || !value) return t('validation.title.empty', { label });
  const trimmed = value.normalize('NFC').trim();
  if (!trimmed) return t('validation.title.empty', { label });
  if (TITLE_CONTROL_RE.test(trimmed)) return t('validation.title.controlChars', { label });
  return null;
}
