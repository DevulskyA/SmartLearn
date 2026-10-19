// Pure text operations behind the insert controls (no DOM, no CSS), so they are unit-testable in Node.
const TABLE_TEMPLATE = "| Coluna 1 | Coluna 2 |\n|---|---|\n| | |";

const blockLead = (value, start) => {
  const before = value.slice(0, start);
  if (start === 0 || before.endsWith("\n\n")) return "";
  return before.endsWith("\n") ? "\n" : "\n\n";
};

/**
 * The new value and the range to select after inserting `kind` at [start, end) of `value`.
 *   inline - `text` goes at the cursor (after a selection, never over it)
 *   block / table / figure - `text` becomes a paragraph of its own, after the line the cursor is on (never inside a line or a formula)
 */
export function applyInsertion(value, start, end, kind, text = "") {
  if (kind === "inline") {
    const at = Math.max(start, end);
    return { value: value.slice(0, at) + text + value.slice(at), selectFrom: at + text.length, selectTo: at + text.length };
  }
  const eol = value.indexOf("\n", Math.max(start, end));
  const at = eol === -1 ? value.length : eol;
  const lead = blockLead(value, at);
  const body = kind === "table" ? TABLE_TEMPLATE : text;
  // exactly one blank line between the new block and whatever follows (never a pile of empty lines); at the very end, one final newline
  const rest = value.slice(at);
  const newlinesAfter = /^\n*/.exec(rest)[0].length;
  const tail = rest.trim() === "" ? (newlinesAfter === 0 ? "\n" : "") : "\n".repeat(Math.max(0, 2 - newlinesAfter));
  const snippet = `${lead}${body}${tail}`;
  const selectFrom = kind === "table" ? at + lead.length + 2 : at + snippet.length;
  const selectTo = kind === "table" ? selectFrom + "Coluna 1".length : selectFrom;
  return { value: value.slice(0, at) + snippet + value.slice(at), selectFrom, selectTo };
}
