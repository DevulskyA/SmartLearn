// Invisible OCR fallback (LEITURA-1): pdf.js text layer first; only pages that fail an automatic quality check
// are re-read by xberg (MIT, Tesseract inside). The student never sees this step; a page that stays unreadable
// is reported as such by the caller. Runs inside the extraction worker thread.

// A page whose text layer is empty, mostly broken glyphs/symbols, or implausibly short is not trusted.
export function pageTextLooksBad(text) {
  const t = String(text ?? '').trim();
  if (t.length < 20) return true;
  const letters = (t.match(/\p{L}/gu) ?? []).length;
  const broken = (t.match(/�/g) ?? []).length;
  if (broken / t.length > 0.02) return true;
  return letters / t.length < 0.4;
}

// Returns Map(pageIndex -> text) for the 1-indexed pages that OCR managed to read. Never throws.
export async function ocrPages(bytes, pageIndexes, { languages = ['por', 'eng'] } = {}) {
  const out = new Map();
  if (!pageIndexes.length) return out;
  try {
    const { extract, ExtractInputKind } = await import('@xberg-io/xberg');
    const result = await extract(
      { kind: ExtractInputKind.Bytes, bytes, mimeType: 'application/pdf' },
      { forceOcrPages: pageIndexes, ocr: { backend: 'tesseract', language: languages }, pages: { extractPages: true } },
    );
    const pages = result?.results?.[0]?.pages ?? [];
    for (const p of pages) {
      const idx = p.pageNumber ?? p.page ?? p.index;
      const text = String(p.content ?? p.text ?? '').trim();
      if (pageIndexes.includes(idx) && text) out.set(idx, text);
    }
  } catch { /* OCR unavailable: the page simply stays as pdf.js read it */ }
  return out;
}
