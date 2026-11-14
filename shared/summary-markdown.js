// The controlled Markdown of the Resumo Mestre: markdown-it with raw HTML, links and Markdown images switched OFF, plus three small rules:
//   \( ... \)   inline math       \[ ... \]   block math       [[fig:UUID]] or [[fig:UUID|w=420]]   a figure on its own line
// `$` is NOT a math delimiter (it is money in ordinary text). The parser only produces TOKENS; the screens build DOM from them (src/summary-render.js),
// so no user text is ever treated as HTML.
import MarkdownIt from 'markdown-it';
import { parseFigureLine } from './summary-figure-refs.js';

function mathInline(state, silent) {
  const { src, pos, posMax } = state;
  if (src[pos] !== '\\' || src[pos + 1] !== '(') return false;
  let end = -1;
  for (let j = pos + 2; j < posMax; j++) {
    if (src[j] !== '\\') continue;
    if (src[j + 1] === ')') { end = j; break; }
    j += 1; // an escaped character (`\\`, `\{` ...) never closes the formula
  }
  if (end === -1) return false;
  const content = src.slice(pos + 2, end);
  if (content.trim() === '') return false;
  if (!silent) {
    const token = state.push('math_inline', 'span', 0);
    token.content = content;
    token.markup = '\\(';
  }
  state.pos = end + 2;
  return true;
}

function readMultilineMath(state, startLine, endLine, first) {
  const parts = [first.slice(2)];
  for (let line = startLine + 1; line < endLine; line++) {
    const text = state.src.slice(state.bMarks[line], state.eMarks[line]);
    const close = text.indexOf('\\]');
    if (close === -1) {
      parts.push(text);
      continue;
    }
    if (text.slice(close + 2).trim() !== '') return null;
    parts.push(text.slice(0, close));
    return { content: parts.join('\n'), last: line };
  }
  return null;
}

function mathBlock(state, startLine, endLine, silent) {
  const first = state.src.slice(state.bMarks[startLine] + state.tShift[startLine], state.eMarks[startLine]);
  if (state.sCount[startLine] - state.blkIndent >= 4 || !first.startsWith('\\[')) return false;
  const sameLine = first.indexOf('\\]', 2);
  let content;
  let last = startLine;
  if (sameLine !== -1) {
    if (first.slice(sameLine + 2).trim() !== '') return false; // text after the closing marker: it is a paragraph with a formula, not a block
    content = first.slice(2, sameLine);
  } else {
    const block = readMultilineMath(state, startLine, endLine, first);
    if (!block) return false;
    content = block.content;
    last = block.last;
  }
  if (content.trim() === '') return false;
  if (silent) return true;
  const token = state.push('math_block', 'div', 0);
  token.content = content.trim();
  token.map = [startLine, last + 1];
  token.markup = '\\[';
  state.line = last + 1;
  return true;
}

function figureBlock(state, startLine, endLine, silent) {
  // a figure sits at the left margin of the document itself: column 0, so never indented, never inside a list item or a quote (their content starts
  // after a marker or an indent). A left-margin line also ends a list or quote it follows, like a heading would (shared/summary-figure-refs.js scans by the same rule)
  // (inside a quote the line marks are moved past the ">" marker, so "column 0" also means: the content starts where the real line starts)
  if (state.sCount[startLine] !== 0 || state.bMarks[startLine] !== state.src.lastIndexOf('\n', state.bMarks[startLine] - 1) + 1) return false;
  const text = state.src.slice(state.bMarks[startLine], state.eMarks[startLine]).trimEnd();
  const ref = parseFigureLine(text);
  if (!ref) return false;
  if (silent) return true;
  const token = state.push('figure', 'figure', 0);
  token.meta = { id: ref.id, width: ref.width };
  token.map = [startLine, startLine + 1];
  state.line = startLine + 1;
  return true;
}

let shared = null;
function markdown() {
  if (shared) return shared;
  const md = new MarkdownIt('default', { html: false, linkify: false, typographer: false, breaks: false });
  md.disable(['link', 'image', 'autolink', 'html_inline', 'html_block', 'reference', 'linkify']);
  md.inline.ruler.before('escape', 'math_inline', mathInline);
  md.block.ruler.before('fence', 'math_block', mathBlock, { alt: ['paragraph', 'reference', 'blockquote', 'list'] });
  md.block.ruler.before('fence', 'figure', figureBlock, { alt: ['paragraph', 'reference', 'blockquote', 'list'] });
  shared = md;
  return md;
}

/** markdown-it tokens of a summary (block tokens, with `inline` tokens carrying `children`). Legacy plain text parses as headings and paragraphs. */
export function parseSummaryTokens(text) {
  return markdown().parse(String(text ?? ''), {});
}

function appendBlockMathLocation(token, text, lineStart, found) {
  const from = lineStart(token.map[0]);
  const to = Math.min(lineStart(token.map[1]), text.length);
  const open = text.indexOf('\\[', from);
  const close = text.lastIndexOf('\\]', to);
  if (open !== -1 && close > open) found.push({ kind: 'block', tex: token.content, start: open, end: close + 2 });
  else found.push({ kind: 'block', tex: token.content, start: -1, end: -1 });
  return to;
}

function appendInlineMathLocation(child, text, cursor, limit, found) {
  const raw = `\\(${child.content}\\)`;
  const at = text.indexOf(raw, cursor);
  if (at === -1 || at + raw.length > limit) {
    found.push({ kind: 'inline', tex: child.content, start: -1, end: -1 });
    return cursor;
  }
  found.push({ kind: 'inline', tex: child.content, start: at, end: at + raw.length });
  return at + raw.length;
}

function appendInlineTokenLocations(token, map, text, lineStart, cursor, found) {
  cursor = Math.max(cursor, lineStart(map[0]));
  const limit = Math.min(lineStart(map[1]), text.length);
  for (const child of token.children ?? []) {
    if (child.type === 'math_inline') cursor = appendInlineMathLocation(child, text, cursor, limit, found);
  }
  return cursor;
}

/**
 * Every formula in the text with the exact character range it occupies, in document order, so the editor can replace ONE formula
 * without touching the text around it. One entry per formula in document order (the renderer counts them the same way); a formula that
 * cannot be located exactly (e.g. split across indented list lines) has start/end -1 and is simply not editable in place.
 */
export function locateMath(source) {
  const text = String(source ?? '');
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  starts.push(text.length + 1);
  const lineStart = (line) => starts[Math.min(line, starts.length - 1)];
  const found = [];
  let cursor = 0;
  let map = null;
  for (const token of parseSummaryTokens(text)) {
    if (token.map) map = token.map;
    if (token.type === 'math_block') {
      cursor = Math.max(cursor, appendBlockMathLocation(token, text, lineStart, found));
    } else if (token.type === 'inline' && map) {
      cursor = appendInlineTokenLocations(token, map, text, lineStart, cursor, found);
    }
  }
  return found;
}

/** `source` with one located formula replaced by `tex`, everything else byte-identical. */
export function replaceMath(source, location, tex) {
  const clean = String(tex).trim();
  const replacement = location.kind === 'block' ? `\\[\n${clean}\n\\]` : `\\(${clean}\\)`;
  return source.slice(0, location.start) + replacement + source.slice(location.end);
}

/** The text to insert at the cursor for a new formula. */
export function mathSnippet(tex, display) {
  const clean = String(tex).trim();
  return display ? `\\[\n${clean}\n\\]` : `\\(${clean}\\)`;
}
