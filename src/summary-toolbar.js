// Small insert bar for the Resumo Mestre textarea: formula, block formula and table are typed as controlled Markdown at the cursor.
// The textarea stays the single source of truth (summary_body is the plain text); the bar only saves the student from remembering syntax.
import { t } from "./i18n/index.js";

const TABLE_TEMPLATE = "| Coluna 1 | Coluna 2 |\n|---|---|\n| | |";

/** Pure: the new value and the range to select after inserting `kind` over [start, end) of `value`. */
export function applyInsertion(value, start, end, kind) {
  if (kind !== "inline" && start === end) {
    // a block never lands in the middle of a line (or of a formula): it goes after the line the cursor is on
    const eol = value.indexOf("\n", start);
    start = end = eol === -1 ? value.length : eol;
  }
  const selected = value.slice(start, end);
  let snippet;
  let selectFrom;
  let selectTo;
  if (kind === "inline") {
    const inner = selected || "fórmula";
    snippet = `$${inner}$`;
    selectFrom = 1;
    selectTo = 1 + inner.length;
  } else if (kind === "block") {
    const inner = selected || "fórmula";
    const lead = start > 0 && !value.slice(0, start).endsWith("\n\n") ? (value.slice(0, start).endsWith("\n") ? "\n" : "\n\n") : "";
    snippet = `${lead}$$\n${inner}\n$$\n`;
    selectFrom = lead.length + 3;
    selectTo = selectFrom + inner.length;
  } else {
    const lead = start > 0 && !value.slice(0, start).endsWith("\n\n") ? (value.slice(0, start).endsWith("\n") ? "\n" : "\n\n") : "";
    snippet = `${lead}${TABLE_TEMPLATE}\n`;
    selectFrom = lead.length + 2;
    selectTo = selectFrom + "Coluna 1".length;
  }
  return { value: value.slice(0, start) + snippet + value.slice(end), selectFrom: start + selectFrom, selectTo: start + selectTo };
}

export function createSummaryToolbar(textarea) {
  const bar = document.createElement("div");
  bar.className = "summary-toolbar";
  bar.setAttribute("role", "group");
  bar.setAttribute("aria-label", t("summary.toolbar.label"));
  for (const [kind, key] of [["inline", "summary.toolbar.formula"], ["block", "summary.toolbar.formulaBlock"], ["table", "summary.toolbar.table"]]) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "text-button summary-toolbar-btn";
    btn.dataset.insert = kind;
    btn.textContent = t(key);
    btn.addEventListener("click", () => {
      const result = applyInsertion(textarea.value, textarea.selectionStart, textarea.selectionEnd, kind);
      textarea.value = result.value;
      textarea.focus({ preventScroll: true });
      textarea.setSelectionRange(result.selectFrom, result.selectTo);
      textarea.dispatchEvent(new Event("input", { bubbles: true })); // the screens track edits through "input"
    });
    bar.append(btn);
  }
  return bar;
}
