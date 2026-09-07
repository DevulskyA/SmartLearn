import { Worker } from 'node:worker_threads';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKER_PATH = fileURLToPath(new URL('../pdf/extract-worker.js', import.meta.url));

export class SourceExtractionError extends Error {
  constructor(code, message, field) {
    super(message);
    this.code = code;
    if (field) this.field = field;
  }
}

function findOwnedSource(db, userId, sourceId) {
  return db.prepare('SELECT * FROM sources WHERE user_id = ? AND id = ?').get(userId, sourceId);
}

/**
 * Runs one bounded extraction pass in a dedicated worker thread. Resolves
 * with a plain result object in EVERY case (timeout, worker crash, thrown
 * parse error) -- callers never need to catch a rejection to learn the
 * outcome, so a slow/hostile PDF can never propagate an unhandled
 * rejection into the caller's request lifecycle.
 */
function runWorker(filePath, { deadlineMs, memoryLimitMb }) {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const worker = new Worker(WORKER_PATH, {
      workerData: { filePath },
      resourceLimits: { maxOldGenerationSizeMb: memoryLimitMb },
    });

    const timer = setTimeout(() => {
      worker.terminate().catch(() => { /* already exiting */ });
      settle({ status: 'TIMEOUT' });
    }, deadlineMs);

    worker.once('message', (message) => settle(message));
    worker.once('error', (err) => settle({ status: 'EXTRACTION_FAILED', errorMessage: String((err && err.message) || err) }));
    worker.once('exit', (code) => {
      if (code !== 0) settle({ status: 'EXTRACTION_FAILED', errorMessage: `worker exited with code ${code}` });
    });
  });
}

/**
 * Extracts one owned source's text, one page at a time, with exact page
 * provenance. The original uploaded file is never opened for writing and
 * never modified or deleted by any path here -- a failed/timed-out/
 * encrypted extraction only ever updates `sources.extraction_status` and
 * leaves the source file exactly as T34 wrote it. A prior successful
 * extraction's pages are atomically replaced (never left half-updated) on
 * re-extraction, since this is a derived, recomputable projection, not the
 * historical record.
 */
export async function extractSource(db, userId, sourceId, { sourcesDir, deadlineMs = 30_000, memoryLimitMb = 256 }, now = () => new Date()) {
  const source = findOwnedSource(db, userId, sourceId);
  if (!source) throw new SourceExtractionError('NOT_FOUND', 'Fonte não encontrada.');

  const filePath = join(sourcesDir, source.filename);
  const result = await runWorker(filePath, { deadlineMs, memoryLimitMb });
  const nowIso = now().toISOString();

  if (result.status === 'EXTRACTED') {
    db.transaction(() => {
      db.prepare('DELETE FROM source_pages WHERE user_id = ? AND source_id = ?').run(userId, sourceId);
      const insertPage = db.prepare('INSERT INTO source_pages (user_id, source_id, page_index, text, created_at) VALUES (?, ?, ?, ?, ?)');
      for (const page of result.pages) insertPage.run(userId, sourceId, page.index, page.text, nowIso);
      db.prepare(`
        UPDATE sources SET extraction_status = ?, parser_version = ?, page_count = ?, extracted_at = ?
        WHERE user_id = ? AND id = ?
      `).run('EXTRACTED', result.parserVersion, result.pageCount, nowIso, userId, sourceId);
    })();
  } else {
    db.prepare('UPDATE sources SET extraction_status = ?, extracted_at = ? WHERE user_id = ? AND id = ?')
      .run(result.status, nowIso, userId, sourceId);
  }

  return { sourceId, status: result.status, pageCount: result.pageCount ?? null, errorMessage: result.errorMessage ?? null };
}

export function listPages(db, userId, sourceId) {
  if (!findOwnedSource(db, userId, sourceId)) throw new SourceExtractionError('NOT_FOUND', 'Fonte não encontrada.');
  return db.prepare('SELECT page_index, text FROM source_pages WHERE user_id = ? AND source_id = ? ORDER BY page_index')
    .all(userId, sourceId)
    .map((row) => ({ pageIndex: row.page_index, text: row.text }));
}
