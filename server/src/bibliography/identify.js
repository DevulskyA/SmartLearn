
// BIBLIOGRAPHY: what a PDF says about itself (title, authors, edition, year, language, ISBN). Pure functions: no I/O, no model, nothing persisted.
// Every value carries its ORIGIN, because a guess presented as a fact is how two different books get confused; what cannot be read stays null.
// Order of trust: ISBN with a valid check digit and the PDF's own metadata > the first pages' text > a heuristic > the file name. The student's
// own value (origin USER) is applied by the service and always wins.

export const FIELDS = Object.freeze(['title', 'authors', 'edition', 'year', 'language', 'isbn']);
export const ORIGINS = Object.freeze(['PDF_METADATA', 'TEXT', 'TEXT_HEURISTIC', 'FILE_NAME', 'USER']);

const digitsOf = (s) => String(s).replace(/[^0-9Xx]/g, '').toUpperCase();

export function isValidIsbn13(raw) {
  const d = digitsOf(raw);
  if (!/^\d{13}$/.test(d) || !/^97[89]/.test(d)) return false;
  const sum = [...d.slice(0, 12)].reduce((acc, ch, i) => acc + Number(ch) * (i % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10 === Number(d[12]);
}

export function isValidIsbn10(raw) {
  const d = digitsOf(raw);
  if (!/^\d{9}[\dX]$/.test(d)) return false;
  const sum = [...d].reduce((acc, ch, i) => acc + (ch === 'X' ? 10 : Number(ch)) * (10 - i), 0);
  return sum % 11 === 0;
}

/** ISBN-10 -> ISBN-13 (978 prefix), so both forms of the same edition compare equal. */
export function isbn10To13(raw) {
  const d = digitsOf(raw);
  const core = `978${d.slice(0, 9)}`;
  const sum = [...core].reduce((acc, ch, i) => acc + Number(ch) * (i % 2 === 0 ? 1 : 3), 0);
  return `${core}${(10 - (sum % 10)) % 10}`;
}

/** Every VALID ISBN in a text, normalized to ISBN-13, in order of appearance, without repeats. Invalid candidates are ignored, not guessed. */
export function findIsbns(text) {
  const found = [];
  const re = /(?:ISBN(?:-1[03])?[:\s]*)?((?:97[89][-\s]?)?(?:\d[-\s]?){9}[\dXx])/gi;
  for (const m of String(text ?? '').matchAll(re)) {
    const d = digitsOf(m[1]);
    const isbn13 = d.length === 13 && isValidIsbn13(d) ? d : d.length === 10 && isValidIsbn10(d) ? isbn10To13(d) : null;
    if (isbn13 && !found.includes(isbn13)) found.push(isbn13);
  }
  return found;
}

const ORDINALS = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15 };

/** Edition number from "7th edition", "Seventh Edition", "7ª edição", "7a ed." or "edición 7". */
export function findEditionNumber(text) {
  const t = String(text ?? '');
  let m = t.match(/\b(\d{1,2})\s*(?:st|nd|rd|th|ª|a|º|o)?\s*(?:edition|edi[cç][aã]o|edici[oó]n|ed\.)/i);
  if (m) return Number(m[1]);
  m = t.match(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth)\s+edition\b/i);
  if (m) return ORDINALS[m[1].toLowerCase()];
  m = t.match(/\b(?:edition|edi[cç][aã]o|edici[oó]n)\s*[:#]?\s*(\d{1,2})\b/i);
  return m ? Number(m[1]) : null;
}

const YEAR_RE = /(?<!\d)(19[5-9]\d|20[0-4]\d)(?!\d)/g;
/** The publication year: a "©/copyright/published" year wins; otherwise the file name's year; otherwise null (never the most frequent year). */
export function findPublicationYear({ text = '', fileName = '' } = {}) {
  const c = String(text).match(/(?:©|\(c\)|copyright|published|publicado|publicaci[oó]n)[^0-9]{0,20}((?:19[5-9]|20[0-4])\d)/i);
  if (c) return { year: Number(c[1]), method: 'COPYRIGHT_LINE' };
  const f = [...String(fileName).matchAll(YEAR_RE)].map((x) => Number(x[1]));
  return f.length > 0 ? { year: f[f.length - 1], method: 'FILE_NAME' } : { year: null, method: null };
}

// ---- what the PDF's own metadata dictionary says (untrusted text: kept as plain data, bounded, never interpreted) -------------------------
const MAX_TEXT = 300;
const clean = (v, max = MAX_TEXT) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');

// Titles that writers put in by default: a word-processor file name, "Untitled", a layout-tool name. They say nothing about the work.
const JUNK_TITLE = /^(untitled|sem t[ií]tulo|document\d*|documento\d*|microsoft word\b.*|slide \d+|presentation\d*|apresenta[cç][aã]o\d*|[\w .-]+\.(docx?|indd|qxd|pptx?|tex|pdf|odt|rtf))$/i;
const JUNK_AUTHOR = /^(admin|administrator|user|usuario|usuário|author|autor|owner|unknown|desconhecido|pc|windows user|microsoft|word|acrobat|adobe)$/i;

export function usablePdfTitle(raw) {
  const t = clean(raw);
  return t.length >= 4 && !JUNK_TITLE.test(t) ? t : '';
}

export function usablePdfAuthors(raw) {
  const t = clean(raw);
  return t.length >= 3 && !JUNK_AUTHOR.test(t) ? t : '';
}

/** "Costanzo_Physiology-7th ed [site].pdf" -> "Costanzo Physiology 7th ed". Only for a LOW-trust title when the PDF gave none. */
export function titleFromFileName(fileName) {
  return clean(String(fileName ?? '').replace(/\.(pdf|epub|docx?)$/i, '').replace(/\[[^\]]*\]/g, ' ').replace(/[_]+/g, ' ').replace(/\s*-\s*/g, ' - ')).replace(/^[\s-]+|[\s-]+$/g, '');
}

// ---- the cover: the first lines of the first pages (a heuristic, so its values carry the origin TEXT_HEURISTIC and the student can correct them) ----
const firstLines = (text, count) => String(text ?? '').split(/\r?\n/).map((l) => clean(l)).filter(Boolean).slice(0, count);
const NOT_A_TITLE = /(©|\(c\)|copyright|isbn|all rights|todos os direitos|edition|edi[cç][aã]o|edici[oó]n|https?:|www\.|@|^(by|por|autor(?:es|a|as)?|authors?|written by|escrito por|edited by|editado por|organizador(?:es)?)\b|^\d+$)/i;
const AUTHOR_LABEL = /^(?:by|por|autor(?:es|a|as)?|authors?|written by|escrito por|edited by|editado por|organizador(?:es)?)\s*[:-]?\s+(.{3,150})$/i;

/** The cover is the first page: pages are separated by a form feed (a text without one is taken as the cover as a whole). */
const coverOf = (text) => String(text ?? '').split('\f')[0];

/** Title Case or ALL CAPS: most words of 4+ letters start with a capital. A sentence of the body ("Pagina sem nenhuma informacao") is not a title. */
function looksLikeATitle(line) {
  const long = line.split(' ').filter((w) => w.replace(/[^A-Za-zÀ-ú]/g, '').length >= 4);
  if (long.length === 0) return false;
  return long.filter((w) => /^[A-ZÀ-Ý]/.test(w)).length / long.length >= 0.6;
}

/** The title on the cover: the first line that looks like a title (short, not a sentence, not a copyright/ISBN/edition/URL/author line). '' when none. */
export function titleFromText(text) {
  for (const line of firstLines(coverOf(text), 6)) {
    const words = line.split(' ').length;
    if (line.length < 4 || line.length > 150 || words > 15 || !/[A-Za-zÀ-ú]/.test(line) || !looksLikeATitle(line)) continue;
    if (NOT_A_TITLE.test(line) || /[.:,;]$/.test(line) || JUNK_TITLE.test(line)) continue;
    if ((line.match(/\d/g) ?? []).length > line.length / 3) continue;
    return line;
  }
  return '';
}

/** Authors ONLY from an explicit label ("Por X", "By X", "Autor: X") in the first lines; without a label, nothing is guessed. */
export function authorsFromText(text) {
  for (const line of firstLines(coverOf(text), 15)) {
    const m = AUTHOR_LABEL.exec(line);
    if (m && !/\d/.test(m[1]) && usablePdfAuthors(m[1])) return m[1].trim();
  }
  return '';
}

const LANG_WORDS = {
  pt: ['de', 'da', 'do', 'que', 'não', 'para', 'com', 'uma', 'os', 'as', 'dos', 'das', 'em', 'por', 'ao', 'são', 'ou', 'mais', 'como', 'foi'],
  en: ['the', 'of', 'and', 'to', 'in', 'is', 'that', 'for', 'with', 'are', 'was', 'by', 'this', 'which', 'from', 'be', 'as', 'it', 'on', 'or'],
  es: ['el', 'la', 'de', 'que', 'en', 'los', 'las', 'del', 'por', 'con', 'para', 'una', 'es', 'se', 'su', 'al', 'como', 'más', 'o', 'y'],
};

/** Primary language subtag of a PDF /Lang value ("pt-BR" -> "pt"), or '' when it is not a plausible tag. */
export function languageFromTag(raw) {
  const m = clean(raw, 20).match(/^([a-z]{2,3})(?:[-_][A-Za-z0-9]+)*$/i);
  return m ? m[1].toLowerCase() : '';
}

/** pt / en / es by function-word counts over the first pages; '' unless one language clearly leads on enough text (never a coin flip). */
export function guessLanguage(text) {
  const words = String(text ?? '').toLowerCase().match(/[a-zà-ú]+/g) ?? [];
  if (words.length < 120) return '';
  const counts = Object.fromEntries(Object.entries(LANG_WORDS).map(([lang, list]) => {
    const set = new Set(list);
    return [lang, words.reduce((n, w) => n + (set.has(w) ? 1 : 0), 0)];
  }));
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const [best, second] = ranked;
  return best[1] >= words.length * 0.08 && best[1] >= second[1] * 1.4 ? best[0] : '';
}

/**
 * What a file says about itself.
 * @param {{ fileName?: string, firstPagesText?: string, pdfInfo?: { title?: string, author?: string, language?: string } }} input
 * @returns {{ fields: {title,authors,edition,year,language,isbn}, origins: Object<string,string> }} an absent field is null and has no origin.
 */
export function identifyBibliography({ fileName = '', firstPagesText = '', pdfInfo = {} } = {}) {
  const fields = { title: null, authors: null, edition: null, year: null, language: null, isbn: null };
  const origins = {};
  const set = (field, value, origin) => { if (value !== null && value !== undefined && value !== '') { fields[field] = value; origins[field] = origin; } };

  const pdfTitle = usablePdfTitle(pdfInfo?.title);
  const coverTitle = pdfTitle ? '' : titleFromText(firstPagesText);
  if (pdfTitle) set('title', pdfTitle, 'PDF_METADATA');
  else if (coverTitle) set('title', coverTitle, 'TEXT_HEURISTIC');
  else set('title', titleFromFileName(fileName), 'FILE_NAME');
  const pdfAuthors = usablePdfAuthors(pdfInfo?.author);
  if (pdfAuthors) set('authors', pdfAuthors, 'PDF_METADATA'); else set('authors', authorsFromText(firstPagesText), 'TEXT_HEURISTIC');

  const isbn = findIsbns(firstPagesText)[0];
  set('isbn', isbn, 'TEXT');

  const editionInText = findEditionNumber(firstPagesText);
  if (editionInText !== null) set('edition', String(editionInText), 'TEXT');
  else { const fromName = findEditionNumber(fileName); if (fromName !== null) set('edition', String(fromName), 'FILE_NAME'); }

  const { year, method } = findPublicationYear({ text: firstPagesText, fileName });
  set('year', year, method === 'COPYRIGHT_LINE' ? 'TEXT' : 'FILE_NAME');

  const tag = languageFromTag(pdfInfo?.language);
  if (tag) set('language', tag, 'PDF_METADATA'); else set('language', guessLanguage(firstPagesText), 'TEXT_HEURISTIC');

  return { fields, origins };
}

/** The bibliography of a `sources` row, as the API shows it. Never throws on a row from before migration 044 (all columns null). */
export function bibliographyOf(row) {
  let origins = {};
  try { const parsed = JSON.parse(row?.bib_origins ?? '{}'); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) origins = parsed; } catch { /* unreadable origins mean "unknown" */ }
  return {
    title: row?.bib_title ?? null,
    authors: row?.bib_authors ?? null,
    edition: row?.bib_edition ?? null,
    year: row?.bib_year ?? null,
    language: row?.bib_language ?? null,
    isbn: row?.bib_isbn ?? null,
    origins,
  };
}
