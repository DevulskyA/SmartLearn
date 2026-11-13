// CATALOG service: records which edition of which work a student's file is. Best-effort and additive: it only INSERTS into the catalog tables
// (migration 044) and never changes a source, a summary or a question. A failure here never blocks an upload or an extraction (see recordSourceEdition's callers).
//
// Merging rules (a coinciding title or page count is never enough):
//   * an ISBN-13 that already names an edition -> that edition (HIGH);
//   * else the SAME work with the SAME edition number AND the SAME year, both known -> that edition (MEDIUM);
//   * anything else -> a new edition row, under the work with the same title key (the work is only a grouping of editions).
import { identifyFile } from '../catalog/identify.js';

const FIRST_PAGES = 4;

function firstPagesText(db, userId, sourceId) {
  return db.prepare('SELECT text FROM source_pages WHERE user_id = ? AND source_id = ? AND page_index <= ? ORDER BY page_index')
    .all(userId, sourceId, FIRST_PAGES).map((r) => r.text ?? '').join('\n');
}

function findOrCreateWork(db, titleKey, title, now) {
  const found = db.prepare('SELECT id FROM catalog_works WHERE title_key = ? ORDER BY id LIMIT 1').get(titleKey);
  if (found) return found.id;
  return db.prepare('INSERT INTO catalog_works (title_key, title, created_at) VALUES (?, ?, ?)').run(titleKey, title, now).lastInsertRowid;
}

/**
 * Identify the file (name + first pages) and link it to an edition. Idempotent: a second call for the same source returns the link as it is.
 * @returns {{ editionId:number, workId:number, confidence:string, methods:string[], created:boolean }|null}  null = nothing usable to catalog.
 */
export function recordSourceEdition(db, userId, sourceId, { now = () => new Date() } = {}) {
  const existing = db.prepare('SELECT edition_id, confidence, methods FROM source_editions WHERE user_id = ? AND source_id = ?').get(userId, sourceId);
  if (existing) {
    const edition = db.prepare('SELECT work_id FROM catalog_editions WHERE id = ?').get(existing.edition_id);
    return { editionId: existing.edition_id, workId: edition.work_id, confidence: existing.confidence, methods: existing.methods.split(','), created: false };
  }
  const source = db.prepare('SELECT original_name FROM sources WHERE user_id = ? AND id = ?').get(userId, sourceId);
  if (!source) return null;
  const id = identifyFile({ fileName: source.original_name, firstPagesText: firstPagesText(db, userId, sourceId) });
  if (!id.titleKey) return null;
  const stamp = now().toISOString();

  const run = db.transaction(() => {
    const isbn = id.isbns[0] ?? null;
    let edition = isbn ? db.prepare('SELECT id, work_id FROM catalog_editions WHERE isbn13 = ?').get(isbn) : null;
    let confidence = edition ? 'HIGH' : id.confidence;
    const methods = [...id.methods];
    if (!edition) {
      const workId = findOrCreateWork(db, id.titleKey, source.original_name.replace(/\.[^.]+$/, ''), stamp);
      if (id.editionNumber !== null && id.year !== null) {
        edition = db.prepare('SELECT id, work_id FROM catalog_editions WHERE work_id = ? AND edition_number = ? AND year = ? AND isbn13 IS NULL ORDER BY id LIMIT 1').get(workId, id.editionNumber, id.year) ?? null;
        if (edition) { confidence = 'MEDIUM'; methods.push('SAME_WORK_EDITION_YEAR'); }
      }
      if (!edition) {
        const inserted = db.prepare('INSERT INTO catalog_editions (work_id, edition_number, year, isbn13, kind, created_at) VALUES (?, ?, ?, ?, ?, ?)')
          .run(workId, id.editionNumber, id.year, isbn, id.kind, stamp);
        edition = { id: inserted.lastInsertRowid, work_id: workId };
      }
    }
    db.prepare('INSERT INTO source_editions (user_id, source_id, edition_id, confidence, methods, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(userId, sourceId, edition.id, confidence, methods.join(',') || 'FILE_NAME', stamp);
    return { editionId: Number(edition.id), workId: Number(edition.work_id), confidence, methods, created: true };
  });
  return run();
}

/** Editions of the same work, newest first, for one student's file: the starting point of "which edition can answer this". */
export function sameWorkEditions(db, editionId) {
  return db.prepare(`
    SELECT e.id, e.edition_number AS editionNumber, e.year, e.isbn13, e.kind
      FROM catalog_editions e WHERE e.work_id = (SELECT work_id FROM catalog_editions WHERE id = ?)
     ORDER BY COALESCE(e.year, 0) DESC, e.id DESC
  `).all(editionId);
}

/** A verified correspondence between two editions, or null. Only verified rows are ever returned: an unverified map is not evidence. */
export function verifiedMap(db, fromEditionId, toEditionId) {
  const rows = db.prepare(`
    SELECT from_title_key AS fromTitleKey, to_title_key AS toTitleKey, from_page_start, from_page_end, to_page_start, to_page_end, relation
      FROM catalog_edition_maps WHERE from_edition_id = ? AND to_edition_id = ? AND verified = 1
  `).all(fromEditionId, toEditionId);
  if (rows.length === 0) return null;
  return {
    verified: true,
    entries: rows.map((r) => ({ fromTitleKey: r.fromTitleKey, toTitleKey: r.toTitleKey, fromPages: [r.from_page_start, r.from_page_end], toPages: [r.to_page_start, r.to_page_end], relation: r.relation })),
  };
}
