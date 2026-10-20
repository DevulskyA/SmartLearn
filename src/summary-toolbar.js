// Authoring controls for the Resumo Mestre textarea: insert a formula (visual dialog), a table, and a live preview in which every formula
// can be clicked to be edited again. The textarea stays the single source of truth (summary_body is plain text); these controls only write
// the controlled Markdown at the cursor, so the student never has to type the syntax.
import { t } from "./i18n/index.js";
import { mathSnippet, replaceMath } from "../shared/summary-markdown.js";
import { openMathDialog } from "./math-dialog.js";
import { renderSummary } from "./summary-render.js";
import { applyInsertion } from "./summary-insert.js";
import { figureRef } from "../shared/summary-figure-refs.js";
import { openFigureDetailsDialog, ACCEPTED_IMAGE_TYPES } from "./figure-ui.js";
import { openPdfCropDialog } from "./pdf-crop-dialog.js";

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
  // Images: from a file, or pasted from the clipboard. Both end in the same details dialog (description is required) and insert [[fig:UUID]].
  const message = document.createElement("span");
  message.className = "form-message summary-toolbar-message";
  message.setAttribute("role", "status");
  const insertBlob = async (blob) => {
    message.textContent = "";
    if (!ACCEPTED_IMAGE_TYPES.includes(blob.type)) { message.textContent = t("summary.image.unsupported"); return; }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const record = await openFigureDetailsDialog({ blob });
    if (!record) { textarea.focus({ preventScroll: true }); return; }
    commit(textarea, applyInsertion(textarea.value, start, end, "figure", figureRef(record.id)));
  };
  const imageBtn = toolbarButton("image", t("summary.toolbar.image"));
  const picker = document.createElement("input");
  picker.type = "file";
  picker.accept = ACCEPTED_IMAGE_TYPES.join(",");
  picker.hidden = true;
  picker.className = "summary-image-picker";
  picker.addEventListener("change", () => { const file = picker.files?.[0]; picker.value = ""; if (file) insertBlob(file); });
  imageBtn.addEventListener("click", () => picker.click());
  textarea.addEventListener("paste", (event) => {
    const file = [...(event.clipboardData?.items ?? [])].find((item) => item.kind === "file" && item.type.startsWith("image/"))?.getAsFile();
    if (!file) return; // ordinary text paste: untouched
    event.preventDefault();
    insertBlob(file);
  });
  // PDF region: the figure is cut from a page of an uploaded PDF and remembers source, page and rectangle.
  const pdfBtn = toolbarButton("pdf", t("summary.toolbar.pdf"));
  pdfBtn.addEventListener("click", async () => {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const record = await openPdfCropDialog({});
    if (!record) { textarea.focus({ preventScroll: true }); return; }
    commit(textarea, applyInsertion(textarea.value, start, end, "figure", figureRef(record.id)));
  });
  buttons.append(formulaBtn, tableBtn, imageBtn, pdfBtn, picker, ...extraButtons);
  bar.append(buttons, message);

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
