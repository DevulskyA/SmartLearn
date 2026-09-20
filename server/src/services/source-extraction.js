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
 *
 * C4 (audit): this function `await`s a real worker call, so two concurrent
 * invocations for the SAME source can genuinely interleave (unlike every
 * synchronous service in this codebase). `extraction_generation` is bumped
 * synchronously the instant an attempt starts, fixing this attempt's
 * identity before the (possibly slow) worker ever runs. When the worker
 * resolves, the result is only PERSISTED if this attempt's generation is
 * still the current one -- a slower, since-superseded attempt's result is
 * still returned to ITS OWN caller (`applied: false`), so nobody is lied
 * to about what actually happened, but it can never overwrite a newer
 * attempt's already-written outcome.
 */
export async function extractSource(db, userId, sourceId, { sourcesDir, deadlineMs = 30_000, memoryLimitMb = 256 }, now = () => new Date()) {
  const source = findOwnedSource(db, userId, sourceId);
  if (!source) throw new SourceExtractionError('NOT_FOUND', 'Fonte não encontrada.');

  const myGeneration = db.transaction(() => {
    db.prepare('UPDATE sources SET extraction_generation = extraction_generation + 1 WHERE user_id = ? AND id = ?').run(userId, sourceId);
    return db.prepare('SELECT extraction_generation FROM sources WHERE user_id = ? AND id = ?').get(userId, sourceId).extraction_generation;
  })();

  const filePath = join(sourcesDir, source.filename);
  const result = await runWorker(filePath, { deadlineMs, memoryLimitMb });
  const nowIso = now().toISOString();

  const applied = db.transaction(() => {
    const current = db.prepare('SELECT extraction_generation FROM sources WHERE user_id = ? AND id = ?').get(userId, sourceId);
    if (!current || current.extraction_generation !== myGeneration) return false;

    if (result.status === 'EXTRACTED') {
      db.prepare('DELETE FROM source_pages WHERE user_id = ? AND source_id = ?').run(userId, sourceId);
      const insertPage = db.prepare('INSERT INTO source_pages (user_id, source_id, page_index, text, created_at, page_status) VALUES (?, ?, ?, ?, ?, ?)');
      for (const page of result.pages) insertPage.run(userId, sourceId, page.index, page.text, nowIso, page.status ?? 'OK');
      db.prepare(`
        UPDATE sources SET extraction_status = ?, parser_version = ?, page_count = ?, extracted_at = ?
        WHERE user_id = ? AND id = ?
      `).run('EXTRACTED', result.parserVersion, result.pageCount, nowIso, userId, sourceId);
    } else {
      db.prepare('UPDATE sources SET extraction_status = ?, extracted_at = ? WHERE user_id = ? AND id = ?')
        .run(result.status, nowIso, userId, sourceId);
    }
    return true;
  })();

  // C5 (audit): "existe algum texto" is not "extração válida" -- surface
  // the per-page breakdown alongside the document-level status so a
  // caller can decide whether a document with a few empty/failed pages
  // alongside mostly-good ones is safe to use as-is.
  const okCount = (result.pages ?? []).filter((p) => p.status === 'OK').length;
  const emptyCount = (result.pages ?? []).filter((p) => p.status === 'EMPTY').length;
  const failedCount = (result.pages ?? []).filter((p) => p.status === 'FAILED').length;
  // Which pages were left out (same page numbers the citations use), so the student can see what the material does NOT cover.
  const pagesWith = (status) => (result.pages ?? []).filter((p) => p.status === status).map((p) => p.index).sort((x, y) => x - y);

  return {
    sourceId, status: result.status, pageCount: result.pageCount ?? null, errorMessage: result.errorMessage ?? null, applied,
    okPageCount: okCount, emptyPageCount: emptyCount, failedPageCount: failedCount,
    emptyPages: pagesWith('EMPTY'), failedPages: pagesWith('FAILED'),
  };
}

export function listPages(db, userId, sourceId) {
  if (!findOwnedSource(db, userId, sourceId)) throw new SourceExtractionError('NOT_FOUND', 'Fonte não encontrada.');
  return db.prepare('SELECT page_index, text, page_status FROM source_pages WHERE user_id = ? AND source_id = ? ORDER BY page_index')
    .all(userId, sourceId)
    .map((row) => ({ pageIndex: row.page_index, text: row.text, pageStatus: row.page_status }));
}
