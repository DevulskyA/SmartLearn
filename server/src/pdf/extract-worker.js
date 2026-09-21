// T35: runs inside a bounded worker_thread (spawned by
// source-extraction.js), never on the main server thread. Only ever reads
// the one file it was told to read and posts a plain result message back --
// no network access is attempted (cMap/standardFont URLs are left
// undefined, so pdf.js never tries to fetch them), and `isEvalSupported:
// false` disables pdf.js's optional eval-based font-program optimization,
// so no code from inside the PDF is ever evaluated as JavaScript. Text
// extraction alone (getTextContent) never triggers PDF-embedded
// JavaScript actions in the first place -- that only happens through the
// separate scripting/annotation-forms manager this code never touches.
import { parentPort, workerData } from 'node:worker_threads';
import { readFileSync } from 'node:fs';
import { classifyExtractionError, rollUpExtractionStatus } from './classify-extraction-error.js';
import { pageTextFromItems } from './page-text.js';
import { readOutline } from './outline.js';

async function run() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  // The caller passes the bytes it already verified against the source checksum; the path is only a fallback.
  const data = workerData.data ? new Uint8Array(workerData.data) : new Uint8Array(readFileSync(workerData.filePath));

  let doc;
  try {
    doc = await pdfjs.getDocument({
      data,
      useSystemFonts: true,
      disableFontFace: true,
      isEvalSupported: false,
      cMapUrl: undefined,
      standardFontDataUrl: undefined,
    }).promise;
  } catch (err) {
    parentPort.postMessage({ status: classifyExtractionError(err), errorMessage: String((err && err.message) || err) });
    return;
  }

  // C5 (audit): each page gets its OWN error boundary -- one malformed or
  // resource-heavy page (a real, not-uncommon PDF defect) must never abort
  // extraction of an otherwise-good document. A per-page failure becomes an
  // explicit FAILED page_status, not a document-wide EXTRACTION_FAILED.
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    try {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const text = pageTextFromItems(content.items);
      pages.push({ index: i, text, status: text.trim().length > 0 ? 'OK' : 'EMPTY' });
    } catch (err) {
      pages.push({ index: i, text: '', status: 'FAILED', errorMessage: String((err && err.message) || err) });
    }
  }

  parentPort.postMessage({ status: rollUpExtractionStatus(pages), pages, pageCount: doc.numPages, parserVersion: pdfjs.version, outline: await readOutline(doc) });
}

run().catch((err) => {
  parentPort.postMessage({ status: 'EXTRACTION_FAILED', errorMessage: String((err && err.message) || err) });
});
