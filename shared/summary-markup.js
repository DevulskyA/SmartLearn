// Resumo Mestre científico: parser PURO (sem DOM) do subconjunto controlado de Markdown guardado em summary_body.
// Reconhece títulos (#..###), parágrafos, listas, tabelas GFM, fórmulas ($…$ em linha, $$…$$ em bloco) e figuras
// (![alt](smartlearn-figure:ID "legenda")). Qualquer outra coisa (HTML, links, imagens externas) permanece TEXTO.
// Texto simples antigo (só títulos e parágrafos) é lido como antes (ver summaryBlocks em src/lesson-view-model.js).

export const SUMMARY_FIGURE_URL = /^smartlearn-figure:\d+$/;

const HEADING = /^(#{1,3})\s+(.+)$/;
const FIGURE = /^!\[([^\]]*)\]\(smartlearn-figure:(\d+)(?:\s+"([^"]*)")?\)$/;
const LIST_ITEM = /^\s*([-*+]|\d+[.)])\s+(\S.*)$/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;
// Uma fórmula em linha nunca atravessa mais que isto: mantém o parser linear mesmo com cifrões soltos.
const MAX_INLINE_MATH = 300;

function pushText(parts, text) {
  if (!text) return;
  const last = parts[parts.length - 1];
  if (last?.type === 'text') last.text += text;
  else parts.push({ type: 'text', text });
}

// Regra do Pandoc: o "$" de abertura precisa de um não-espaço logo à direita; o de fechamento, de um não-espaço
// logo à esquerda e não pode ser seguido de dígito. Assim "R$ 20", "$5 e $10" e "Na+ $ K+" continuam texto.
function closingDollar(s, from) {
  const limit = Math.min(s.length, from + MAX_INLINE_MATH);
  for (let j = from; j < limit; j++) {
    const c = s[j];
    if (c === '\n') return -1;
    if (c === '\\') { j++; continue; }
    if (c === '$' && !/\s/.test(s[j - 1]) && !/\d/.test(s[j + 1] ?? '')) return j;
  }
  return -1;
}

export function inlineParts(source) {
  const s = String(source ?? '');
  const parts = [];
  let buf = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\' && s[i + 1] === '$') { buf += '$'; i++; continue; }
    if (c === '$' && s[i + 1] !== undefined && s[i + 1] !== '$' && !/\s/.test(s[i + 1])) {
      const end = closingDollar(s, i + 1);
      if (end > i + 1) {
        pushText(parts, buf);
        buf = '';
        parts.push({ type: 'math', tex: s.slice(i + 1, end) });
        i = end;
        continue;
      }
    }
    buf += c;
  }
  pushText(parts, buf);
  return parts;
}

function splitCells(line) {
  let t = line.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|') && !t.endsWith('\\|')) t = t.slice(0, -1);
  return t.split(/(?<!\\)\|/).map((cell) => cell.replace(/\\\|/g, '|').trim());
}

function alignOf(cell) {
  const left = cell.startsWith(':');
  const right = cell.endsWith(':');
  if (left && right) return 'center';
  if (right) return 'right';
  if (left) return 'left';
  return null;
}

const toCell = (text) => ({ text, parts: inlineParts(text) });

function displayMathAt(lines, i) {
  const t = lines[i].trim();
  if (!t.startsWith('$$')) return null;
  if (t.length > 4 && t.endsWith('$$')) return { tex: t.slice(2, -2).trim(), next: i + 1 };
  if (t !== '$$') return null;
  for (let j = i + 1; j < lines.length; j++) {
    if (lines[j].trim() === '$$') return { tex: lines.slice(i + 1, j).join('\n').trim(), next: j + 1 };
  }
  return null;
}

function tableAt(lines, i) {
  if (!lines[i].includes('|') || i + 1 >= lines.length) return null;
  const sep = lines[i + 1];
  if (!sep.includes('|') || !TABLE_SEPARATOR.test(sep)) return null;
  const header = splitCells(lines[i]);
  const width = header.length;
  const fit = (cells) => Array.from({ length: width }, (_, k) => toCell(cells[k] ?? ''));
  const rows = [];
  let j = i + 2;
  while (j < lines.length && lines[j].trim() && lines[j].includes('|')) rows.push(fit(splitCells(lines[j++])));
  return { block: { type: 'table', header: fit(header), align: Array.from({ length: width }, (_, k) => alignOf(splitCells(sep)[k] ?? '')), rows }, next: j };
}

export function parseSummary(text) {
  const lines = String(text ?? '').split(/\r?\n/);
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) { i++; continue; }

    const math = displayMathAt(lines, i);
    if (math) { blocks.push({ type: 'math', tex: math.tex }); i = math.next; continue; }

    const heading = HEADING.exec(trimmed);
    if (heading) { blocks.push({ type: 'heading', level: heading[1].length, text: heading[2].trim() }); i++; continue; }

    const figure = FIGURE.exec(trimmed);
    if (figure) { blocks.push({ type: 'figure', figureId: Number(figure[2]), alt: figure[1], caption: figure[3] ?? '' }); i++; continue; }

    const table = tableAt(lines, i);
    if (table) { blocks.push(table.block); i = table.next; continue; }

    const item = LIST_ITEM.exec(line);
    if (item) {
      const ordered = /\d/.test(item[1]);
      const items = [];
      while (i < lines.length) {
        const m = LIST_ITEM.exec(lines[i]);
        if (!m || /\d/.test(m[1]) !== ordered) break;
        items.push(m[2].trim());
        i++;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    const para = [];
    while (i < lines.length && lines[i].trim() && (para.length === 0 || lines[i].trim() !== '$$')) para.push(lines[i++]);
    blocks.push({ type: 'paragraph', parts: inlineParts(para.join('\n').trim()) });
  }
  return blocks;
}
