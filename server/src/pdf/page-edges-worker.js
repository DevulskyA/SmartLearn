// Runs inside a bounded worker_thread (see services/page-numbering.js), like extract-worker.js: reads ONLY the first and last
// lines of every page of the bytes it was given and posts them back. The page text kept in the database no longer has the
// running headers/footers (they are page furniture), so the printed page numbers are read from the PDF itself.
import { parentPort, workerData } from 'node:worker_threads';
import { pageTextFromItems } from './page-text.js';
import { edgesOfText } from './printed-page-numbers.js';

async function run() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(workerData.data),
    useSystemFonts: true,
    disableFontFace: true,
    isEvalSupported: false,
    cMapUrl: undefined,
    standardFontDataUrl: undefined,
  }).promise;
  const edges = [];
  for (let i = 1; i <= doc.numPages; i++) {
    try {
      const page = await doc.getPage(i);
      const { items } = await page.getTextContent();
      edges.push(edgesOfText(pageTextFromItems(items)));
    } catch {
      edges.push({ first: [], last: [] }); // one bad page never stops the others
    }
  }
  parentPort.postMessage({ status: 'OK', edges });
}

run().catch((err) => parentPort.postMessage({ status: 'FAILED', errorMessage: String((err && err.message) || err) }));
