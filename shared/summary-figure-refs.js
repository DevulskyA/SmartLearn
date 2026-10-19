// A figure inside a Resumo Mestre is a block of its own: a line holding only `[[fig:UUID]]`. The UUID is the stable id of a PRIVATE visual
// asset (never a path, URL or Base64); caption, alternative text and provenance live in the asset's record, not in the text.
// Dependency-free so the server (validation on save/accept, backup, audit) and the client share the exact same rule.

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
export const FIGURE_REF_LINE = new RegExp(`^\\[\\[fig:(${UUID})\\]\\]$`, 'i');
export const UUID_PATTERN = new RegExp(`^${UUID}$`, 'i');

export const figureRef = (id) => `[[fig:${id}]]`;

/** The figure ids a summary text points at, in order of appearance, without repeats. Lines inside fenced code do not count. */
export function listFigureRefs(text) {
  const ids = [];
  let fence = null;
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    const marker = /^(```+|~~~+)/.exec(line);
    if (marker) {
      if (fence === null) fence = marker[1][0];
      else if (marker[1][0] === fence) fence = null;
      continue;
    }
    if (fence !== null) continue;
    const m = FIGURE_REF_LINE.exec(line);
    if (m && !ids.includes(m[1].toLowerCase())) ids.push(m[1].toLowerCase());
  }
  return ids;
}

/** The text the deterministic audit reads: figure lines dropped, math delimiters turned into spaces (the formula content stays). */
export function stripSummaryMarkup(text) {
  return replaceFigureRefs(text, () => '').replace(/\\[()[\]]/g, ' ');
}

/**
 * The text with every figure line replaced by a plain-words note, for exports that cannot carry the image files.
 * `describe(id)` returns the note (e.g. the figure's caption/alt) or null when the figure is unknown.
 */
export function replaceFigureRefs(text, describe) {
  let fence = null;
  return String(text ?? '').split('\n').map((raw) => {
    const line = raw.trim();
    const marker = /^(```+|~~~+)/.exec(line);
    if (marker) {
      if (fence === null) fence = marker[1][0];
      else if (marker[1][0] === fence) fence = null;
      return raw;
    }
    if (fence !== null) return raw;
    const m = FIGURE_REF_LINE.exec(line.replace(/\r$/, ''));
    return m ? describe(m[1].toLowerCase()) : raw;
  }).join('\n');
}
