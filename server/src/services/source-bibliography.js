// Bibliographic metadata of a student's file, stored on the file's own `sources` row (migration 044). Two writers, one rule:
//   * extraction (applyExtractedBibliography): fills every field that the student has NOT set; it is recomputed on re-extraction and is
//     best-effort -- a failure here never fails an extraction and a field it cannot read stays null (no invention);
//   * the student (updateBibliography): a value or an explicit empty, origin USER, which no extraction ever overwrites.
// Nothing here touches the file, its checksum, its pages, or another user's rows (every statement is scoped by user_id).
import { identifyBibliography, bibliographyOf, isbn10To13, isValidIsbn10, isValidIsbn13, FIELDS } from '../bibliography/identify.js';
import { SourceError } from './source-storage.js';
import { dm } from '../api-error-messages.js';

const LIMITS = { title: 300, authors: 300, edition: 40, language: 12 };
const YEAR_MIN = 1450;
const YEAR_MAX = 2100;

function readRow(db, userId, sourceId) {
  return db.prepare('SELECT * FROM sources WHERE user_id = ? AND id = ?').get(userId, sourceId);
}

/** Fills the fields the student has not set (with fillOnly, only the empty ones), from the PDF's metadata, its first pages and its file name. Returns the bibliography, or null when the source is gone. */
export function applyExtractedBibliography(db, userId, sourceId, { pdfInfo = {}, firstPagesText = null, fillOnly = false, now = () => new Date() } = {}) {
  const row = readRow(db, userId, sourceId);
  if (!row) return null;
  const text = firstPagesText ?? db.prepare('SELECT text FROM source_pages WHERE user_id = ? AND source_id = ? AND page_index <= 4 ORDER BY page_index')
    .all(userId, sourceId).map((r) => r.text ?? '').join('\n\f\n'); // a form feed marks each page boundary: the cover is the first page only
  const found = identifyBibliography({ fileName: row.original_name, firstPagesText: text, pdfInfo });
  const current = bibliographyOf(row);
  const values = {};
  const origins = { ...current.origins };
  for (const field of FIELDS) {
    if (current.origins[field] === 'USER') { values[field] = current[field]; continue; }
    // fillOnly (a failed run): what an earlier extraction identified stays; only empty fields may be filled.
    if (fillOnly && current[field] !== null) { values[field] = current[field]; continue; }
    values[field] = found.fields[field];
    if (found.origins[field]) origins[field] = found.origins[field]; else delete origins[field];
  }
  db.prepare(`UPDATE sources SET bib_title = ?, bib_authors = ?, bib_edition = ?, bib_year = ?, bib_language = ?, bib_isbn = ?, bib_origins = ?, bib_updated_at = ?
               WHERE user_id = ? AND id = ?`)
    .run(values.title, values.authors, values.edition, values.year, values.language, values.isbn, JSON.stringify(origins), now().toISOString(), userId, sourceId);
  return bibliographyOf(readRow(db, userId, sourceId));
}

const fail = (field, message) => new SourceError('VALIDATION_FAILED', message, field);

function normalizeText(field, value) {
  if (value === null) return null;
  if (typeof value !== 'string') throw fail(field, 'Informe um texto.');
  const text = value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (text.length > LIMITS[field]) throw fail(field, `No máximo ${LIMITS[field]} caracteres.`);
  return text === '' ? null : text;
}

function normalizeYear(value) {
  if (value === null) return null;
  if (!Number.isInteger(value) || value < YEAR_MIN || value > YEAR_MAX) throw fail('year', `Informe um ano entre ${YEAR_MIN} e ${YEAR_MAX}.`);
  return value;
}

/** An ISBN the student typed: ISBN-13 or ISBN-10 with a valid check digit, stored as 13 digits. A wrong digit is refused, never "fixed". */
function normalizeIsbn(value) {
  if (value === null) return null;
  if (typeof value !== 'string') throw fail('isbn', 'Informe o ISBN.');
  if (value.trim() === '') return null;
  const digits = value.replace(/[^0-9Xx]/g, '').toUpperCase();
  if (digits.length === 13 && isValidIsbn13(digits)) return digits;
  if (digits.length === 10 && isValidIsbn10(digits)) return isbn10To13(digits);
  throw fail('isbn', 'ISBN inválido: confira os dígitos.');
}

/**
 * The student's correction. `patch` holds only the fields to change; null or an empty text clears the value (and still records that the student decided).
 * @returns {object} the bibliography after the change.
 */
export function updateBibliography(db, userId, sourceId, patch, { now = () => new Date() } = {}) {
  const row = readRow(db, userId, sourceId);
  if (!row) throw new SourceError('NOT_FOUND', dm('SOURCE_NOT_FOUND'));
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw fail(undefined, 'Envie os campos a corrigir.');
  const keys = Object.keys(patch);
  const unknown = keys.filter((k) => !FIELDS.includes(k));
  if (unknown.length > 0) throw fail(unknown[0], 'Campo desconhecido.');
  if (keys.length === 0) throw fail(undefined, 'Envie ao menos um campo.');

  const current = bibliographyOf(row);
  const next = { ...current };
  const origins = { ...current.origins };
  for (const field of keys) {
    const value = patch[field];
    next[field] = field === 'year' ? normalizeYear(value) : field === 'isbn' ? normalizeIsbn(value) : normalizeText(field, value);
    origins[field] = 'USER';
  }
  db.prepare(`UPDATE sources SET bib_title = ?, bib_authors = ?, bib_edition = ?, bib_year = ?, bib_language = ?, bib_isbn = ?, bib_origins = ?, bib_updated_at = ?
               WHERE user_id = ? AND id = ?`)
    .run(next.title, next.authors, next.edition, next.year, next.language, next.isbn, JSON.stringify(origins), now().toISOString(), userId, sourceId);
  return bibliographyOf(readRow(db, userId, sourceId));
}
