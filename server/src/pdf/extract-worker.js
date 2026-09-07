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
import { classifyExtractionError } from './classify-extraction-error.js';

async function run() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(readFileSync(workerData.filePath));

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

  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push({ index: i, text: content.items.map((item) => item.str).join('') });
  }

  const hasAnyText = pages.some((p) => p.text.trim().length > 0);
  parentPort.postMessage({
    status: hasAnyText ? 'EXTRACTED' : 'IMAGE_ONLY_OR_UNREADABLE',
    pages,
    pageCount: doc.numPages,
    parserVersion: pdfjs.version,
  });
}

run().catch((err) => {
  parentPort.postMessage({ status: 'EXTRACTION_FAILED', errorMessage: String((err && err.message) || err) });
});
