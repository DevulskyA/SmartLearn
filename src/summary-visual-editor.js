// The visual editor of the Resumo Mestre (Tiptap / ProseMirror, bundled locally, loaded only when the student opens the summary).
// It is a VIEW over the same text: the textarea stays the single source of truth that the screens save, version and audit. Every edit is
// converted back to the controlled Markdown by shared/summary-doc.js, which keeps untouched blocks byte for byte, carries what the editor
// cannot model as a preserved block (shown rendered, with a way to edit it in the Text mode), and REFUSES (instead of guessing) what it
// could not write back faithfully.
// Nothing here uses innerHTML for user text, and the schema has no link, image, script or HTML node, so pasted HTML cannot become any of them.
import { Editor } from "@tiptap/core";
import { Gapcursor } from "@tiptap/extensions";
import { createTable } from "@tiptap/extension-table";
import { EditorState } from "@tiptap/pm/state";
import { markdownToDoc, serializeVerified } from "../shared/summary-doc.js";
import { mathProblem } from "../shared/summary-math.js";
import { MathInline, MathBlock, Figure, RawBlock, summaryExtensions } from "./summary-visual-schema.js";
import { t } from "./i18n/index.js";
import { openMathDialog, loadMathLive } from "./math-dialog.js";
import { renderMathElement, renderFigureElement, renderSummary } from "./summary-render.js";
import { openFigureDetailsDialog, ACCEPTED_IMAGE_TYPES } from "./figure-ui.js";
import { openPdfCropDialog } from "./pdf-crop-dialog.js";

const SVG_NS = "http://www.w3.org/2000/svg";
// Small line icons (24x24, drawn with the text colour). Tools without an icon use a letter or a symbol as their face.
const ICONS = {
  bullet: "M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",
  table: "M3 5h18v14H3zM3 10h18M3 15h18M9 5v14M15 5v14",
  image: "M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M8.5 9.5h.01",
  pdf: "M6 3h9l4 4v14H6zM14 3v5h5M9 14h6M9 17h6",
  hr: "M3 12h18",
  quote: "M5 7h5v5H7l-1 4H4l1-4zM14 7h5v5h-3l-1 4h-2l1-4z",
  code: "M9 7l-5 5 5 5M15 7l5 5-5 5",
  undo: "M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3",
  redo: "M15 14l5-5-5-5M20 9H10a6 6 0 000 12h3",
};

function icon(name) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "20");
  svg.setAttribute("height", "20");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", ICONS[name]);
  svg.append(path);
  return svg;
}

function face(spec) {
  if (spec.icon) return icon(spec.icon);
  const span = document.createElement("span");
  span.setAttribute("aria-hidden", "true");
  span.className = `summary-visual-face${spec.faceClass ? ` ${spec.faceClass}` : ""}`;
  span.textContent = spec.face;
  return span;
}

function button(spec, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = `summary-visual-btn${spec.wide ? " summary-visual-btn-text" : ""}`;
  b.dataset.visual = spec.key;
  b.setAttribute("aria-label", spec.label);
  b.title = spec.label;
  if (spec.wide) b.textContent = spec.label;
  else b.append(face(spec));
  b.addEventListener("mousedown", (event) => event.preventDefault()); // clicking a tool keeps the caret in the text
  b.addEventListener("click", onClick);
  return b;
}

/**
 * Builds the visual editor over `textarea`. Returns { root, flush, reload, isBlocked, focus, destroy }.
 *   flush()     writes pending edits to the textarea now (call before saving)
 *   reload()    re-reads the textarea when something else changed it (a saved or re-audited draft)
 *   isBlocked() true while the last edit could not be written back faithfully (the textarea then still holds the last faithful text)
 * `openSource` opens the PDF page a figure came from; `editInText(text)` switches to the Text mode on a preserved block.
 */
export function createVisualSummaryEditor(textarea, { openSource = null, editInText = null } = {}) {
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
  // a formula being typed in place: its text is not part of the document until it is confirmed, so nothing is written back meanwhile
  const formulaSession = { commit: null };

  const setBlocked = (state) => {
    blocked = state;
    notice.hidden = !state;
    notice.textContent = state ? t("summary.visual.cannotWrite") : "";
    root.dataset.sync = state ? "blocked" : "ok";
  };

  function writeBack(force = false) {
    // a formula being typed in place keeps the document as it was; only an explicit flush (saving, leaving) confirms it first
    if (formulaSession.commit) {
      if (!force) return;
      formulaSession.commit();
      if (formulaSession.commit) return; // the formula is not valid yet: nothing is written
    }
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

  // ---- drawing of the atoms -----------------------------------------------------------------------------------------
  // A formula is drawn by KaTeX like on every screen; activating it (click, Enter) turns it into a visual MathLive field IN PLACE, and
  // confirming (Enter, leaving it) draws it again. Chemistry (\ce, \pu) cannot be edited visually: the dialog handles those.
  const mathView = (base, inline) => base.extend({
    addNodeView() {
      return ({ node: first, getPos, editor: ed }) => {
        let current = first;
        let field = null;
        let starting = false;
        const dom = document.createElement(inline ? "span" : "div");
        dom.className = inline ? "summary-math-node" : "summary-math-node summary-math-node-block";
        dom.contentEditable = "false";
        const draw = () => { if (!field) dom.replaceChildren(renderMathElement(current.attrs.tex, !inline, () => startEdit())); };
        const apply = (tex) => ed.view.dispatch(ed.state.tr.setNodeMarkup(getPos(), undefined, { ...current.attrs, tex }));
        const remove = () => { const pos = getPos(); ed.view.dispatch(ed.state.tr.delete(pos, pos + current.nodeSize)); };

        function finish(confirm) {
          if (!field) return true;
          const value = field.getValue("latex").trim();
          if (confirm && value !== "") {
            const problem = mathProblem(value, !inline);
            if (problem) { field.setAttribute("aria-invalid", "true"); status.textContent = `${t("summary.math.invalid")}: ${problem}`; return false; }
          }
          status.textContent = "";
          const old = field;
          field = null;
          formulaSession.commit = null;
          old.remove();
          if (confirm && value !== "") { if (value !== current.attrs.tex) apply(value); else draw(); }
          else if (current.attrs.tex === "") remove(); // a new formula that was never typed leaves no trace
          else draw();
          ed.commands.focus();
          return true;
        }

        async function viaDialog() {
          const chosen = await openMathDialog({ tex: current.attrs.tex, display: !inline, lockDisplay: true });
          if (chosen) apply(chosen.tex);
          else if (current.attrs.tex === "") remove();
          ed.commands.focus();
        }

        async function startEdit() {
          if (field || starting) return;
          starting = true;
          try {
            if (/\\(?:ce|pu)\b/.test(current.attrs.tex)) { await viaDialog(); return; }
            let module;
            try { module = await loadMathLive(); } catch { await viaDialog(); return; }
            if (field) return;
            field = new module.MathfieldElement();
            field.className = "summary-math-field";
            field.setAttribute("aria-label", t("summary.math.inplace"));
            field.mathVirtualKeyboardPolicy = "auto";
            field.value = current.attrs.tex;
            field.addEventListener("keydown", (event) => {
              if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.stopPropagation(); finish(true); }
              else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); finish(false); }
            });
            const openedAt = Date.now();
            let focusField = () => {};
            field.addEventListener("focusout", () => setTimeout(() => {
              if (!field) return;
              if (Date.now() - openedAt < 500) { focusField(); return; } // the text takes the focus back right after an insertion: the field asks for it again
              const active = document.activeElement;
              if (dom.contains(active) || active?.closest?.(".MLK__backdrop, .ML__keyboard, .ML__popover")) return;
              finish(true);
            }, 0));
            dom.replaceChildren(field);
            formulaSession.commit = () => finish(true);
            // MathLive finishes attaching asynchronously: take the focus again until it holds it, or the typed keys would go to the page
            let tries = 0;
            focusField = () => {
              if (!field) return;
              field.focus();
              if (document.activeElement === field) { field.dataset.ready = "true"; return; }
              if ((tries += 1) < 30) requestAnimationFrame(focusField);
            };
            focusField();
          } finally { starting = false; }
        }
        dom.startEdit = startEdit;
        draw();
        return {
          dom,
          update(next) { if (next.type !== current.type) return false; current = next; draw(); return true; },
          stopEvent: (event) => Boolean(field) && dom.contains(event.target),
          ignoreMutation: () => true,
          destroy() { if (formulaSession.commit && field) formulaSession.commit = null; },
        };
      };
    },
  });
  const MathInlineView = mathView(MathInline, true);
  const MathBlockView = mathView(MathBlock, false);

  const FigureView = Figure.extend({
    addNodeView() {
      return ({ node }) => {
        const dom = renderFigureElement(node.attrs.id, { onOpenSource: this.options.openSource ?? undefined });
        dom.contentEditable = "false";
        return { dom, update: (next) => next.type === node.type && next.attrs.id === node.attrs.id, stopEvent: () => false, ignoreMutation: () => true };
      };
    },
  });

  // Markdown with no visual form is shown as it will look (rendered), marked as preserved, with a button to edit its text in the Text mode.
  const RawView = RawBlock.extend({
    addNodeView() {
      return ({ node: first }) => {
        let current = first;
        const dom = document.createElement("div");
        dom.className = "summary-raw";
        dom.contentEditable = "false";
        const note = document.createElement("p");
        note.className = "summary-raw-note";
        note.textContent = t("summary.visual.rawNote");
        const preview = document.createElement("div");
        preview.className = "summary-raw-preview";
        const edit = document.createElement("button");
        edit.type = "button";
        edit.className = "secondary-button summary-raw-edit";
        edit.textContent = t("summary.visual.rawEdit");
        edit.addEventListener("click", () => editInText?.(current.attrs.text));
        edit.hidden = !editInText;
        dom.append(note, preview, edit);
        const draw = () => renderSummary(preview, current.attrs.text);
        draw();
        return {
          dom,
          update(next) { if (next.type !== current.type) return false; current = next; draw(); return true; },
          stopEvent: (event) => event.target instanceof Element && Boolean(event.target.closest("button")),
          ignoreMutation: () => true,
        };
      };
    },
  });

  const extensions = [
    ...summaryExtensions({
      math: [MathInlineView, MathBlockView],
      figure: FigureView,
      raw: RawView,
      editFormula: (ed, pos) => ed.view.nodeDOM(pos)?.startEdit?.(),
      openSource,
    }),
    Gapcursor,
  ];

  // ---- inserting things ---------------------------------------------------------------------------------------------
  const topLevelEnd = () => { const { $to } = editor.state.selection; return $to.depth === 0 ? $to.pos : $to.after(1); };
  function insertBlock(node) {
    const { $from } = editor.state.selection;
    const emptyParagraph = $from.depth === 1 && $from.parent.type.name === "paragraph" && $from.parent.content.size === 0;
    if (emptyParagraph) editor.chain().focus().insertContentAt({ from: $from.before(1), to: $from.after(1) }, node).run();
    else editor.chain().focus().insertContentAt(topLevelEnd(), node).run();
  }
  function startEmptyFormula(display) {
    if (display) insertBlock({ type: "mathBlock", attrs: { tex: "" } });
    else editor.chain().focus().insertContentAt(editor.state.selection.to, { type: "mathInline", attrs: { tex: "" } }).run();
    let found = -1;
    editor.state.doc.descendants((node, pos) => { if (found === -1 && node.type.name.startsWith("math") && node.attrs.tex === "") found = pos; });
    // the node view is drawn in the next frame, and Tiptap hands the focus back to the text a moment after the command: the field opens after both
    if (found >= 0) setTimeout(() => editor.view.nodeDOM(found)?.startEdit?.(), 80);
  }
  function insertTable() {
    const table = createTable(editor.schema, 3, 3, true);
    insertBlock(table.toJSON());
    // the caret goes to the first (header) cell, so the student can type the first title at once
    const { $from } = editor.state.selection;
    for (let d = $from.depth; d > 0; d -= 1) if ($from.node(d).type.name === "table") { editor.chain().focus().setTextSelection($from.start(d) + 3).run(); break; }
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

  const chain = () => editor.chain().focus();
  const inFirstRow = () => {
    const { $from } = editor.state.selection;
    for (let d = $from.depth; d > 0; d -= 1) if ($from.node(d).type.name === "tableRow") return $from.index(d - 1) === 0;
    return false;
  };
  const inTable = () => editor.isActive("table");
  // adding a row below moves the caret into it, so the student can type straight away
  const addRowBelow = () => {
    if (!chain().addRowAfter().run()) return false;
    const { $from } = editor.state.selection;
    for (let d = $from.depth; d > 0; d -= 1) {
      if ($from.node(d).type.name !== "tableRow") continue;
      const next = $from.after(d);
      return editor.chain().focus().setTextSelection(next + 3).run();
    }
    return true;
  };
  const no = () => false;
  // [group label, [tool ...]]: a tool is { key, label, face|icon, run, active, can, wide }
  const groups = [
    [t("summary.visual.group.history"), [
      { key: "undo", label: t("summary.visual.undo"), icon: "undo", run: () => chain().undo().run(), active: no, can: () => editor.can().undo() },
      { key: "redo", label: t("summary.visual.redo"), icon: "redo", run: () => chain().redo().run(), active: no, can: () => editor.can().redo() },
    ]],
    [t("summary.visual.group.text"), [
      { key: "style", select: true },
      { key: "bold", label: t("summary.visual.bold"), face: "B", faceClass: "summary-face-bold", run: () => chain().toggleBold().run(), active: () => editor.isActive("bold"), can: () => editor.can().toggleBold() },
      { key: "italic", label: t("summary.visual.italic"), face: "I", faceClass: "summary-face-italic", run: () => chain().toggleItalic().run(), active: () => editor.isActive("italic"), can: () => editor.can().toggleItalic() },
      { key: "strike", label: t("summary.visual.strike"), face: "S", faceClass: "summary-face-strike", run: () => chain().toggleStrike().run(), active: () => editor.isActive("strike"), can: () => editor.can().toggleStrike() },
    ]],
    [t("summary.visual.group.blocks"), [
      { key: "bullet", label: t("summary.visual.bulletList"), icon: "bullet", run: () => chain().toggleBulletList().run(), active: () => editor.isActive("bulletList"), can: () => editor.can().toggleBulletList() },
      { key: "ordered", label: t("summary.visual.orderedList"), face: "1.", run: () => chain().toggleOrderedList().run(), active: () => editor.isActive("orderedList"), can: () => editor.can().toggleOrderedList() },
      { key: "quote", label: t("summary.visual.quote"), icon: "quote", run: () => chain().toggleBlockquote().run(), active: () => editor.isActive("blockquote"), can: () => editor.can().toggleBlockquote() },
      { key: "code", label: t("summary.visual.codeBlock"), icon: "code", run: () => chain().toggleCodeBlock().run(), active: () => editor.isActive("codeBlock"), can: () => editor.can().toggleCodeBlock() },
      { key: "rule", label: t("summary.visual.rule"), icon: "hr", run: () => chain().setHorizontalRule().run(), active: no, can: () => editor.can().setHorizontalRule() },
    ]],
    [t("summary.visual.group.insert"), [
      { key: "table", label: t("summary.toolbar.table"), icon: "table", run: insertTable, active: no, can: () => !inTable() },
      { key: "formula", label: t("summary.toolbar.formula"), face: "∑", faceClass: "summary-face-math", run: () => startEmptyFormula(false), active: no, can: () => true },
      { key: "formulaBlock", label: t("summary.visual.formulaBlock"), face: "∑≡", faceClass: "summary-face-math", run: () => startEmptyFormula(true), active: no, can: () => true },
      { key: "image", label: t("summary.toolbar.image"), icon: "image", run: () => picker.click(), active: no, can: () => true },
      { key: "pdf", label: t("summary.toolbar.pdf"), icon: "pdf", run: insertPdfCrop, active: no, can: () => true },
    ]],
    [t("summary.visual.group.table"), [
      { key: "rowBefore", label: t("summary.visual.rowBefore"), wide: true, run: () => chain().addRowBefore().run(), active: no, can: () => !inFirstRow() && editor.can().addRowBefore() },
      { key: "rowAfter", label: t("summary.visual.rowAfter"), wide: true, run: addRowBelow, active: no, can: () => editor.can().addRowAfter() },
      { key: "rowDelete", label: t("summary.visual.rowDelete"), wide: true, run: () => chain().deleteRow().run(), active: no, can: () => !inFirstRow() && editor.can().deleteRow() },
      { key: "colBefore", label: t("summary.visual.colBefore"), wide: true, run: () => chain().addColumnBefore().run(), active: no, can: () => editor.can().addColumnBefore() },
      { key: "colAfter", label: t("summary.visual.colAfter"), wide: true, run: () => chain().addColumnAfter().run(), active: no, can: () => editor.can().addColumnAfter() },
      { key: "colDelete", label: t("summary.visual.colDelete"), wide: true, run: () => chain().deleteColumn().run(), active: no, can: () => editor.can().deleteColumn() },
      { key: "tableDelete", label: t("summary.visual.tableDelete"), wide: true, run: () => chain().deleteTable().run(), active: no, can: () => editor.can().deleteTable() },
    ], "table"],
  ];

  const tools = [];
  const groupElements = [];
  let styleSelect = null;
  for (const [label, specs, kind] of groups) {
    const group = document.createElement("div");
    group.className = "summary-visual-group";
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", label);
    if (kind) group.dataset.contextual = kind;
    for (const spec of specs) {
      if (spec.select) {
        styleSelect = document.createElement("select");
        styleSelect.className = "summary-visual-style";
        styleSelect.dataset.visual = "style";
        styleSelect.setAttribute("aria-label", t("summary.visual.style"));
        for (const [value, text] of [["p", t("summary.visual.style.paragraph")], ["1", t("summary.visual.style.h1")], ["2", t("summary.visual.style.h2")], ["3", t("summary.visual.style.h3")]]) {
          const option = document.createElement("option");
          option.value = value;
          option.textContent = text;
          styleSelect.append(option);
        }
        styleSelect.addEventListener("change", () => {
          const value = styleSelect.value;
          if (value === "p") chain().setParagraph().run();
          else chain().setHeading({ level: Number(value) }).run();
        });
        group.append(styleSelect);
        continue;
      }
      const el = button(spec, spec.run);
      tools.push({ ...spec, el });
      group.append(el);
    }
    toolbar.append(group);
    groupElements.push(group);
  }
  toolbar.append(picker);

  // one tab stop for the whole toolbar; arrows, Home and End move between the controls that are available
  const controls = () => [...toolbar.querySelectorAll("button, select")].filter((el) => !el.disabled && !el.closest("[hidden]"));
  let tabStop = null;
  const syncTabStop = () => {
    const available = controls();
    if (!tabStop || !available.includes(tabStop)) tabStop = available[0] ?? null;
    for (const el of toolbar.querySelectorAll("button, select")) el.tabIndex = el === tabStop ? 0 : -1;
  };
  toolbar.addEventListener("focusin", (event) => { if (event.target instanceof HTMLElement && event.target.matches("button, select")) { tabStop = event.target; syncTabStop(); } });
  toolbar.addEventListener("keydown", (event) => {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
    if (event.target instanceof HTMLSelectElement && ["ArrowRight", "ArrowLeft"].includes(event.key) === false) return;
    const available = controls();
    const at = available.indexOf(document.activeElement);
    if (at < 0) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? available.length - 1 : (at + (event.key === "ArrowRight" ? 1 : -1) + available.length) % available.length;
    tabStop = available[next];
    syncTabStop();
    tabStop.focus();
  });

  const refreshTools = () => {
    if (!editor) return;
    const table = inTable();
    for (const group of groupElements) if (group.dataset.contextual === "table") group.hidden = !table;
    for (const tool of tools) {
      tool.el.setAttribute("aria-pressed", String(tool.active()));
      tool.el.disabled = !tool.can();
    }
    if (styleSelect) {
      const level = editor.isActive("heading") ? [1, 2, 3].find((n) => editor.isActive("heading", { level: n })) : null;
      styleSelect.value = level ? String(level) : "p";
      styleSelect.disabled = !(editor.can().setParagraph() || editor.can().setHeading({ level: 2 }));
    }
    syncTabStop();
  };

  editor = new Editor({
    element: surface,
    extensions,
    content: { type: "doc", content: [{ type: "paragraph" }] }, // replaced right away by load(); an editor document always holds one block
    injectCSS: false, // the styles live in styles.css; Tiptap would otherwise add a <style> element of its own
    enableContentCheck: true,
    editorProps: {
      attributes: { class: "summary-visual-content", role: "textbox", "aria-multiline": "true", "aria-label": t("summary.visual.label"), spellcheck: "true" },
      handlePaste: (view, event) => {
        const file = [...(event.clipboardData?.items ?? [])].find((item) => item.kind === "file" && item.type.startsWith("image/"))?.getAsFile();
        if (!file) return false; // ordinary paste: Tiptap keeps only what the schema allows (text, lists, tables, formatting), never links or HTML
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
    flush: () => writeBack(true),
    isBlocked: () => blocked,
    reload() { if (textarea.value !== lastValue) { load(textarea.value); refreshTools(); } },
    focus: () => editor.commands.focus(),
    destroy() { clearTimeout(timer); formulaSession.commit = null; editor.destroy(); },
  };
}
