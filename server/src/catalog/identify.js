// CATALOG, step 1: identify a work and its edition from what the file itself says. Pure functions: no I/O, no model, nothing persisted.
// Every answer carries a CONFIDENCE and its METHOD, because a guess presented as a fact is how two different books get merged.
//   ISBN found and its check digit is valid  -> HIGH   (an ISBN names exactly one edition/format)
//   edition ordinal or year found in the text -> MEDIUM (an edition, not proof of which book)
//   only the file name                        -> LOW    (a name is whatever the uploader called the file)

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

const KIND_HINTS = [
  ['TRANSCRIPT', /\b(transcri[cç][aã]o|transcript|aula gravada|lecture recording)\b/i],
  ['NOTES', /\b(anota[cç][oõ]es|notes|resumo|caderno|fichamento)\b/i],
  ['HANDOUT', /\b(apostila|handout|slides?|material did[aá]tico)\b/i],
];
/** BOOK only with positive evidence (an ISBN or an edition number); handouts/notes/transcripts by their words; otherwise UNKNOWN. */
export function guessKind({ fileName = '', text = '', hasIsbn = false, editionNumber = null } = {}) {
  const hay = `${fileName}\n${String(text).slice(0, 3000)}`;
  for (const [kind, re] of KIND_HINTS) if (re.test(hay)) return kind;
  return hasIsbn || editionNumber ? 'BOOK' : 'UNKNOWN';
}

/** Lower-case, no accents, no format words or tags, single spaces: the comparable form of a title. */
export function normalizeTitle(raw) {
  return String(raw ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
    .replace(/\.(pdf|epub|docx?)$/i, '')
    .replace(/\b(\d{1,2}\s*(st|nd|rd|th|a|o)?\s*(edition|edicao|ed)|(19|20)\d\d|pdf|ebook|www\.[^\s]+)\b/gi, ' ')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * What a file says about itself. `firstPagesText` = text of the first pages (title page, copyright page).
 * @returns {{ isbns:string[], editionNumber:number|null, year:number|null, kind:string, titleKey:string, confidence:'HIGH'|'MEDIUM'|'LOW', methods:string[] }}
 */
export function identifyFile({ fileName = '', firstPagesText = '' } = {}) {
  const isbns = findIsbns(firstPagesText);
  const editionNumber = findEditionNumber(firstPagesText) ?? findEditionNumber(fileName);
  const { year, method: yearMethod } = findPublicationYear({ text: firstPagesText, fileName });
  const methods = [];
  if (isbns.length > 0) methods.push('ISBN_CHECKED');
  if (editionNumber !== null) methods.push('EDITION_TEXT');
  if (year !== null) methods.push(yearMethod);
  const confidence = isbns.length > 0 ? 'HIGH' : editionNumber !== null || yearMethod === 'COPYRIGHT_LINE' ? 'MEDIUM' : 'LOW';
  return { isbns, editionNumber, year, kind: guessKind({ fileName, text: firstPagesText, hasIsbn: isbns.length > 0, editionNumber }), titleKey: normalizeTitle(fileName), confidence, methods };
}
