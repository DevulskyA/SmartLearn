// The document model of the visual editor (what a Resumo Mestre may contain), with no drawing code, so a plain Node test can check that every
// document produced by shared/summary-doc.js is valid for it. The drawing (node views) is added in src/summary-visual-editor.js.
// The schema has no link, image, script or HTML node: whatever is pasted that does not fit it is reduced to its text.
import { Node, Extension } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import Heading from "@tiptap/extension-heading";
import Bold from "@tiptap/extension-bold";
import Italic from "@tiptap/extension-italic";
import Strike from "@tiptap/extension-strike";
import Code from "@tiptap/extension-code";
import HardBreak from "@tiptap/extension-hard-break";
import { BulletList, OrderedList, ListItem } from "@tiptap/extension-list";
import { UndoRedo } from "@tiptap/extensions";
import { newlineInCode, exitCode } from "@tiptap/pm/commands";
import { NodeSelection } from "@tiptap/pm/state";
import { figureRef } from "../shared/summary-figure-refs.js";

const BLOCK_TYPES = ["paragraph", "heading", "bulletList", "orderedList", "mathBlock", "figure", "rawBlock"];

// Bookkeeping that lets an untouched block be written back as its original bytes (see shared/summary-doc.js). Never rendered.
// `loose` is the list spacing (blank lines between items), which is part of the text and must survive an edit.
export const SourceMemory = Extension.create({
  name: "sourceMemory",
  addGlobalAttributes() {
    const memory = { default: null, rendered: false, keepOnSplit: false };
    return [
      { types: BLOCK_TYPES, attributes: { origin: memory, canon: memory, gap: memory } },
      { types: ["bulletList", "orderedList"], attributes: { loose: { default: false, rendered: false } } },
    ];
  },
});

// A formula is an atom: its text lives in `tex`. It carries no formatting. The drawing is added by the editor.
function mathNode(name, { inline }) {
  return Node.create({
    name,
    group: inline ? "inline" : "block",
    inline,
    atom: true,
    selectable: true,
    marks: "",
    addOptions() { return { editFormula: null }; },
    addAttributes() { return { tex: { default: "" } }; },
    parseHTML() { return [{ tag: `${inline ? "span" : "div"}[data-math]`, getAttrs: (el) => ({ tex: el.getAttribute("data-math") ?? "" }) }]; },
    renderHTML({ node }) { return [inline ? "span" : "div", { "data-math": node.attrs.tex }, node.attrs.tex]; },
    addKeyboardShortcuts() {
      return { Enter: ({ editor }) => {
        const { selection } = editor.state;
        if (!(selection instanceof NodeSelection) || selection.node.type.name !== name) return false;
        this.options.editFormula?.(editor, selection.from, selection.node);
        return true;
      } };
    },
  });
}
export const MathInline = mathNode("mathInline", { inline: true });
export const MathBlock = mathNode("mathBlock", { inline: false });

// A figure is an atom that points at a private asset by id (`[[fig:UUID]]`); caption, description and provenance live in the asset record.
export const Figure = Node.create({
  name: "figure",
  group: "block",
  atom: true,
  selectable: true,
  addOptions() { return { openSource: null }; },
  addAttributes() { return { id: { default: "" } }; },
  parseHTML() { return [{ tag: "div[data-figure-id]", getAttrs: (el) => ({ id: el.getAttribute("data-figure-id") ?? "" }) }]; },
  renderHTML({ node }) { return ["div", { "data-figure-id": node.attrs.id }, figureRef(node.attrs.id)]; },
});

// Markdown that has no visual form here (tables, quotes, code, rules ...) stays as plain editable text, never dropped or reformatted.
export const RawBlock = Node.create({
  name: "rawBlock",
  group: "block",
  content: "text*",
  marks: "",
  code: true,
  defining: true,
  addOptions() { return { label: "Markdown" }; },
  parseHTML() { return [{ tag: "pre[data-raw]", preserveWhitespace: "full" }]; },
  renderHTML() { return ["pre", { "data-raw": "", "aria-label": this.options.label }, ["code", 0]]; },
  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => (editor.isActive("rawBlock") ? newlineInCode(editor.state, editor.view.dispatch) : false),
      "Mod-Enter": ({ editor }) => (editor.isActive("rawBlock") ? exitCode(editor.state, editor.view.dispatch) : false),
    };
  },
});

// A line break that came from the text itself (a single newline inside a paragraph), kept distinct from a deliberate "hard" break.
export const SoftBreak = Node.create({
  name: "softBreak",
  group: "inline",
  inline: true,
  selectable: false,
  parseHTML() { return [{ tag: "br[data-soft]" }]; },
  renderHTML() { return ["br", { "data-soft": "" }]; },
});

/** Every extension of the editor, in one list, so the Node test and the browser build the very same schema. */
export function summaryExtensions({ math = [MathInline, MathBlock], figure = Figure, rawLabel = "Markdown", editFormula = null, openSource = null } = {}) {
  const [inlineMath, blockMath] = math;
  return [
    Document, Paragraph, Text, SoftBreak,
    Heading.configure({ levels: [1, 2, 3, 4, 5, 6] }),
    Bold, Italic, Strike, Code,
    HardBreak, BulletList, OrderedList, ListItem,
    inlineMath.configure({ editFormula }),
    blockMath.configure({ editFormula }),
    figure.configure({ openSource }),
    RawBlock.configure({ label: rawLabel }),
    SourceMemory, UndoRedo,
  ];
}
