// Images placed inside a Resumo Mestre (summary_figures, migration 037). Owner-only. The bytes are checked by their magic number, never by the
// name or the declared type the client sent, and only raster formats are accepted: an SVG is a document that can carry script.
import { createHash } from 'node:crypto';

export class SummaryFigureError extends Error {
  constructor(code, message, field) {
    super(message);
    this.code = code;
    if (field) this.field = field;
  }
}

export const MAX_FIGURE_BYTES = 3 * 1024 * 1024;
export const MAX_FIGURES_PER_USER = 500;
export const MAX_ALT_LENGTH = 300;

function sniffMime(b) {
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  if (b.length >= 6 && /^GIF8[79]a$/.test(b.toString('latin1', 0, 6))) return 'image/gif';
  return null;
}

function cleanAlt(raw) {
  let out = '';
  for (const ch of String(raw ?? '')) if (!/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(ch)) out += ch;
  return out.trim();
}

const toDto = (row) => ({ id: row.id, mime: row.mime, byteSize: row.byte_size, alt: row.alt, createdAt: row.created_at });

export function create(db, userId, { buffer, alt, now = () => new Date() }) {
  const cleaned = cleanAlt(alt);
  if (cleaned.length < 1 || cleaned.length > MAX_ALT_LENGTH) {
    throw new SummaryFigureError('VALIDATION_FAILED', `O texto alternativo é obrigatório (até ${MAX_ALT_LENGTH} caracteres).`, 'alt');
  }
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new SummaryFigureError('VALIDATION_FAILED', 'Nenhuma imagem enviada.', 'file');
  if (buffer.length > MAX_FIGURE_BYTES) throw new SummaryFigureError('FILE_TOO_LARGE', 'A imagem é grande demais.', 'file');
  const mime = sniffMime(buffer);
  if (!mime) throw new SummaryFigureError('UNSUPPORTED_FILE_TYPE', 'Use uma imagem PNG, JPEG, WebP ou GIF.', 'file');

  const sha256 = createHash('sha256').update(buffer).digest('hex');
  const existing = db.prepare('SELECT * FROM summary_figures WHERE user_id = ? AND sha256 = ?').get(userId, sha256);
  if (existing) return toDto(existing);
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM summary_figures WHERE user_id = ?').get(userId);
  if (n >= MAX_FIGURES_PER_USER) throw new SummaryFigureError('QUOTA_EXCEEDED', 'Limite de figuras atingido.');

  const createdAt = now().toISOString();
  const info = db.prepare('INSERT INTO summary_figures (user_id, mime, byte_size, sha256, alt, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(userId, mime, buffer.length, sha256, cleaned, buffer, createdAt);
  return toDto(db.prepare('SELECT * FROM summary_figures WHERE id = ?').get(info.lastInsertRowid));
}

/** The figure's bytes for its owner; any other user (or a missing id) gets NOT_FOUND, never a hint that the id exists. */
export function read(db, userId, id) {
  const row = db.prepare('SELECT mime, data FROM summary_figures WHERE user_id = ? AND id = ?').get(userId, id);
  if (!row) throw new SummaryFigureError('NOT_FOUND', 'Figura não encontrada.');
  return { mime: row.mime, bytes: row.data };
}
