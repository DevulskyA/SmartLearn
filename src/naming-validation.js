// NAMING_PATTERN: discipline/subject names only. Accepts letters (accented), numbers, spaces,
// hyphens, slashes, parentheses and basic punctuation. Rejects em dashes, curly quotes and
// other typographic chars that signal pasted sentences rather than typed category names.
export const NAMING_PATTERN = /^[a-zA-ZÀ-ÖØ-öø-ÿ0-9 \-\/\(\)\.\,\:\;\'\°\+\=\[\]]+$/;

// C0 controls, DEL, C1 controls and Unicode line/paragraph separators.
// Does NOT restrict medical typography: em dash, superscripts, Greek letters, etc.
const TITLE_CONTROL_RE = /[\x00-\x1F\x7F\u0080-\u009F\u2028\u2029]/;

export function validateNamingField(value, label) {
  if (!value) return `Informe ${label}.`;
  if (value.length < 2) return `${label} deve ter ao menos 2 caracteres.`;
  if (!NAMING_PATTERN.test(value)) return `${label} contém caracteres não permitidos. Use letras, números, espaços e pontuação básica ( - / . , : ).`;
  return null;
}

// validateTitleField: for unit titles and free one-line text. More permissive than
// validateNamingField. Allows em dash (\u2014), medical symbols (Na+, B, O2, ug, etc.)
// and broad Unicode. Rejects only empty/invisible content and control characters.
export function validateTitleField(value, label) {
  if (typeof value !== 'string' || !value) return `Informe ${label}.`;
  const trimmed = value.normalize('NFC').trim();
  if (!trimmed) return `Informe ${label}.`;
  if (TITLE_CONTROL_RE.test(trimmed)) return `${label} contém caracteres de controle não permitidos.`;
  return null;
}
