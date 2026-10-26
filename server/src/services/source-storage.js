import { createHash, randomBytes } from 'node:crypto';
import { dm, splitMessage } from '../api-error-messages.js';
import { mkdirSync, writeFileSync, unlinkSync, existsSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';

export class SourceError extends Error {
  constructor(code, message, field) {
    const { text, msg } = splitMessage(message);
    super(text);
    this.code = code;
    if (field) this.field = field;
    if (msg) this.msg = msg;
  }
}

const PDF_MAGIC = Buffer.from('%PDF-', 'latin1');
// Heuristic, not an authoritative parse: an encrypted PDF's cross-reference
// trailer references an /Encrypt dictionary. A real PDF.js parse (T35) can
// still find a document this misses or misclassifies -- this is a cheap,
// honest pre-filter at upload time, documented as exactly that.
const ENCRYPT_MARKER = '/Encrypt';

function looksLikePdf(buffer) {
  return buffer.length >= PDF_MAGIC.length && buffer.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC);
}

function looksEncrypted(buffer) {
  return buffer.toString('latin1').includes(ENCRYPT_MARKER);
}

export function sha256Hex(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function randomOnDiskFilename() {
  // Always .pdf: by the time this runs, looksLikePdf() has already passed --
  // there is no path where an accepted file has any other real type.
  return randomBytes(16).toString('hex') + '.pdf';
}

/**
 * Sanitizes the user-supplied original filename to a safe DISPLAY string.
 * This value is NEVER used to build a filesystem path (the on-disk name is
 * always the random one from randomOnDiskFilename()) -- so a path-traversal
 * payload here (a relative path, an embedded control character, etc.) has
 * no filesystem effect by construction; this still strips path separators
 * and control characters so the stored metadata itself stays inert if ever
 * rendered. Control characters are dropped by codepoint comparison rather
 * than a hex-escape regex, to keep this function free of any escape
 * sequence a tool in the authoring chain could misinterpret.
 */
function sanitizeOriginalName(name) {
  const base = typeof name === 'string' ? name : 'source.pdf';
  const withoutSeparators = base.split('\\').join('_').split('/').join('_');
  let printable = '';
  for (const ch of withoutSeparators) {
    const code = ch.codePointAt(0);
    const isAsciiControl = code < 32 || code === 127;
    // T-F8-02: also C1 controls and invisible format characters (bidi overrides such as U+202E, zero-width marks, BOM) and
    // line/paragraph separators: a right-to-left override makes "evil.exe" display as "evil.pdf"-looking text.
    const isInvisible = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(ch);
    if (!isAsciiControl && !isInvisible) printable += ch;
  }
  const trimmed = printable.trim();
  const safe = trimmed.length > 0 ? trimmed : 'source.pdf';
  return safe.slice(0, 200);
}

function ensureSourcesDir(sourcesDir) {
  if (!existsSync(sourcesDir)) mkdirSync(sourcesDir, { recursive: true });
}

function findOwnedSourceByChecksum(db, userId, checksum) {
  return db.prepare('SELECT * FROM sources WHERE user_id = ? AND checksum = ?').get(userId, checksum);
}

function currentQuotaUsage(db, userId) {
  const { total } = db.prepare('SELECT COALESCE(SUM(byte_size), 0) AS total FROM sources WHERE user_id = ?').get(userId);
  return total;
}

function toDto(row) {
  return {
    id: row.id,
    originalName: row.original_name,
    contentType: row.content_type,
    byteSize: row.byte_size,
    checksum: row.checksum,
    status: row.status,
    extractionStatus: row.extraction_status ?? null,
    pageCount: row.page_count ?? null,
    createdAt: row.created_at,
  };
}

/**
 * Accepts one uploaded PDF: validates actual content (magic bytes, not the
 * declared content-type alone), rejects anything that looks encrypted,
 * enforces the per-file size cap and the per-account quota, then writes it
 * under a random on-disk filename and records ownership. A byte-identical
 * re-upload by the SAME user (same checksum) returns the EXISTING row --
 * explicit dedup, never a second file or a second row (UNIQUE(user_id,
 * checksum) is the database-level backstop against a race on this check).
 *
 * Rejects BEFORE writing anything to disk or the database -- a rejected
 * upload leaves zero residual accepted rows or files, by construction: the
 * file write and the INSERT both happen only after every check below.
 */
export function acceptUpload(db, userId, { buffer, originalName, contentType, sourcesDir, maxBytes, quotaBytes }, now = () => new Date()) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new SourceError('VALIDATION_FAILED', dm('SOURCE_FILE_EMPTY'), 'file');
  }
  if (buffer.length > maxBytes) {
    throw new SourceError('FILE_TOO_LARGE', dm('SOURCE_FILE_TOO_LARGE', { bytes: maxBytes }), 'file');
  }
  if (contentType !== 'application/pdf') {
    throw new SourceError('UNSUPPORTED_FILE_TYPE', dm('SOURCE_NOT_PDF_TYPE'), 'contentType');
  }
  if (!looksLikePdf(buffer)) {
    throw new SourceError('UNSUPPORTED_FILE_TYPE', dm('SOURCE_NOT_VALID_PDF'), 'file');
  }
  if (looksEncrypted(buffer)) {
    throw new SourceError('ENCRYPTED_FILE_REJECTED', dm('SOURCE_ENCRYPTED'), 'file');
  }

  const checksum = sha256Hex(buffer);
  const existing = findOwnedSourceByChecksum(db, userId, checksum);
  if (existing) return toDto(existing);

  const usage = currentQuotaUsage(db, userId);
  if (usage + buffer.length > quotaBytes) {
    throw new SourceError('QUOTA_EXCEEDED', dm('SOURCE_QUOTA_EXCEEDED'), 'file');
  }

  ensureSourcesDir(sourcesDir);
  const filename = randomOnDiskFilename();
  const destPath = join(sourcesDir, filename);
  writeFileSync(destPath, buffer);

  try {
    const nowIso = now().toISOString();
    const result = db.prepare(`
      INSERT INTO sources (user_id, filename, original_name, content_type, byte_size, checksum, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'UPLOADED', ?)
    `).run(userId, filename, sanitizeOriginalName(originalName), contentType, buffer.length, checksum, nowIso);
    return toDto(db.prepare('SELECT * FROM sources WHERE id = ?').get(result.lastInsertRowid));
  } catch (err) {
    // The DB is the source of truth for "does this source exist" -- if the
    // INSERT fails (e.g. a genuine UNIQUE race on checksum from a
    // concurrent identical upload), the orphaned file must not linger.
    try { unlinkSync(destPath); } catch { /* best-effort cleanup */ }
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      const raced = findOwnedSourceByChecksum(db, userId, checksum);
      if (raced) return toDto(raced);
    }
    throw err;
  }
}

export function list(db, userId) {
  return db.prepare('SELECT * FROM sources WHERE user_id = ? ORDER BY id DESC').all(userId).map(toDto);
}

/**
 * The original PDF of one of the user's own sources, so the student can go back to the material. Read-only. The bytes are
 * returned only while they still match the size/checksum recorded at upload (same identity rule as extraction): a missing or
 * altered file is refused, never served.
 */
export function readVerifiedFile(db, userId, id, sourcesDir) {
  const row = db.prepare('SELECT * FROM sources WHERE user_id = ? AND id = ?').get(userId, id);
  if (!row) throw new SourceError('NOT_FOUND', dm('SOURCE_NOT_FOUND'));
  if (basename(row.filename) !== row.filename) throw new SourceError('SOURCE_FILE_MISSING', dm('SOURCE_FILE_MISSING'));
  let bytes;
  try {
    bytes = readFileSync(join(sourcesDir, row.filename));
  } catch {
    throw new SourceError('SOURCE_FILE_MISSING', dm('SOURCE_FILE_MISSING'));
  }
  if (bytes.length !== row.byte_size || sha256Hex(bytes) !== row.checksum) {
    throw new SourceError('SOURCE_INTEGRITY_FAILED', dm('SOURCE_INTEGRITY_FAILED'));
  }
  return { bytes, originalName: row.original_name };
}

export function getById(db, userId, id) {
  const row = db.prepare('SELECT * FROM sources WHERE user_id = ? AND id = ?').get(userId, id);
  if (!row) throw new SourceError('NOT_FOUND', dm('SOURCE_NOT_FOUND'));
  return toDto(row);
}
