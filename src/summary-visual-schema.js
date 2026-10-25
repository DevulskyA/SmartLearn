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
import Blockquote from "@tiptap/extension-blockquote";
import CodeBlock from "@tiptap/extension-code-block";
import HorizontalRule from "@tiptap/extension-horizontal-rule";
import { Table, TableRow, TableHeader, TableCell } from "@tiptap/extension-table";
import { UndoRedo } from "@tiptap/extensions";
import { NodeSelection } from "@tiptap/pm/state";
import { figureRef, UUID_PATTERN } from "../shared/summary-figure-refs.js";

const BLOCK_TYPES = ["paragraph", "heading", "bulletList", "orderedList", "blockquote", "table", "codeBlock", "horizontalRule", "mathBlock", "figure", "rawBlock"];

// Bookkeeping that lets an untouched block be written back as its original bytes (see shared/summary-doc.js). Never rendered.
// `loose` is the list spacing (blank lines between items), which is part of the text and must survive an edit.
export const SourceMemory = Extension.create({
  name: "sourceMemory",
  addGlobalAttributes() {
    const memory = { default: null, rendered: false, keepOnSplit: false };
    return [
      { types: BLOCK_TYPES, attributes: { origin: memory, canon: memory, gap: memory } },
      { types: ["tableHeader", "tableCell"], attributes: { align: { default: null, rendered: false } } },
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
  // pasted HTML may carry the attribute, but only a well-formed asset id becomes a figure (anything else is reduced to its text); whether the id is
  // really the student's own asset is the server's decision on save and accept
  parseHTML() { return [{ tag: "div[data-figure-id]", getAttrs: (el) => (UUID_PATTERN.test(el.getAttribute("data-figure-id") ?? "") ? { id: el.getAttribute("data-figure-id").toLowerCase() } : false) }]; },
  renderHTML({ node }) { return ["div", { "data-figure-id": node.attrs.id }, figureRef(node.attrs.id)]; },
});

// Markdown that has no visual form here (an indented code block, ...) is carried as an atom holding its exact text: the editor draws it as a preserved
// block with a button to edit it in the Text mode; it is never dropped, reformatted or silently turned into something else.
export const RawBlock = Node.create({
  name: "rawBlock",
  group: "block",
  atom: true,
  selectable: true,
  defining: true,
  addOptions() { return { label: "Markdown", editSource: null }; },
  addAttributes() { return { text: { default: "" } }; },
  parseHTML() { return [{ tag: "pre[data-raw]", priority: 100, getAttrs: (el) => ({ text: el.textContent ?? "" }) }]; },
  renderHTML({ node }) { return ["pre", { "data-raw": "", "aria-label": this.options.label }, node.attrs.text]; },
});

// A quote holds paragraphs only (what Markdown can say without nesting other blocks).
export const Quote = Blockquote.extend({ content: "paragraph+" });

// A table cell holds exactly one paragraph (a Markdown cell is one line of inline text); a line break would not survive the file format, so
// Enter and Shift-Enter move to the next row / do nothing instead of breaking the cell.
function cellNode(base) {
  return base.extend({
    content: "paragraph",
    addKeyboardShortcuts() {
      return { "Shift-Enter": () => true, "Mod-Enter": () => true };
    },
  });
}
export const SummaryTable = Table.configure({ resizable: false, renderWrapper: false });
export const SummaryTableHeader = cellNode(TableHeader);
export const SummaryTableCell = cellNode(TableCell);


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
export function summaryExtensions({ math = [MathInline, MathBlock], figure = Figure, raw = RawBlock, rawLabel = "Markdown", editFormula = null, openSource = null } = {}) {
  const [inlineMath, blockMath] = math;
  return [
    Document, Paragraph, Text, SoftBreak,
    Heading.configure({ levels: [1, 2, 3, 4, 5, 6] }),
    Bold, Italic, Strike, Code,
    HardBreak, BulletList, OrderedList, ListItem,
    inlineMath.configure({ editFormula }),
    blockMath.configure({ editFormula }),
    figure.configure({ openSource }),
    raw.configure({ label: rawLabel }),
    Quote, CodeBlock, HorizontalRule, SummaryTable, TableRow, SummaryTableHeader, SummaryTableCell,
    SourceMemory, UndoRedo,
  ];
}
