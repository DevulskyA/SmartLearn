// A readable book/material title taken from the uploaded file name. Pure and outside every AI prompt: it only
// shapes the DEFAULT title a proposal gets when the document has no heading to name it. Downloaded books carry
// site tags and format words ("[Medicalstudyzone.com] Costanzo Physiology, 7th edition PDF.pdf"); the student
// should see "Costanzo Physiology, 7th edition".

const OPENERS = new Set(['[', '(', '{']);
const CLOSERS = new Set([']', ')', '}']);

/** Replaces each bracket group that looks like a site tag with a space; other groups stay as written. */
function dropSiteTags(text) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    if (OPENERS.has(text[i])) {
      let j = i + 1;
      while (j < text.length && !CLOSERS.has(text[j])) j += 1;
      if (j < text.length) {
        const group = text.slice(i, j + 1);
        out += looksLikeSiteTag(group) ? ' ' : group;
        i = j + 1;
        continue;
      }
    }
    out += text[i];
    i += 1;
  }
  return out;
}
const SITE_WORDS = ['www', 'http', 'download', 'free'];

function looksLikeSiteTag(group) {
  const lower = group.toLowerCase();
  if (SITE_WORDS.some((word) => lower.includes(word))) return true;
  // a domain: a dot followed by at least two letters ("site.com")
  return lower.split('.').slice(1).some((part) => /^[a-z]{2}/.test(part));
}
const FORMAT_WORDS = ['free download', 'e-book', 'ebook', 'epub', 'pdf'];
const EDGE_CHARS = new Set([' ', '\t', ',', ';', ':', '.', '-', '–', '—', '_']);

function trimEdges(text) {
  let start = 0;
  let end = text.length;
  while (start < end && EDGE_CHARS.has(text[start])) start += 1;
  while (end > start && EDGE_CHARS.has(text[end - 1])) end -= 1;
  return text.slice(start, end);
}

function dropTrailingFormatWord(text) {
  const trimmed = trimEdges(text);
  const lower = trimmed.toLowerCase();
  for (const word of FORMAT_WORDS) {
    if (lower.endsWith(word) && (lower.length === word.length || EDGE_CHARS.has(lower[lower.length - word.length - 1]))) {
      return trimmed.slice(0, trimmed.length - word.length);
    }
  }
  return trimmed;
}

/** "[Site.com] Title, 7th edition PDF.pdf" -> "Title, 7th edition". Falls back to the plain name when nothing readable remains. */
export function cleanSourceTitle(originalName) {
  const plain = String(originalName ?? '').replace(/\.pdf$/i, '').trim();
  let title = dropSiteTags(plain).replaceAll('_', ' ');
  for (let i = 0; i < 3; i += 1) title = dropTrailingFormatWord(title);
  title = trimEdges(title).split(/\s+/).join(' ');
  return title.length >= 2 ? title : plain;
}

/** A stored default title ("<raw name> — páginas 1-3") shown with the cleaned name; a title the student edited is returned untouched. */
export function displayProposalTitle(storedTitle, originalName) {
  const raw = String(originalName ?? '').replace(/\.pdf$/i, '');
  const prefix = `${raw} — `;
  if (typeof storedTitle !== 'string' || !raw || !storedTitle.startsWith(prefix)) return storedTitle;
  return `${cleanSourceTitle(originalName)} — ${storedTitle.slice(prefix.length)}`;
}
