// Builds a minimal one-page PDF whose text lines are placed at explicit coordinates and painted in the exact order given,
// so a test can reproduce producers that paint one column of a two-column page before the other. Separate from
// build-fixture-pdf.js on purpose: that fixture is shared and its output must not change.

/**
 * @param {{x:number,y:number,text:string}[]} lines in PAINT order (content-stream order)
 * @param {{width?:number,height?:number}} [page] page size in points (default US Letter-ish 612 x 783)
 * @returns {Buffer}
 */
export function buildPositionedPdf(lines, { width = 612, height = 783 } = {}) {
  const esc = (s) => s.replace(/[\()]/g, '\$&');
  const stream = `BT /F1 10 Tf ${lines.map((l) => `1 0 0 1 ${l.x} ${l.y} Tm (${esc(l.text)}) Tj`).join(' ')} ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [4 0 R] /Count 1 >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>`,
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let body = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((obj, i) => { offsets.push(Buffer.byteLength(body, 'latin1')); body += `${i + 1} 0 obj\n${obj}\nendobj\n`; });
  const xrefOffset = Buffer.byteLength(body, 'latin1');
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) xref += `${String(offset).padStart(10, '0')} 00000 n \n`;
  return Buffer.from(`${body}${xref}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`, 'latin1');
}
