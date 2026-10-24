// The visual editor of the Resumo Mestre (Tiptap / ProseMirror, bundled locally, loaded only when the student switches to it).
// It is a VIEW over the same text: the textarea stays the single source of truth that the screens save, version and audit. Every edit is
// converted back to the controlled Markdown by shared/summary-doc.js, which keeps untouched blocks byte for byte, carries what the editor
// cannot model as editable raw text, and REFUSES (instead of guessing) what it could not write back faithfully.
// Nothing here uses innerHTML for user text, and the schema has no link, image, script or HTML node, so pasted HTML cannot become any of them.
import { Editor } from "@tiptap/core";
import { EditorState } from "@tiptap/pm/state";
import { markdownToDoc, serializeVerified } from "../shared/summary-doc.js";
import { MathInline, MathBlock, Figure, summaryExtensions } from "./summary-visual-schema.js";
import { t } from "./i18n/index.js";
import { openMathDialog } from "./math-dialog.js";
import { renderMathElement, renderFigureElement } from "./summary-render.js";
import { openFigureDetailsDialog, ACCEPTED_IMAGE_TYPES } from "./figure-ui.js";
import { openPdfCropDialog } from "./pdf-crop-dialog.js";

// The drawing of the atoms: the SAME KaTeX / figure components as every screen, so the editor shows what the screens will show.
const withMathView = (node, inline) => node.extend({
  addNodeView() {
    return ({ node: first, getPos, editor }) => {
      let current = first;
      const dom = document.createElement(inline ? "span" : "div");
      dom.className = inline ? "summary-math-node" : "summary-math-node summary-math-node-block";
      dom.contentEditable = "false";
      const draw = () => dom.replaceChildren(renderMathElement(current.attrs.tex, !inline, () => this.options.editFormula?.(editor, getPos(), current)));
      draw();
      return {
        dom,
        update(next) { if (next.type !== current.type) return false; current = next; draw(); return true; },
        stopEvent: () => false,
        ignoreMutation: () => true,
      };
    };
  },
});
const MathInlineView = withMathView(MathInline, true);
const MathBlockView = withMathView(MathBlock, false);
const FigureView = Figure.extend({
  addNodeView() {
    return ({ node }) => {
      const dom = renderFigureElement(node.attrs.id, { onOpenSource: this.options.openSource ?? undefined });
      dom.contentEditable = "false";
      return { dom, update: (next) => next.type === node.type && next.attrs.id === node.attrs.id, stopEvent: () => false, ignoreMutation: () => true };
    };
  },
});

const extensions = ({ editFormula, openSource }) => summaryExtensions({
  math: [MathInlineView, MathBlockView],
  figure: FigureView,
  rawLabel: t("summary.visual.rawLabel"),
  editFormula,
  openSource,
});

function button(label, key, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "text-button summary-visual-btn";
  b.dataset.visual = key;
  b.textContent = label;
  b.addEventListener("mousedown", (event) => event.preventDefault()); // clicking a tool keeps the caret in the text
  b.addEventListener("click", onClick);
  return b;
}

/**
 * Builds the visual editor over `textarea`. Returns { root, flush, reload, isBlocked, focus, destroy }.
 *   flush()     writes pending edits to the textarea now (call before saving)
 *   reload()    re-reads the textarea when something else changed it (a saved or re-audited draft)
 *   isBlocked() true while the last edit could not be written back faithfully (the textarea then still holds the last faithful text)
 */
export function createVisualSummaryEditor(textarea, { openSource = null } = {}) {
  const root = document.createElement("div");
  root.className = "summary-visual";
  const toolbar = document.createElement("div");
  toolbar.className = "summary-visual-toolbar";
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", t("summary.visual.toolbar"));
  const surface = document.createElement("div");
  surface.className = "summary-visual-surface";
  const notice = document.createElement("p");
  notice.className = "form-message summary-visual-notice";
  notice.setAttribute("role", "alert");
  notice.hidden = true;
  const status = document.createElement("span");
  status.className = "form-message summary-toolbar-message";
  status.setAttribute("role", "status");
  root.append(toolbar, surface, notice, status);

  let editor = null; // assigned below; the tool callbacks run only after that
  let memory = { lead: "", tail: "" };
  let lastValue = null;
  let blocked = false;
  let timer = null;
  let pending = false;

  const setBlocked = (state) => {
    blocked = state;
    notice.hidden = !state;
    notice.textContent = state ? t("summary.visual.cannotWrite") : "";
    root.dataset.sync = state ? "blocked" : "ok";
  };

  function writeBack() {
    clearTimeout(timer);
    timer = null;
    if (!pending) return;
    pending = false;
    const result = serializeVerified(editor.getJSON(), memory);
    if (result.error) { setBlocked(true); return; }
    setBlocked(false);
    lastValue = result.text;
    if (textarea.value !== result.text) {
      textarea.value = result.text;
      textarea.dispatchEvent(new Event("input", { bubbles: true })); // the screens track edits (dirty state, preview) through "input"
    }
  }

  function load(source) {
    const parsed = markdownToDoc(source);
    memory = { lead: parsed.lead, tail: parsed.tail };
    lastValue = source;
    pending = false;
    clearTimeout(timer);
    setBlocked(false);
    // loading is not an edit: it must not be undoable (undoing it would empty the editor) and must not mark the text as changed
    editor.chain().setMeta("addToHistory", false).setContent(parsed.doc, { emitUpdate: false, errorOnInvalidContent: true }).run();
    // and what was undoable before belonged to a different text: start the history afresh on the new content
    editor.view.updateState(EditorState.create({ doc: editor.state.doc, plugins: editor.state.plugins }));
  }

  // ---- inserting things ---------------------------------------------------------------------------------------------
  const topLevelEnd = () => { const { $to } = editor.state.selection; return $to.depth === 0 ? $to.pos : $to.after(1); };
  function insertBlock(node) {
    const { $from } = editor.state.selection;
    const emptyParagraph = $from.depth === 1 && $from.parent.type.name === "paragraph" && $from.parent.content.size === 0;
    if (emptyParagraph) editor.chain().focus().insertContentAt({ from: $from.before(1), to: $from.after(1) }, node).run();
    else editor.chain().focus().insertContentAt(topLevelEnd(), node).run();
  }
  async function insertFormula() {
    const chosen = await openMathDialog({});
    if (!chosen) { editor.commands.focus(); return; }
    if (chosen.display) { insertBlock({ type: "mathBlock", attrs: { tex: chosen.tex } }); return; }
    const { selection } = editor.state;
    if (selection.$to.parent.type.name === "rawBlock") editor.chain().focus().insertContentAt(selection.to, `\\(${chosen.tex}\\)`).run();
    else editor.chain().focus().insertContentAt(selection.to, { type: "mathInline", attrs: { tex: chosen.tex } }).run();
  }
  async function editFormula(ed, pos, node) {
    const chosen = await openMathDialog({ tex: node.attrs.tex, display: node.type.name === "mathBlock", lockDisplay: true });
    if (!chosen) { ed.commands.focus(); return; }
    ed.view.dispatch(ed.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, tex: chosen.tex }));
    ed.commands.focus();
  }
  async function insertImage(blob) {
    status.textContent = "";
    if (!ACCEPTED_IMAGE_TYPES.includes(blob.type)) { status.textContent = t("summary.image.unsupported"); return; }
    const record = await openFigureDetailsDialog({ blob });
    if (!record) { editor.commands.focus(); return; }
    insertBlock({ type: "figure", attrs: { id: record.id } });
  }
  async function insertPdfCrop() {
    const record = await openPdfCropDialog({});
    if (!record) { editor.commands.focus(); return; }
    insertBlock({ type: "figure", attrs: { id: record.id } });
  }

  // ---- toolbar ------------------------------------------------------------------------------------------------------
  const picker = document.createElement("input");
  picker.type = "file";
  picker.accept = ACCEPTED_IMAGE_TYPES.join(",");
  picker.hidden = true;
  picker.className = "summary-image-picker";
  picker.addEventListener("change", () => { const file = picker.files?.[0]; picker.value = ""; if (file) insertImage(file); });

  const tools = [
    ["bold", t("summary.visual.bold"), () => editor.chain().focus().toggleBold().run(), () => editor.isActive("bold"), () => editor.can().toggleBold()],
    ["italic", t("summary.visual.italic"), () => editor.chain().focus().toggleItalic().run(), () => editor.isActive("italic"), () => editor.can().toggleItalic()],
    ["strike", t("summary.visual.strike"), () => editor.chain().focus().toggleStrike().run(), () => editor.isActive("strike"), () => editor.can().toggleStrike()],
    ["heading", t("summary.visual.heading"), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), () => editor.isActive("heading"), () => editor.can().toggleHeading({ level: 2 })],
    ["bullet", t("summary.visual.bulletList"), () => editor.chain().focus().toggleBulletList().run(), () => editor.isActive("bulletList"), () => editor.can().toggleBulletList()],
    ["ordered", t("summary.visual.orderedList"), () => editor.chain().focus().toggleOrderedList().run(), () => editor.isActive("orderedList"), () => editor.can().toggleOrderedList()],
    ["formula", t("summary.toolbar.formula"), insertFormula, () => false, () => true],
    ["image", t("summary.toolbar.image"), () => picker.click(), () => false, () => true],
    ["pdf", t("summary.toolbar.pdf"), insertPdfCrop, () => false, () => true],
    ["undo", t("summary.visual.undo"), () => editor.chain().focus().undo().run(), () => false, () => editor.can().undo()],
    ["redo", t("summary.visual.redo"), () => editor.chain().focus().redo().run(), () => false, () => editor.can().redo()],
  ].map(([key, label, run, active, can]) => ({ key, el: button(label, key, run), active, can }));
  toolbar.append(...tools.map((tool) => tool.el), picker);
  const refreshTools = () => {
    if (!editor) return;
    for (const tool of tools) {
      tool.el.setAttribute("aria-pressed", String(tool.active()));
      tool.el.disabled = !tool.can();
    }
  };

  editor = new Editor({
    element: surface,
    extensions: extensions({ editFormula, openSource }),
    content: { type: "doc", content: [{ type: "paragraph" }] }, // replaced right away by load(); an editor document always holds one block
    injectCSS: false, // the styles live in styles.css; Tiptap would otherwise add a <style> element of its own
    enableContentCheck: true,
    editorProps: {
      attributes: { class: "summary-visual-content", role: "textbox", "aria-multiline": "true", "aria-label": t("summary.visual.label"), spellcheck: "true" },
      handlePaste: (view, event) => {
        const file = [...(event.clipboardData?.items ?? [])].find((item) => item.kind === "file" && item.type.startsWith("image/"))?.getAsFile();
        if (!file) return false; // ordinary paste: Tiptap keeps only what the schema allows (text, lists, formatting), never links or HTML
        event.preventDefault();
        insertImage(file);
        return true;
      },
      // a file dropped on the text must never navigate the window to it: images go through the same details dialog, anything else is ignored
      handleDrop: (view, event) => {
        const files = [...(event.dataTransfer?.files ?? [])];
        if (files.length === 0) return false;
        event.preventDefault();
        const image = files.find((file) => ACCEPTED_IMAGE_TYPES.includes(file.type));
        if (image) insertImage(image);
        else status.textContent = t("summary.image.unsupported");
        return true;
      },
    },
    onUpdate: ({ transaction }) => {
      if (!transaction.docChanged) return;
      pending = true;
      clearTimeout(timer);
      timer = setTimeout(writeBack, 250);
    },
    onTransaction: refreshTools,
    onBlur: () => writeBack(),
  });
  surface.addEventListener("focusout", (event) => { if (!surface.contains(event.relatedTarget)) writeBack(); });

  load(textarea.value);
  refreshTools();

  return {
    root,
    flush: writeBack,
    isBlocked: () => blocked,
    reload() { if (textarea.value !== lastValue) { load(textarea.value); refreshTools(); } },
    focus: () => editor.commands.focus(),
    destroy() { clearTimeout(timer); editor.destroy(); },
  };
}
