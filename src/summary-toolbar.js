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
export function createSummaryAuthoring(textarea, { extraButtons = [], previewOptions = {}, visual = false } = {}) {
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

  const authoring = { bar, preview, refresh: draw };
  if (visual) Object.assign(authoring, createModeSwitch(textarea, bar, preview));
  return authoring;
}

// ---- visual / text editing -------------------------------------------------------------------------------------------------------------------
// The textarea is always the source of truth. "Texto" is the safe, original way to edit; "Visual" is the Tiptap editor over the same text.
// The choice is a per-viewer convenience (remembered in this browser only); the editor code is loaded the first time "Visual" is used.
const MODE_KEY = "smartlearn.summary-mode";
const readMode = () => { try { return localStorage.getItem(MODE_KEY) === "visual" ? "visual" : "text"; } catch { return "text"; } };
const rememberMode = (mode) => { try { localStorage.setItem(MODE_KEY, mode); } catch { /* private window: the choice just is not remembered */ } };

function createModeSwitch(textarea, bar, preview) {
  const modeSwitch = document.createElement("div");
  modeSwitch.className = "summary-mode";
  modeSwitch.setAttribute("role", "group");
  modeSwitch.setAttribute("aria-label", t("summary.mode.label"));
  const visualHost = document.createElement("div");
  visualHost.className = "summary-visual-host";
  visualHost.hidden = true;
  const note = document.createElement("span");
  note.className = "form-message summary-mode-message";
  note.setAttribute("role", "status");
  const modeButton = (mode, label) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "text-button summary-mode-btn";
    b.dataset.mode = mode;
    b.textContent = label;
    b.addEventListener("click", () => setMode(mode));
    return b;
  };
  const textBtn = modeButton("text", t("summary.mode.text"));
  const visualBtn = modeButton("visual", t("summary.mode.visual"));
  modeSwitch.append(visualBtn, textBtn, note);

  let editor = null;
  let mode = "text";
  const show = (next) => {
    mode = next;
    const visual = next === "visual";
    textarea.hidden = visual;
    bar.hidden = visual;
    preview.hidden = visual;
    visualHost.hidden = !visual;
    visualBtn.setAttribute("aria-pressed", String(visual));
    textBtn.setAttribute("aria-pressed", String(!visual));
  };
  async function setMode(next) {
    note.textContent = "";
    if (next === mode) return;
    if (next === "visual") {
      try {
        if (!editor) {
          const { createVisualSummaryEditor } = await import("./summary-visual-editor.js");
          editor = createVisualSummaryEditor(textarea);
          visualHost.append(editor.root);
        } else editor.reload();
      } catch (err) {
        console.error("visual summary editor failed to start", err);
        note.textContent = t("summary.mode.failed"); // the text editor keeps working: nothing was changed
        return;
      }
      show("visual");
      rememberMode("visual");
      editor.focus();
    } else {
      editor?.flush();
      if (editor?.isBlocked() && !window.confirm(t("summary.mode.confirmDiscard"))) return;
      show("text");
      rememberMode("text");
      textarea.focus({ preventScroll: true });
    }
  }
  show("text");
  if (readMode() === "visual") setMode("visual");

  return {
    modeSwitch,
    visualHost,
    /** Write pending visual edits to the textarea (call before reading it to save). */
    flushVisual: () => editor?.flush(),
    /** Re-read the textarea after something else changed it (a saved or re-audited draft). */
    reloadVisual: () => editor?.reload(),
    /** Ends the visual editor (timer, listeners, ProseMirror view) when the screen that owns it is closed. */
    destroyVisual() { editor?.destroy(); editor = null; },
    /** Puts the caret where the student writes: the visual editor in visual mode, the textarea otherwise. */
    focusSummary: () => (mode === "visual" && editor ? editor.focus() : textarea.focus({ preventScroll: true })),
    /** { ok: false, message } while the visual editor holds an edit it could not write back faithfully. */
    saveGuard: () => (mode === "visual" && editor?.isBlocked() ? { ok: false, message: t("summary.visual.cannotSave") } : { ok: true }),
  };
}
