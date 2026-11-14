import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { readVerifiedFile } from './source-storage.js';
import { detectPrintedNumbering } from '../pdf/printed-page-numbers.js';

const WORKER_PATH = fileURLToPath(new URL('../pdf/page-edges-worker.js', import.meta.url));
const PDF_NUMBERING = Object.freeze({ mode: 'pdf' });

// Reading the edges means opening the whole PDF once (a few seconds for a 500-page book). The answer only depends on the
// file's bytes, so it is remembered by checksum for as long as the server runs; a restart simply recomputes it.
const cache = new Map();

function readEdges(bytes, { deadlineMs, memoryLimitMb }) {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (result) => { if (!settled) { settled = true; clearTimeout(timer); resolve(result); } };
    const worker = new Worker(WORKER_PATH, { workerData: { data: bytes }, resourceLimits: { maxOldGenerationSizeMb: memoryLimitMb } });
    const timer = setTimeout(() => { worker.terminate().catch(() => {}); settle(null); }, deadlineMs);
    worker.once('message', (message) => settle(message.status === 'OK' ? message.edges : null));
    worker.once('error', () => settle(null));
    worker.once('exit', (code) => { if (code !== 0) settle(null); });
  });
}

/**
 * How the student's page numbers map to the PDF for this source: `printed` (the numbers printed in the book, PDF page =
 * number + offset) when the document's headers/footers agree on one offset, else `pdf` (the PDF's own numbering).
 * Never fails: anything unreadable or slow answers `pdf`, which is the numbering the system always had.
 */
export async function getPageNumbering(db, userId, sourceId, { sourcesDir, deadlineMs = 60_000, memoryLimitMb = 512 } = {}) {
  const source = db.prepare('SELECT checksum FROM sources WHERE user_id = ? AND id = ?').get(userId, sourceId);
  if (!source) return PDF_NUMBERING;
  if (cache.has(source.checksum)) return cache.get(source.checksum);
  let numbering = PDF_NUMBERING;
  try {
    const { bytes } = readVerifiedFile(db, userId, sourceId, sourcesDir);
    const edges = await readEdges(bytes, { deadlineMs, memoryLimitMb });
    if (edges) numbering = detectPrintedNumbering(edges);
    else return PDF_NUMBERING; // not cached: a timeout may be a busy moment, not a property of the file
  } catch {
    return PDF_NUMBERING;
  }
  cache.set(source.checksum, numbering);
  return numbering;
}
