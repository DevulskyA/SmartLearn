// Authoring controls for the Resumo Mestre textarea: insert a formula (visual dialog), a table, and a live preview in which every formula
// can be clicked to be edited again. The textarea stays the single source of truth (summary_body is plain text); these controls only write
// the controlled Markdown at the cursor, so the student never has to type the syntax.
import { t } from "./i18n/index.js";
import { mathSnippet, replaceMath } from "../shared/summary-markdown.js";
import { openMathDialog } from "./math-dialog.js";
import { renderSummary } from "./summary-render.js";
import { applyInsertion } from "./summary-insert.js";

function commit(textarea, result) {
  textarea.value = result.value;
  textarea.focus({ preventScroll: true });
  textarea.setSelectionRange(result.selectFrom, result.selectTo);
  textarea.dispatchEvent(new Event("input", { bubbles: true })); // the screens track edits through "input"
}

function toolbarButton(kind, label) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "text-button summary-toolbar-btn";
  btn.dataset.insert = kind;
  btn.textContent = label;
  return btn;
}

/**
 * Builds the insert bar and the live preview for `textarea`. The caller places `bar` above the textarea and `preview` below it.
 * `extraButtons` lets other features (images, PDF crop) add their own buttons to the same bar. `previewOptions` is passed to the
 * renderer (figure loading etc.).
 */
export function createSummaryAuthoring(textarea, { extraButtons = [], previewOptions = {} } = {}) {
  const bar = document.createElement("div");
  bar.className = "summary-toolbar";
  bar.setAttribute("role", "group");
  bar.setAttribute("aria-label", t("summary.toolbar.label"));
  const buttons = document.createElement("div");
  buttons.className = "summary-toolbar-buttons";

  const formulaBtn = toolbarButton("formula", t("summary.toolbar.formula"));
  formulaBtn.addEventListener("click", async () => {
    const selectionEnd = textarea.selectionEnd;
    const selectionStart = textarea.selectionStart;
    const chosen = await openMathDialog({});
    if (!chosen) { textarea.focus({ preventScroll: true }); return; }
    const kind = chosen.display ? "block" : "inline";
    commit(textarea, applyInsertion(textarea.value, selectionStart, selectionEnd, kind, mathSnippet(chosen.tex, chosen.display)));
  });
  const tableBtn = toolbarButton("table", t("summary.toolbar.table"));
  tableBtn.addEventListener("click", () => commit(textarea, applyInsertion(textarea.value, textarea.selectionStart, textarea.selectionEnd, "table")));
  buttons.append(formulaBtn, tableBtn, ...extraButtons);
  bar.append(buttons);

  const preview = document.createElement("div");
  preview.className = "summary-preview";
  const previewTitle = document.createElement("h3");
  previewTitle.className = "summary-preview-title";
  previewTitle.textContent = t("summary.preview.title");
  const previewBody = document.createElement("div");
  previewBody.className = "summary-preview-body";
  preview.append(previewTitle, previewBody);

  // Clicking a drawn formula (or "Corrigir" on an invalid one) reopens the dialog on exactly that formula and rewrites only its characters.
  const editFormula = async (location) => {
    const current = textarea.value;
    const raw = current.slice(location.start, location.end);
    if (!raw.includes(location.tex)) return; // the text changed since the preview was drawn
    const chosen = await openMathDialog({ tex: location.tex, display: location.kind === "block", lockDisplay: true });
    if (!chosen) return;
    const next = replaceMath(textarea.value, location, chosen.tex);
    textarea.value = next;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.focus({ preventScroll: true });
  };

  let timer = null;
  const draw = () => renderSummary(previewBody, textarea.value, { ...previewOptions, onEditMath: editFormula });
  const refresh = () => { clearTimeout(timer); timer = setTimeout(draw, 150); };
  textarea.addEventListener("input", refresh);
  draw();

  return { bar, preview, refresh: draw };
}
