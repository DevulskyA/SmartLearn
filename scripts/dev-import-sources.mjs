// Deterministic import of a SOURCE subgraph (source file + pages + outline + proposals + drafts) from one SmartLearn database
// into another, remapping every autoincrement id and re-pointing every foreign key. Used to bring work done in one datastore
// (e.g. the Costanzo PDF and its draft) into the persistent DEV datastore without losing either side.
//
// Invariants: the source database is opened read-only and never written; the destination changes in ONE transaction (all or
// nothing, foreign_key_check inside it); the PDF bytes are verified against the stored checksum before the commit; a source
// already present for the destination user (same checksum) is skipped, so a second run changes nothing; draft_json is copied
// verbatim (it holds no ids). Learning data (subjects, units, exercises, reviews...) is NOT touched by design.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

function rows(db, sql, ...params) { return db.prepare(sql).all(...params); }

/**
 * @param {object} o
 * @param {import('better-sqlite3').Database} o.srcDb read-only handle
 * @param {import('better-sqlite3').Database} o.dstDb writable handle (foreign_keys ON, already migrated to the same schema)
 * @param {number} o.srcUserId  user whose sources are imported
 * @param {string} o.dstUserEmail destination owner (must exist in dstDb)
 * @param {string} o.srcSourcesDir  where the source database keeps its PDFs
 * @param {string} o.dstSourcesDir  where the destination keeps its PDFs
 * @param {(s:object)=>boolean} [o.sourceFilter]
 */
export function importSources({ srcDb, dstDb, srcUserId, dstUserEmail, srcSourcesDir, dstSourcesDir, sourceFilter = () => true }) {
  const dstUser = dstDb.prepare('SELECT id FROM users WHERE email = ?').get(String(dstUserEmail).toLowerCase());
  if (!dstUser) throw new Error(`destination user ${dstUserEmail} does not exist`);
  const report = { imported: [], skipped: [] };
  const sources = rows(srcDb, 'SELECT * FROM sources WHERE user_id = ? ORDER BY id', srcUserId).filter(sourceFilter);

  for (const s of sources) {
    if (dstDb.prepare('SELECT id FROM sources WHERE user_id = ? AND checksum = ?').get(dstUser.id, s.checksum)) {
      report.skipped.push({ srcSourceId: s.id, original_name: s.original_name, reason: 'already present (same checksum)' });
      continue;
    }
    const srcFile = join(srcSourcesDir, s.filename);
    if (!existsSync(srcFile)) throw new Error(`source file missing on disk: ${srcFile}`);
    if (sha256(readFileSync(srcFile)) !== s.checksum) throw new Error(`source file does not match its stored checksum: ${srcFile}`);
    if (dstDb.prepare('SELECT 1 FROM sources WHERE filename = ?').get(s.filename)) throw new Error(`on-disk filename already used in destination: ${s.filename}`);
    const dstFile = join(dstSourcesDir, s.filename);
    if (existsSync(dstFile)) throw new Error(`destination file already exists, refusing to overwrite: ${dstFile}`);

    const counts = { pages: 0, outline: 0, proposals: 0, drafts: 0 };
    const run = dstDb.transaction(() => {
      const newSourceId = dstDb.prepare(`INSERT INTO sources (user_id, filename, original_name, content_type, byte_size, checksum, status, created_at,
        extraction_status, parser_version, page_count, extracted_at, extraction_generation) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(dstUser.id, s.filename, s.original_name, s.content_type, s.byte_size, s.checksum, s.status, s.created_at,
          s.extraction_status, s.parser_version, s.page_count, s.extracted_at, s.extraction_generation).lastInsertRowid;

      const insPage = dstDb.prepare('INSERT INTO source_pages (user_id, source_id, page_index, text, created_at, page_status) VALUES (?,?,?,?,?,?)');
      for (const p of rows(srcDb, 'SELECT * FROM source_pages WHERE user_id = ? AND source_id = ? ORDER BY page_index', srcUserId, s.id)) {
        insPage.run(dstUser.id, newSourceId, p.page_index, p.text, p.created_at, p.page_status); counts.pages += 1;
      }
      const insOutline = dstDb.prepare('INSERT INTO source_outline (user_id, source_id, ordinal, level, title, page_index, detected) VALUES (?,?,?,?,?,?,?)');
      for (const o of rows(srcDb, 'SELECT * FROM source_outline WHERE user_id = ? AND source_id = ? ORDER BY ordinal', srcUserId, s.id)) {
        insOutline.run(dstUser.id, newSourceId, o.ordinal, o.level, o.title, o.page_index, o.detected); counts.outline += 1;
      }
      const proposalMap = new Map();
      const insProposal = dstDb.prepare(`INSERT INTO content_proposals (user_id, source_id, chunk_index, page_start, page_end, title, created_at, updated_at, spans_json, kind, topic)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
      for (const p of rows(srcDb, 'SELECT * FROM content_proposals WHERE user_id = ? AND source_id = ? ORDER BY id', srcUserId, s.id)) {
        proposalMap.set(p.id, insProposal.run(dstUser.id, newSourceId, p.chunk_index, p.page_start, p.page_end, p.title, p.created_at, p.updated_at, p.spans_json, p.kind, p.topic).lastInsertRowid);
        counts.proposals += 1;
      }
      const insDraft = dstDb.prepare(`INSERT INTO generated_drafts (user_id, proposal_id, provider, model_version, prompt_version, status, draft_json, created_at,
        accepted_at, accepted_unit_id, acceptance_result_json, revision, updated_at, source_extraction_generation, input_sha256) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      for (const d of rows(srcDb, `SELECT * FROM generated_drafts WHERE user_id = ? AND proposal_id IN (SELECT id FROM content_proposals WHERE user_id = ? AND source_id = ?) ORDER BY id`, srcUserId, srcUserId, s.id)) {
        if (d.status === 'ACCEPTED') throw new Error(`draft ${d.id} is ACCEPTED: its lesson lives in learning tables this import does not copy`);
        insDraft.run(dstUser.id, proposalMap.get(d.proposal_id), d.provider, d.model_version, d.prompt_version, d.status, d.draft_json, d.created_at,
          d.accepted_at, null, d.acceptance_result_json, d.revision, d.updated_at, d.source_extraction_generation, d.input_sha256); counts.drafts += 1;
      }
      const violations = dstDb.pragma('foreign_key_check');
      if (violations.length) throw new Error(`foreign_key_check failed: ${JSON.stringify(violations.slice(0, 3))}`);
      mkdirSync(dstSourcesDir, { recursive: true });
      copyFileSync(srcFile, dstFile, constants.COPYFILE_EXCL);
      if (sha256(readFileSync(dstFile)) !== s.checksum) throw new Error('copied file does not match checksum');
      return newSourceId;
    });
    let newId;
    try { newId = run(); } catch (err) { rmSync(dstFile, { force: true }); throw err; }
    report.imported.push({ srcSourceId: s.id, dstSourceId: Number(newId), original_name: s.original_name, ...counts });
  }
  return report;
}
