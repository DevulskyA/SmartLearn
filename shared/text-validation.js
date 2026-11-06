// T14: shared name/text normalization, usable from both the client
// (src/naming-validation.js currently duplicates an equivalent ruleset) and
// the server. This is the single source of truth going forward for subject/
// title validation; a future task may point the client import here instead
// of keeping a parallel copy, but that migration is out of this task's
// scope — this file must not diverge in behavior from the client's existing
// rules (verified by mirroring the same accepted/rejected corpus).

// Accepts letters (incl. accented), numbers, spaces, common punctuation,
// and valid medical/scientific typography (Greek letters, superscripts/
// subscripts, en/em dash, common math symbols — AC-05). Still rejects
// sentence-signal ASCII symbols (@ # $ % ^ ` ~ | \) and curly quotes that
// indicate a pasted sentence rather than a typed category name.
export const NAMING_PATTERN = /^[a-zA-ZÀ-ÖØ-öø-ÿ0-9 \-\/\(\)\.\,\:\;\'\°\+\=\[\]–—Ͱ-Ͽ⁰-₟²³¹±µ×÷<>]+$/;

const CONTROL_RE = new RegExp('[' + String.fromCharCode(0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,127,0x85,0x2028,0x2029) + ']');

export function normalizeEntityName(value) {
  if (typeof value !== 'string') return '';
  return value.normalize('NFC').replace(/[ \t]+/g, ' ').trim();
}

export function validateNamingField(value, label) {
  const normalized = normalizeEntityName(value);
  if (!normalized) return `Informe ${label}.`;
  if (normalized.length < 2) return `${label} deve ter ao menos 2 caracteres.`;
  if (normalized.length > 100) return `${label} excede o tamanho máximo permitido.`;
  if (CONTROL_RE.test(normalized)) return `${label} contém caracteres de controle não permitidos.`;
  if (!NAMING_PATTERN.test(normalized)) return `${label} contém caracteres não permitidos. Use letras, números, espaços e pontuação básica ( - / . , : ).`;
  return null;
}

// Dedup key: case-insensitive, NFC-normalized, whitespace-collapsed. Used
// consistently by UI, server and database uniqueness (design.md §4).
export function nameKey(value) {
  return normalizeEntityName(value).toLowerCase();
}
