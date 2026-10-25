// Private visual assets of the Resumo Mestre (migration 038): images the student provides and rectangles cut from a page of an uploaded PDF.
// Referenced from summary text as [[fig:UUID]]. The owner comes from the session, never from the client. The bytes are decoded and
// RE-ENCODED with sharp (so what is stored is a clean raster image, never the uploaded bytes), kept in a private media directory, and
// written file-first/row-second so no accepted content can point at a file that was never written.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { UUID_PATTERN, listFigureRefs } from '../../../shared/summary-figure-refs.js';

export class VisualAssetError extends Error {
  constructor(code, message, field) {
    super(message);
    this.code = code;
    if (field) this.field = field;
  }
}

export const DEFAULT_LIMITS = Object.freeze({
  maxUploadBytes: 8 * 1024 * 1024, // what a client may send
  maxPixels: 40_000_000, // decoded size guard (decompression bombs)
  maxSide: 4096, // larger images are scaled down to this longest side
  quotaBytes: 500 * 1024 * 1024, // stored bytes per student
});
export const MAX_ALT = 300;
export const MAX_CAPTION = 300;
export const MAX_DESCRIPTION = 2000;

const FORMATS = {
  png: { mime: 'image/png', ext: 'png' },
  jpeg: { mime: 'image/jpeg', ext: 'jpg' },
  webp: { mime: 'image/webp', ext: 'webp' },
};

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

function cleanText(raw, max, { required = false, field }) {
  let out = '';
  for (const ch of String(raw ?? '')) if (!/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(ch) || ch === '\n') out += ch;
  out = out.trim();
  if (required && out === '') throw new VisualAssetError('VALIDATION_FAILED', 'O texto alternativo é obrigatório: descreva o que a imagem mostra.', field);
  if (out.length > max) throw new VisualAssetError('VALIDATION_FAILED', `Texto longo demais (máximo ${max} caracteres).`, field);
  return out;
}

/**
 * Validates the real bytes and returns a clean re-encoded image. PNG stays PNG (lossless) and WebP stays lossless WebP, so small labels
 * in diagrams stay readable; JPEG stays JPEG at high quality. EXIF orientation is applied, all metadata (EXIF, GPS) is dropped.
 */
export async function normalizeImage(buffer, limits = DEFAULT_LIMITS) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new VisualAssetError('VALIDATION_FAILED', 'Nenhuma imagem enviada.', 'file');
  if (buffer.length > limits.maxUploadBytes) throw new VisualAssetError('FILE_TOO_LARGE', 'A imagem é grande demais.', 'file');
  let meta;
  try {
    meta = await sharp(buffer, { limitInputPixels: limits.maxPixels, failOn: 'error' }).metadata();
  } catch {
    throw new VisualAssetError('UNSUPPORTED_FILE_TYPE', 'O arquivo não é uma imagem PNG, JPEG ou WebP válida.', 'file');
  }
  const format = FORMATS[meta.format];
  if (!format) throw new VisualAssetError('UNSUPPORTED_FILE_TYPE', 'Use uma imagem PNG, JPEG ou WebP.', 'file');
  if ((meta.pages ?? 1) > 1) throw new VisualAssetError('UNSUPPORTED_FILE_TYPE', 'Imagens animadas não são aceitas.', 'file');
  if (!meta.width || !meta.height) throw new VisualAssetError('UNSUPPORTED_FILE_TYPE', 'Dimensões da imagem inválidas.', 'file');
  try {
    let pipeline = sharp(buffer, { limitInputPixels: limits.maxPixels, failOn: 'error' }).rotate();
    pipeline = pipeline.resize({ width: limits.maxSide, height: limits.maxSide, fit: 'inside', withoutEnlargement: true });
    if (meta.format === 'png') pipeline = pipeline.png({ compressionLevel: 9 });
    else if (meta.format === 'webp') pipeline = pipeline.webp({ lossless: true });
    else pipeline = pipeline.jpeg({ quality: 92, chromaSubsampling: '4:4:4' });
    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
    return { buffer: data, mime: format.mime, ext: format.ext, width: info.width, height: info.height };
  } catch {
    throw new VisualAssetError('UNSUPPORTED_FILE_TYPE', 'Não foi possível ler a imagem (arquivo corrompido).', 'file');
  }
}

export function toDto(row) {
  return {
    id: row.id,
    kind: row.kind,
    mime: row.mime,
    width: row.width,
    height: row.height,
    byteSize: row.byte_size,
    caption: row.caption,
    alt: row.alt_text,
    description: row.description,
    source: row.kind === 'PDF_CROP'
      ? { sourceId: row.source_id, pageIndex: row.page_index, rect: { x: row.crop_x, y: row.crop_y, w: row.crop_w, h: row.crop_h }, rotation: row.crop_rotation, sourceChecksum: row.source_checksum }
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowOf(db, userId, id) {
  if (typeof id !== 'string' || !UUID_PATTERN.test(id)) return undefined;
  return db.prepare('SELECT * FROM visual_assets WHERE user_id = ? AND id = ?').get(userId, id.toLowerCase());
}

function validateCrop(db, userId, crop) {
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);
  const x = num(crop.x); const y = num(crop.y); const w = num(crop.w); const h = num(crop.h);
  if (!(x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= 1.0001 && y + h <= 1.0001)) {
    throw new VisualAssetError('VALIDATION_FAILED', 'O retângulo do recorte precisa estar dentro da página.', 'rect');
  }
  if (![0, 90, 180, 270].includes(crop.rotation)) throw new VisualAssetError('VALIDATION_FAILED', 'Rotação inválida.', 'rotation');
  if (!Number.isInteger(crop.sourceId)) throw new VisualAssetError('VALIDATION_FAILED', 'Fonte inválida.', 'sourceId');
  const source = db.prepare('SELECT id, checksum, page_count FROM sources WHERE user_id = ? AND id = ?').get(userId, crop.sourceId);
  if (!source) throw new VisualAssetError('NOT_FOUND', 'Fonte não encontrada.', 'sourceId');
  if (!Number.isInteger(crop.pageIndex) || crop.pageIndex < 1 || (source.page_count && crop.pageIndex > source.page_count)) {
    throw new VisualAssetError('VALIDATION_FAILED', 'Página inexistente na fonte.', 'pageIndex');
  }
  return { sourceId: source.id, pageIndex: crop.pageIndex, x, y, w, h, rotation: crop.rotation, checksum: source.checksum };
}

/**
 * Stores one asset for `userId`. Repeating the same `operationKey` returns the asset that key already created (no second file, no second
 * row). Returns { asset, duplicate }.
 */
export async function create(db, userId, input, { mediaDir, limits = DEFAULT_LIMITS, now = () => new Date() } = {}) {
  const operationKey = String(input.operationKey ?? '').trim();
  if (operationKey === '' || operationKey.length > 100) throw new VisualAssetError('VALIDATION_FAILED', 'operationKey é obrigatória.', 'operationKey');
  const existing = db.prepare('SELECT * FROM visual_assets WHERE user_id = ? AND operation_key = ?').get(userId, operationKey);
  if (existing) return { asset: toDto(existing), duplicate: true };

  const kind = input.kind === 'PDF_CROP' ? 'PDF_CROP' : 'STUDENT_IMAGE';
  const alt = cleanText(input.alt, MAX_ALT, { required: true, field: 'alt' });
  const caption = cleanText(input.caption, MAX_CAPTION, { field: 'caption' });
  const description = cleanText(input.description, MAX_DESCRIPTION, { field: 'description' }) || null;
  const crop = kind === 'PDF_CROP' ? validateCrop(db, userId, input.crop ?? {}) : null;

  const image = await normalizeImage(input.buffer, limits);
  const { total } = db.prepare('SELECT COALESCE(SUM(byte_size), 0) AS total FROM visual_assets WHERE user_id = ?').get(userId);
  if (total + image.buffer.length > limits.quotaBytes) throw new VisualAssetError('QUOTA_EXCEEDED', 'Limite de armazenamento de imagens atingido.');

  const id = randomUUID();
  const filename = `${randomBytes(16).toString('hex')}.${image.ext}`; // the on-disk name is never derived from anything the client sent
  mkdirSync(mediaDir, { recursive: true });
  const finalPath = join(mediaDir, filename);
  const tmpPath = `${finalPath}.partial`;
  writeFileSync(tmpPath, image.buffer);
  renameSync(tmpPath, finalPath);
  const stamp = now().toISOString();
  try {
    db.prepare(`INSERT INTO visual_assets (id, user_id, kind, filename, mime, width, height, byte_size, sha256, caption, alt_text, description,
        source_id, page_index, crop_x, crop_y, crop_w, crop_h, crop_rotation, source_checksum, operation_key, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, userId, kind, filename, image.mime, image.width, image.height, image.buffer.length, sha256(image.buffer), caption, alt, description,
      crop?.sourceId ?? null, crop?.pageIndex ?? null, crop?.x ?? null, crop?.y ?? null, crop?.w ?? null, crop?.h ?? null, crop?.rotation ?? null, crop?.checksum ?? null,
      operationKey, stamp, stamp,
    );
  } catch (err) {
    rmSync(finalPath, { force: true }); // the row never existed: do not leave its file behind
    const raced = db.prepare('SELECT * FROM visual_assets WHERE user_id = ? AND operation_key = ?').get(userId, operationKey);
    if (raced) return { asset: toDto(raced), duplicate: true }; // a parallel delivery of the same operation won
    throw err;
  }
  return { asset: toDto(db.prepare('SELECT * FROM visual_assets WHERE id = ?').get(id)), duplicate: false };
}

/** Metadata for the owner; anyone else (or an unknown id) gets NOT_FOUND, never a hint that the id exists. */
export function get(db, userId, id) {
  const row = rowOf(db, userId, id);
  if (!row) throw new VisualAssetError('NOT_FOUND', 'Figura não encontrada.');
  return toDto(row);
}

/** The stored bytes, re-checked against the recorded hash before they are served. */
export function readFile(db, userId, id, mediaDir) {
  const row = rowOf(db, userId, id);
  if (!row) throw new VisualAssetError('NOT_FOUND', 'Figura não encontrada.');
  const path = join(mediaDir, row.filename);
  if (!existsSync(path)) throw new VisualAssetError('ASSET_FILE_MISSING', 'O arquivo da figura não está disponível.');
  const bytes = readFileSync(path);
  if (bytes.length !== row.byte_size || sha256(bytes) !== row.sha256) throw new VisualAssetError('ASSET_INTEGRITY_FAILED', 'O arquivo da figura não confere com o registro.');
  return { mime: row.mime, bytes };
}

/** Edits the texts only (caption, alternative text, detailed description); the image and its provenance are immutable. */
export function updateTexts(db, userId, id, patch, now = () => new Date()) {
  const row = rowOf(db, userId, id);
  if (!row) throw new VisualAssetError('NOT_FOUND', 'Figura não encontrada.');
  const alt = patch.alt !== undefined ? cleanText(patch.alt, MAX_ALT, { required: true, field: 'alt' }) : row.alt_text;
  const caption = patch.caption !== undefined ? cleanText(patch.caption, MAX_CAPTION, { field: 'caption' }) : row.caption;
  const description = patch.description !== undefined ? (cleanText(patch.description, MAX_DESCRIPTION, { field: 'description' }) || null) : row.description;
  db.prepare('UPDATE visual_assets SET alt_text = ?, caption = ?, description = ?, updated_at = ? WHERE user_id = ? AND id = ?')
    .run(alt, caption, description, now().toISOString(), userId, row.id);
  return get(db, userId, row.id);
}

/** Where a figure is still used: accepted lessons and drafts still open. Scanned from the texts themselves, so it cannot drift. */
export function referencesOf(db, userId, id) {
  // both forms: `[[fig:ID]]` and `[[fig:ID|w=420]]` (a width on the marker must never make a figure look unused)
  const needle = `%[[fig:${String(id).toLowerCase()}%`;
  const units = db.prepare('SELECT id FROM learning_units WHERE user_id = ? AND lower(summary_body) LIKE ?').all(userId, needle).map((r) => ({ type: 'unit', id: r.id }));
  const drafts = db.prepare("SELECT id FROM generated_drafts WHERE user_id = ? AND status = 'DRAFT' AND lower(draft_json) LIKE ?").all(userId, needle).map((r) => ({ type: 'draft', id: r.id }));
  return [...units, ...drafts];
}

/** Deletes an asset nothing refers to; a referenced one is refused (ASSET_IN_USE) and left untouched. */
export function remove(db, userId, id, mediaDir) {
  const row = rowOf(db, userId, id);
  if (!row) throw new VisualAssetError('NOT_FOUND', 'Figura não encontrada.');
  const refs = referencesOf(db, userId, row.id);
  if (refs.length > 0) {
    const err = new VisualAssetError('ASSET_IN_USE', 'Esta figura ainda aparece em um resumo. Remova-a do texto antes de excluí-la.');
    err.references = refs;
    throw err;
  }
  db.prepare('DELETE FROM visual_assets WHERE user_id = ? AND id = ?').run(userId, row.id);
  rmSync(join(mediaDir, row.filename), { force: true });
}

/**
 * The figure references of `text` that cannot be saved: unknown, not the student's, or (for a draft) a PDF crop taken from a DIFFERENT
 * source than the one the draft comes from. Empty = every reference resolves. Callers raise their own validation error from it.
 */
export function findUnresolvedRefs(db, userId, text, { sourceId = null } = {}) {
  const problems = [];
  for (const id of listFigureRefs(text)) {
    const row = rowOf(db, userId, id);
    if (!row) problems.push({ id, reason: 'UNKNOWN' });
    else if (sourceId !== null && row.kind === 'PDF_CROP' && row.source_id !== sourceId) problems.push({ id, reason: 'OTHER_SOURCE' });
  }
  return problems;
}

export const refsMessage = (problems) => `O resumo aponta para figura(s) que não podem ser usadas aqui: ${problems.map((p) => `${p.id.slice(0, 8)}… (${p.reason === 'OTHER_SOURCE' ? 'vem de outra fonte' : 'não existe ou não é sua'})`).join(', ')}.`;
