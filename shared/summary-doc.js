// The bridge between the controlled Markdown of the Resumo Mestre (the ONLY persisted format, see summary-markdown.js) and the document
// model the visual editor works on (ProseMirror JSON). Pure functions, no DOM and no editor library, so every property is unit-testable.
//
// Guarantees, in order of importance:
//   1. NOTHING IS LOST. Anything the visual editor cannot model (tables, quotes, code, rules, lists with unusual content ...) becomes a
//      `rawBlock` that holds the exact source text and stays editable as text.
//   2. NOTHING UNEDITED CHANGES. Every block remembers its exact source (`origin`) and what its canonical form was at load (`canon`).
//      On the way back, a block whose canonical form is unchanged is written as its original bytes, and the separators between blocks
//      are the original ones. A document that was only opened therefore round-trips to the identical string.
//   3. NOTHING IS WRITTEN BLINDLY. `serializeVerified` re-reads what it produced and refuses (returns the reason) when the text would not
//      mean the same thing, instead of saving something the student did not write.
import { parseSummaryTokens } from './summary-markdown.js';
import { figureRef, parseFigureLine } from './summary-figure-refs.js';

const MARK_ORDER = ['bold', 'italic', 'strike', 'code'];
const WRAP = { bold: '**', italic: '*', strike: '~~' };
const MARK_OF_TAG = { strong: 'bold', em: 'italic', s: 'strike' };

// ---------------------------------------------------------------------------------------------------------------------------------
// Markdown -> document
// ---------------------------------------------------------------------------------------------------------------------------------

/** Line boundaries of the ORIGINAL text, split exactly the way markdown-it normalises newlines (\r\n, \r, \n), so token.map indexes them. */
function lineTable(source) {
  const starts = [0];
  const ends = [];
  const re = /\r\n|\r|\n/g;
  let m;
  while ((m = re.exec(source)) !== null) { ends.push(m.index); starts.push(m.index + m[0].length); }
  ends.push(source.length);
  return { starts, ends };
}

/** The top-level blocks of a token stream: [{ tokens, map }] (a block is an opening token with everything up to its closing token). */
function topLevelBlocks(tokens) {
  const blocks = [];
  let i = 0;
  while (i < tokens.length) {
    const open = tokens[i];
    if (open.level !== 0) { i++; continue; }
    if (open.nesting === 1) {
      let j = i + 1;
      while (j < tokens.length && !(tokens[j].level === 0 && tokens[j].nesting === -1)) j++;
      blocks.push({ tokens: tokens.slice(i, j + 1), map: open.map });
      i = j + 1;
    } else if (open.nesting === 0) {
      blocks.push({ tokens: [open], map: open.map });
      i++;
    } else i++;
  }
  return blocks;
}

function mergeText(nodes) {
  const out = [];
  for (const node of nodes) {
    const last = out[out.length - 1];
    if (node.type === 'text' && last?.type === 'text' && sameMarks(last.marks, node.marks)) last.text += node.text;
    else out.push(node.type === 'text' ? { ...node, marks: [...(node.marks ?? [])] } : node);
  }
  return out;
}

const markNames = (marks) => MARK_ORDER.filter((name) => (marks ?? []).some((m) => m.type === name));
const sameMarks = (a, b) => markNames(a).join() === markNames(b).join();
const toMarks = (names) => MARK_ORDER.filter((n) => names.includes(n)).map((type) => ({ type }));

/** markdown-it inline children -> editor inline nodes, or null when something appears that the editor does not model. */
function appendInlineChild(child, open, nodes) {
  switch (child.type) {
    case 'text':
      if (child.content !== '') nodes.push({ type: 'text', text: child.content, marks: toMarks(open) });
      return true;
    case 'softbreak': nodes.push({ type: 'softBreak' }); return true;
    case 'hardbreak': nodes.push({ type: 'hardBreak' }); return true;
    case 'code_inline': nodes.push({ type: 'text', text: child.content, marks: toMarks([...open, 'code']) }); return true;
    case 'math_inline':
      if (open.length > 0) return false; // a formula inside bold/italic: the editor's formula atom carries no formatting, so keep the block as text
      nodes.push({ type: 'mathInline', attrs: { tex: child.content } });
      return true;
    default:
      if (child.nesting === 1 && MARK_OF_TAG[child.tag]) { open.push(MARK_OF_TAG[child.tag]); return true; }
      if (child.nesting === -1 && MARK_OF_TAG[child.tag]) {
        const at = open.lastIndexOf(MARK_OF_TAG[child.tag]);
        if (at !== -1) open.splice(at, 1);
        return true;
      }
      return false;
  }
}

function inlineNodes(children) {
  const nodes = [];
  const open = [];
  for (const child of children ?? []) if (!appendInlineChild(child, open, nodes)) return null;
  return mergeText(nodes);
}

/** A list (tokens from its opening to its closing token) -> bulletList/orderedList node, or null when an item holds anything but paragraphs and lists. */
function listItemEnd(tokens, start, level) {
  let end = start + 1;
  while (!(tokens[end].type === 'list_item_close' && tokens[end].level === level)) end++;
  return end;
}

function nestedListEnd(tokens, start, level) {
  let end = start + 1;
  while (!(tokens[end].level === level && tokens[end].nesting === -1)) end++;
  return end;
}

function appendListItemToken(tokens, index, token, item, parent) {
  if (token.type === 'paragraph_open') {
    if (!token.hidden) parent.attrs.loose = true;
    const inline = inlineNodes(tokens[index + 1].children);
    if (!inline) return null;
    item.content.push({ type: 'paragraph', content: inline });
    return index + 3;
  }
  if (token.type !== 'bullet_list_open' && token.type !== 'ordered_list_open') return null;
  const end = nestedListEnd(tokens, index, token.level);
  const nested = listNode(tokens.slice(index, end + 1));
  if (!nested) return null;
  if (nested.attrs.loose) parent.attrs.loose = true;
  item.content.push(nested);
  return end + 1;
}

function listItemNode(tokens, itemToken, end, parent) {
  const item = { type: 'listItem', content: [] };
  let index = itemToken.index + 1;
  while (index < end) {
    const token = tokens[index];
    if (token.level !== itemToken.token.level + 1) { index++; continue; }
    const next = appendListItemToken(tokens, index, token, item, parent);
    if (next === null) return null;
    index = next;
  }
  if (item.content.length === 0 || item.content[0].type !== 'paragraph') return null;
  return item;
}

function listNode(tokens) {
  const first = tokens[0];
  const ordered = first.type === 'ordered_list_open';
  const node = { type: ordered ? 'orderedList' : 'bulletList', attrs: ordered ? { start: Number(first.attrGet('start') ?? 1), loose: false } : { loose: false }, content: [] };
  let index = 1;
  while (index < tokens.length - 1) {
    const token = tokens[index];
    if (token.type !== 'list_item_open') return null;
    const end = listItemEnd(tokens, index, token.level);
    const item = listItemNode(tokens, { index, token }, end, node);
    if (!item) return null;
    node.content.push(item);
    index = end + 1;
  }
  return node.content.length > 0 ? node : null;
}

/** A quote (tokens from its opening to its closing token) -> blockquote node of paragraphs, or null when it holds anything else. */
function quoteNode(tokens) {
  const content = [];
  for (let k = 1; k < tokens.length - 1; k += 1) {
    const t = tokens[k];
    if (t.level !== tokens[0].level + 1) continue;
    if (t.type !== 'paragraph_open') return null;
    const inline = inlineNodes(tokens[k + 1].children);
    if (!inline) return null;
    content.push(inline.length > 0 ? { type: 'paragraph', content: inline } : { type: 'paragraph' });
    k += 2;
  }
  return content.length > 0 ? { type: 'blockquote', content } : null;
}

/** A GFM table (tokens from table_open to table_close) -> table node (first row = header), or null when a cell holds more than inline text. */
function tableNode(tokens) {
  const rows = [];
  let row = null;
  for (let k = 0; k < tokens.length; k += 1) {
    const t = tokens[k];
    if (t.type === 'tr_open') row = { type: 'tableRow', content: [] };
    else if (t.type === 'tr_close') { rows.push(row); row = null; }
    else if (t.type === 'th_open' || t.type === 'td_open') {
      const inline = inlineNodes(tokens[k + 1].children);
      if (!inline) return null;
      const align = /text-align:(left|right|center)/.exec(t.attrGet('style') ?? '')?.[1] ?? null;
      row.content.push({ type: t.type === 'th_open' ? 'tableHeader' : 'tableCell', attrs: { align }, content: [inline.length > 0 ? { type: 'paragraph', content: inline } : { type: 'paragraph' }] });
      k += 2;
    }
  }
  return rows.length > 0 ? { type: 'table', content: rows } : null;
}

function blockNode(block) {
  const [first] = block.tokens;
  if (first.type === 'paragraph_open') {
    const content = inlineNodes(block.tokens[1].children);
    return content ? { type: 'paragraph', content } : null;
  }
  if (first.type === 'heading_open') {
    const content = inlineNodes(block.tokens[1].children);
    return content ? { type: 'heading', attrs: { level: Number(first.tag.slice(1)) }, content } : null;
  }
  if (first.type === 'bullet_list_open' || first.type === 'ordered_list_open') return listNode(block.tokens);
  if (first.type === 'math_block') return { type: 'mathBlock', attrs: { tex: first.content } };
  if (first.type === 'figure') return { type: 'figure', attrs: { id: first.meta.id, width: first.meta.width ?? null } };
  if (first.type === 'blockquote_open') return quoteNode(block.tokens);
  if (first.type === 'table_open') return tableNode(block.tokens);
  if (first.type === 'hr') return { type: 'horizontalRule' };
  if (first.type === 'fence') {
    const text = first.content.replace(/\n$/, '');
    const language = first.info.trim();
    return { type: 'codeBlock', attrs: { language: language || null }, ...(text === '' ? {} : { content: [{ type: 'text', text }] }) };
  }
  return null;
}

/**
 * The editor document of a summary text, plus the text outside the blocks (`lead`, `tail`) that must be written back untouched.
 * Block attributes `origin`/`canon`/`gap` are bookkeeping for the guarantees above, not content.
 */
export function markdownToDoc(source) {
  const text = String(source ?? '');
  const { starts, ends } = lineTable(text);
  const blocks = topLevelBlocks(parseSummaryTokens(text));
  const content = [];
  let cursor = 0;
  let lead = '';
  for (const block of blocks) {
    if (!block.map) continue;
    const [from, rawTo] = block.map;
    let to = rawTo;
    while (to - 1 > from && text.slice(starts[to - 1], ends[to - 1]).trim() === '') to -= 1; // trailing blank lines belong to the gap
    const begin = starts[from];
    const end = ends[to - 1];
    const origin = text.slice(begin, end);
    const gap = text.slice(cursor, begin);
    let node = blockNode(block);
    if (!node) node = { type: 'rawBlock', attrs: { text: origin } };
    if (content.length === 0) lead = gap;
    node.attrs = { ...(node.attrs ?? {}), origin, gap: content.length === 0 ? '' : gap };
    node.attrs.canon = serializeBlock(node);
    content.push(node);
    cursor = end;
  }
  const empty = content.length === 0;
  // an editor document always holds at least one block: for a text with no blocks that is an empty paragraph, which has no Markdown form
  if (empty) content.push({ type: 'paragraph' });
  return { doc: { type: 'doc', content }, lead: empty ? '' : lead, tail: empty ? text : text.slice(cursor) };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Document -> Markdown
// ---------------------------------------------------------------------------------------------------------------------------------

function escapeLineStart(text) {
  if (text.length === 0) return null;
  if ('#>+-='.includes(text[0])) return { value: `\\${text[0]}`, length: 1 };
  const ordered = /^(\d+)([.)])(\s|$)/.exec(text);
  if (!ordered) return null;
  return { value: `${ordered[1]}\\${ordered[2]}`, length: ordered[1].length + 1 };
}

function escapeMarkdownChar(text, index) {
  const ch = text[index];
  const prev = index > 0 ? text[index - 1] : '';
  const next = text[index + 1] ?? '';
  const alnum = (value) => /[\p{L}\p{N}]/u.test(value);
  if (ch === '\\' || ch === '*' || ch === '`') return `\\${ch}`;
  if (ch === '_') return alnum(prev) && alnum(next) ? ch : `\\${ch}`;
  if (ch === '~') return prev === '~' || next === '~' ? `\\${ch}` : ch;
  if (ch === '&') return /^&[#\w]/.test(text.slice(index)) ? `\\${ch}` : ch;
  return ch;
}

function escapeRun(text, lineEmpty, heading) {
  let out = '';
  let index = 0;
  while (index < text.length) {
    if (index === 0 && lineEmpty) {
      const start = escapeLineStart(text);
      if (start) {
        out += start.value;
        index = start.length;
        continue;
      }
    }
    out += escapeMarkdownChar(text, index);
    index++;
  }
  if (heading) out = out.replace(/(^|\s)(#+)$/, (m, sp, hashes) => `${sp}\\${hashes}`);
  return out;
}

function codeSpan(text) {
  let longest = 0;
  for (const run of text.match(/`+/g) ?? []) longest = Math.max(longest, run.length);
  const fence = '`'.repeat(longest + 1);
  const pad = /^ | $|^`|`$/.test(text) && text.trim() !== '' ? ' ' : '';
  return `${fence}${pad}${text}${pad}${fence}`;
}

/**
 * Inline nodes in canonical form: adjacent text with the same marks merged, whitespace at the edges of a formatted run and at the
 * edges of a line moved out of the formatting (Markdown cannot express it), empty text dropped, trailing line breaks dropped.
 */
function splitEdgeWhitespace(text, side) {
  if (side === 'start') {
    let edge = 0;
    while (edge < text.length && /\s/.test(text[edge])) edge++;
    return edge === 0 ? null : { whitespace: text.slice(0, edge), core: text.slice(edge) };
  }
  let edge = text.length;
  while (edge > 0 && /\s/.test(text[edge - 1])) edge--;
  return edge === text.length ? null : { whitespace: text.slice(edge), core: text.slice(0, edge) };
}

function stripMarkEdge(node, name, side) {
  if (node.type !== 'text') return [node];
  const edge = splitEdgeWhitespace(node.text, side);
  if (!edge) return [node];
  const bare = { type: 'text', text: edge.whitespace, marks: toMarks(markNames(node.marks).filter((mark) => mark !== name)) };
  const kept = edge.core === '' ? [] : [{ ...node, text: edge.core }];
  return side === 'start' ? [bare, ...kept] : [...kept, bare];
}

function markRunEnd(list, start, name) {
  let end = start;
  while (end < list.length && markNames(list[end].marks).includes(name)) end++;
  return end;
}

function normalizeMarkWhitespace(list, name) {
  const next = [];
  let index = 0;
  while (index < list.length) {
    if (!markNames(list[index].marks).includes(name)) { next.push(list[index]); index++; continue; }
    const end = markRunEnd(list, index, name);
    const run = list.slice(index, end).map((node) => ({ ...node }));
    run.splice(0, 1, ...stripMarkEdge(run[0], name, 'start'));
    const last = run.length - 1;
    run.splice(last, 1, ...stripMarkEdge(run[last], name, 'end'));
    next.push(...run);
    index = end;
  }
  return mergeText(next);
}

function trimHorizontalStart(text) {
  let start = 0;
  while (text[start] === ' ' || text[start] === '\t') start++;
  return text.slice(start);
}

function trimHorizontalEnd(text) {
  let end = text.length;
  while (text[end - 1] === ' ' || text[end - 1] === '\t') end--;
  return text.slice(0, end);
}

function trimLineStarts(list) {
  const out = [];
  let lineStart = true;
  for (const node of list) {
    if (node.type === 'softBreak' || node.type === 'hardBreak') { out.push(node); lineStart = true; continue; }
    if (node.type === 'text' && lineStart) {
      const text = markNames(node.marks).includes('code') ? node.text : trimHorizontalStart(node.text); // inside a code span the spaces are content
      if (text === '') continue;
      out.push({ ...node, text });
    } else out.push(node);
    lineStart = false;
  }
  return out;
}

function trimLineEnds(out) {
  let index = 0;
  while (index < out.length) {
    const node = out[index];
    const atLineEnd = index === out.length - 1 || out[index + 1].type === 'softBreak' || out[index + 1].type === 'hardBreak';
    if (node.type === 'text' && atLineEnd && !markNames(node.marks).includes('code')) out[index] = { ...node, text: trimHorizontalEnd(node.text) };
    index++;
  }
  return out;
}

function normalizeLineWhitespace(list) {
  return trimLineEnds(trimLineStarts(list));
}

export function normalizeInline(nodes) {
  let list = mergeText((nodes ?? []).filter((n) => n.type !== 'text' || n.text !== '').map((n) => (n.type === 'text' ? { ...n, marks: toMarks(markNames(n.marks)) } : n)));
  // whitespace at the edges of a bold/italic/strike run is not formatted
  for (const name of ['bold', 'italic', 'strike']) list = normalizeMarkWhitespace(list, name);
  // a line starts after the paragraph start and after a break; it ends before a break and at the paragraph end
  const out = normalizeLineWhitespace(list);
  const cleaned = out.filter((n) => n.type !== 'text' || n.text !== '');
  while (cleaned.length > 0 && (cleaned[cleaned.length - 1].type === 'softBreak' || cleaned[cleaned.length - 1].type === 'hardBreak')) cleaned.pop();
  while (cleaned.length > 0 && (cleaned[0].type === 'softBreak' || cleaned[0].type === 'hardBreak')) cleaned.shift();
  return mergeText(cleaned);
}

function closeMarks(open, keep) {
  let closing = '';
  while (open.length > keep) closing += WRAP[open.pop()];
  return closing;
}

function serializeInlineContent(node, lineEmpty) {
  if (node.type === 'mathInline') return `\\(${node.attrs.tex}\\)`;
  if (markNames(node.marks).includes('code')) return codeSpan(node.text);
  return escapeRun(node.text, lineEmpty, false);
}

function serializeInline(nodes, { heading = false } = {}) {
  const list = normalizeInline(nodes);
  let out = '';
  let lineEmpty = true;
  let open = [];
  for (const node of list) {
    if (node.type === 'softBreak' || node.type === 'hardBreak') {
      out += node.type === 'softBreak' ? '\n' : '\\\n';
      lineEmpty = true;
      continue;
    }
    const wanted = markNames(node.marks).filter((m) => m !== 'code');
    let k = 0;
    while (k < open.length && k < wanted.length && open[k] === wanted[k]) k++;
    out += closeMarks(open, k);
    for (const name of wanted.slice(k)) { out += WRAP[name]; open.push(name); lineEmpty = false; }
    out += serializeInlineContent(node, lineEmpty);
    lineEmpty = false;
  }
  out += closeMarks(open, 0);
  if (heading) out = out.replace(/(^|\s)(#+)$/, (m, sp, hashes) => `${sp}\\${hashes}`);
  // a line that is exactly a figure reference would turn into a figure
  return out.split('\n').map((line) => (parseFigureLine(line.trim()) !== null ? line.replace('[', '\\[') : line)).join('\n');
}

function itemBlocks(item) {
  return (item.content ?? []).map((child) => (child.type === 'paragraph' ? serializeInline(child.content) : serializeList(child))).filter((s) => s !== null && s !== '');
}

function serializeList(list) {
  const items = (list.content ?? []).map((item) => ({ parts: itemBlocks(item) })).filter((item) => item.parts.length > 0);
  if (items.length === 0) return null;
  const ordered = list.type === 'orderedList';
  const start = Number(list.attrs?.start ?? 1);
  const loose = Boolean(list.attrs?.loose);
  return items.map((item, index) => {
    const marker = ordered ? `${start + index}. ` : '- ';
    const pad = ' '.repeat(marker.length);
    const body = item.parts.join(loose ? '\n\n' : '\n');
    return marker + body.split('\n').map((line, n) => (n === 0 || line === '' ? line : pad + line)).join('\n');
  }).join(loose ? '\n\n' : '\n');
}

/** Canonical Markdown of one block, or null when the block is empty (empty paragraphs/headings/items have no Markdown form). */
const SEPARATOR_OF = { left: ':---', right: '---:', center: ':---:' };

/** One table cell as it goes between pipes: its inline Markdown with the pipes escaped (a line break cannot be written in a GFM cell: the verification will refuse it). */
function tableCell(cell) {
  const paragraph = (cell.content ?? [])[0];
  return serializeInline(paragraph?.content ?? []).replace(/\|/g, '\\|');
}

function serializeTable(table) {
  const rows = (table.content ?? []).map((row) => (row.content ?? []));
  const columns = Math.max(0, ...rows.map((cells) => cells.length));
  if (columns === 0) return null;
  const line = (cells) => `| ${Array.from({ length: columns }, (_, i) => (cells[i] ? tableCell(cells[i]) : '')).join(' | ')} |`;
  const header = rows[0];
  const separator = `| ${Array.from({ length: columns }, (_, i) => SEPARATOR_OF[header[i]?.attrs?.align] ?? '---').join(' | ')} |`;
  return [line(header), separator, ...rows.slice(1).map(line)].join('\n');
}

function serializeQuote(quote) {
  const paragraphs = (quote.content ?? []).map((p) => serializeInline(p.content)).filter((s) => s !== '');
  if (paragraphs.length === 0) return null;
  return paragraphs.map((p) => p.split('\n').map((l) => (l === '' ? '>' : `> ${l}`)).join('\n')).join('\n>\n');
}

function serializeCode(block) {
  const text = (block.content ?? []).map((n) => n.text ?? '').join('');
  let longest = 0;
  for (const run of text.match(/`+/g) ?? []) longest = Math.max(longest, run.length);
  const fence = '`'.repeat(Math.max(3, longest + 1));
  const language = String(block.attrs?.language ?? '').trim();
  return `${fence}${language}\n${text}${text === '' ? '' : '\n'}${fence}`;
}

export function serializeBlock(block) {
  switch (block.type) {
    case 'paragraph': { const s = serializeInline(block.content); return s === '' ? null : s; }
    case 'heading': { const s = serializeInline(block.content, { heading: true }); return s === '' ? null : `${'#'.repeat(Math.min(6, Math.max(1, Number(block.attrs?.level ?? 1))))} ${s}`; }
    case 'bulletList':
    case 'orderedList': return serializeList(block);
    case 'mathBlock': return `\\[\n${String(block.attrs?.tex ?? '').trim()}\n\\]`;
    case 'figure': return figureRef(block.attrs.id, block.attrs.width ?? null);
    case 'rawBlock': { const s = String(block.attrs?.text ?? '').replace(/^(?:[ \t]*\r?\n)+/, '').trimEnd(); return s === '' ? null : s; }
    case 'table': return serializeTable(block);
    case 'blockquote': return serializeQuote(block);
    case 'codeBlock': return serializeCode(block);
    case 'horizontalRule': return '---';
    default: return null;
  }
}

const countNewlines = (s) => (s.match(/\r\n|\r|\n/g) ?? []).length;

/** [{ block, text, dirty }] for the blocks that have a Markdown form, in order. `text` is the original bytes when the block is unchanged. */
function emitted(doc) {
  const out = [];
  for (const block of doc.content ?? []) {
    const canonical = serializeBlock(block);
    if (canonical === null) continue;
    const a = block.attrs ?? {};
    const unchanged = a.origin != null && canonical === a.canon;
    out.push({ block, text: unchanged ? a.origin : canonical, dirty: !unchanged });
  }
  return out;
}

/** The Markdown of a document. `lead`/`tail` are the texts outside the blocks, as returned by markdownToDoc. */
export function docToMarkdown(doc, { lead = '', tail = '' } = {}) {
  let out = lead;
  let previous = null;
  for (const item of emitted(doc)) {
    if (previous) {
      const original = item.block.attrs?.gap;
      // the original separator stays; around an edited or new block it is at least one blank line so blocks cannot merge
      const keep = original != null && (!(item.dirty || previous.dirty) || countNewlines(original) >= 2);
      out += keep ? original : '\n\n';
    }
    out += item.text;
    previous = item;
  }
  return out + tail;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------------------------------------------------------------

/** A comparable, attribute-free form of a node (only what carries meaning). */
function signature(node) {
  if (node.type === 'text') return { k: 't', s: node.text, m: markNames(node.marks) };
  if (node.type === 'mathInline') return { k: 'mi', tex: node.attrs.tex };
  if (node.type === 'softBreak' || node.type === 'hardBreak') return { k: node.type };
  if (node.type === 'listItem') return { k: 'li', c: (node.content ?? []).map(signature) };
  if (node.type === 'paragraph' || node.type === 'heading') return { k: node.type, l: node.attrs?.level ?? 0, c: normalizeInline(node.content).map(signature) };
  if (node.type === 'bulletList' || node.type === 'orderedList') {
    const items = (node.content ?? []).filter((item) => itemBlocks(item).length > 0);
    return { k: node.type, start: node.type === 'orderedList' ? Number(node.attrs?.start ?? 1) : 0, loose: Boolean(node.attrs?.loose), c: items.map(signature) };
  }
  if (node.type === 'mathBlock') return { k: 'mb', tex: String(node.attrs?.tex ?? '').trim() };
  if (node.type === 'figure') return { k: 'fig', id: node.attrs.id, w: node.attrs.width ?? null };
  if (node.type === 'blockquote') return { k: 'quote', c: (node.content ?? []).filter((p) => serializeInline(p.content) !== '').map(signature) };
  if (node.type === 'table') {
    const rows = (node.content ?? []).map((row) => row.content ?? []);
    const columns = Math.max(0, ...rows.map((cells) => cells.length));
    // the first row is the header whichever kind of cell it holds; short rows are padded with empty cells, as Markdown does
    return { k: 'table', align: Array.from({ length: columns }, (_, i) => rows[0]?.[i]?.attrs?.align ?? null), rows: rows.map((cells) => Array.from({ length: columns }, (_, i) => (cells[i] ? normalizeInline(cells[i].content?.[0]?.content).map(signature) : []))) };
  }
  if (node.type === 'codeBlock') return { k: 'code', language: String(node.attrs?.language ?? '').trim(), text: (node.content ?? []).map((n) => n.text ?? '').join('') };
  if (node.type === 'rawBlock') return { k: 'raw', text: String(node.attrs?.text ?? '').trim() };
  return { k: node.type };
}

/**
 * Markdown for `doc`, or `{ error }` when reading the result back would not give the same document. Unchanged blocks are trusted
 * (they are the original bytes); every edited or new block must come back identical, and the number of blocks must match so
 * that two blocks cannot have merged.
 */
export function serializeVerified(doc, { lead = '', tail = '' } = {}) {
  const text = docToMarkdown(doc, { lead, tail });
  const parts = emitted(doc);
  const again = markdownToDoc(text).doc.content.filter((block) => block.attrs?.origin != null); // not the empty placeholder paragraph
  if (again.length !== parts.length) return { error: 'BLOCK_COUNT', text };
  for (let i = 0; i < parts.length; i++) {
    const { block, text: piece, dirty } = parts[i];
    if (again[i].attrs.origin !== piece) return { error: 'BLOCK_TEXT', index: i, text };
    if (!dirty || block.type === 'rawBlock') continue;
    if (JSON.stringify(signature(again[i])) !== JSON.stringify(signature(block))) return { error: 'BLOCK_MEANING', index: i, text };
  }
  return { text };
}
