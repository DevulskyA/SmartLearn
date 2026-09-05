// Characters allowed in subject/discipline names and unit titles.
// Accepts: letters (including accented), numbers, spaces, hyphens, slashes,
// parentheses, apostrophes, and basic punctuation used when categorising content.
// Rejects: em dashes, curly quotes, and other typographic chars that come from
// pasting sentences rather than typing a name.
export const NAMING_PATTERN = /^[a-zA-ZÀ-ÖØ-öø-ÿ0-9 \-\/\(\)\.\,\:\;\'\°\+\=\[\]]+$/;

export function validateNamingField(value, label) {
  if (!value) return `Informe ${label}.`;
  if (value.length < 2) return `${label} deve ter ao menos 2 caracteres.`;
  if (!NAMING_PATTERN.test(value)) return `${label} contém caracteres não permitidos. Use letras, números, espaços e pontuação básica ( - / . , : ).`;
  return null;
}
