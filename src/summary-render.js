// The single presentation component of the Resumo Mestre: markdown tokens -> DOM, used by EVERY screen that shows the summary.
// Nothing here uses innerHTML for user text: text goes through text nodes and formulas through katex.render, so a hostile summary can at
// worst show an error-marked formula, never run code or load a foreign URL. Figures are references to the owner's private assets only.
import "katex/dist/katex.min.css";
import { parseSummaryTokens, locateMath } from "../shared/summary-markdown.js";
import { katex, katexOptions } from "../shared/summary-math.js";
import { t } from "./i18n/index.js";
import { loadFigureRecord } from "./visual-assets-api.js";
import { isFigureWidth } from "../shared/summary-figure-refs.js";
import { openFigureViewer } from "./figure-ui.js";
import { openSourcePage } from "./source-details-ui.js";

const BLOCK_TAGS = new Set(["p", "ul", "ol", "li", "blockquote", "table", "thead", "tbody", "tr", "th", "td"]);
const INLINE_TAGS = new Set(["strong", "em", "s"]);

function renderMath(tex, displayMode, ctx, location) {
  const el = document.createElement(displayMode ? "div" : "span");
  el.className = displayMode ? "summary-math summary-math-display" : "summary-math";
  const editable = ctx.onEditMath && location && location.start >= 0;
  try {
    katex.render(tex, el, katexOptions(displayMode));
    if (editable) {
      el.classList.add("summary-math-editable");
      el.tabIndex = 0;
      el.setAttribute("role", "button");
      el.setAttribute("aria-label", t("summary.math.edit"));
      el.title = t("summary.math.edit");
      const open = () => ctx.onEditMath(location);
      el.addEventListener("click", open);
      el.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); } });
    }
  } catch (err) {
    // Invalid formula: say so, show what the author typed, and offer the fix where the text can be edited. Never hide it.
    el.className = `${el.className} summary-math-error`;
    el.replaceChildren();
    const message = document.createElement("span");
    message.className = "summary-math-error-message";
    message.textContent = `${t("summary.math.invalid")}: ${String(err?.message ?? err).replace(/^KaTeX parse error:\s*/, "")}`;
    const original = document.createElement("code");
    original.className = "summary-math-original";
    original.textContent = tex;
    el.append(message, " ", original);
    if (editable) {
      const fix = document.createElement("button");
      fix.type = "button";
      fix.className = "text-button summary-math-fix";
      fix.textContent = t("summary.math.fix");
      fix.addEventListener("click", () => ctx.onEditMath(location));
      el.append(" ", fix);
    }
  }
  return el;
}

function unavailableFigure(id, reason) {
  const missing = document.createElement("p");
  missing.className = "summary-figure-missing";
  missing.dataset.figureId = id;
  missing.textContent = reason === "loading" ? t("summary.figure.loading") : t("summary.figure.unavailableId", { id: id.slice(0, 8) });
  return missing;
}

function drawFigure(figure, id, record, ctx) {
  figure.replaceChildren();
  const img = document.createElement("img");
  img.src = record.url;
  img.alt = record.alt;
  // reading screens load images when they come near; the editor loads them at once: a figure that was just moved or inserted must have its real height
  // (a lazy image below the fold is 0 px tall, and the resize handles would measure that)
  img.loading = ctx.eager ? "eager" : "lazy";
  img.tabIndex = 0;
  img.addEventListener("error", () => figure.replaceChildren(unavailableFigure(id, "missing")));
  const open = () => ctx.onOpenFigure?.(record);
  if (ctx.onOpenFigure) {
    img.classList.add("summary-figure-zoomable");
    img.setAttribute("role", "button");
    img.addEventListener("click", open);
    img.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); } });
  }
  figure.append(img);
  if (record.caption) {
    const cap = document.createElement("figcaption");
    cap.textContent = record.caption;
    figure.append(cap);
  }
}

// A figure is the owner's private asset: loaded by id through `ctx.loadFigure`. Unknown or unavailable ones show an explicit marker.
function renderFigure(id, ctx, width = null) {
  const figure = document.createElement("figure");
  figure.className = "summary-figure";
  figure.dataset.figureId = id;
  // this occurrence's display width (CSS pixels, validated by the parser); CSS caps it at the available width, so a narrow window shows the whole
  // image without touching the stored size, and the height follows the image's own proportion
  if (isFigureWidth(width)) {
    figure.dataset.figureWidth = String(width);
    figure.style.setProperty("--figure-width", `${width}px`);
  }
  if (!ctx.loadFigure) {
    figure.append(unavailableFigure(id, "missing"));
    return figure;
  }
  figure.append(unavailableFigure(id, "loading"));
  Promise.resolve(ctx.loadFigure(id)).then(
    (record) => (record ? drawFigure(figure, id, record, ctx) : figure.replaceChildren(unavailableFigure(id, "missing"))),
    () => figure.replaceChildren(unavailableFigure(id, "missing")),
  );
  return figure;
}

function alignOf(token) {
  const style = token.attrGet?.("style") ?? "";
  const m = /text-align:(left|right|center)/.exec(style);
  return m ? m[1] : null;
}

function appendInline(parent, children, ctx) {
  const stack = [parent];
  const top = () => stack[stack.length - 1];
  for (const child of children ?? []) {
    if (child.type === "text") top().append(document.createTextNode(child.content));
    else if (child.type === "softbreak") top().append(document.createTextNode("\n"));
    else if (child.type === "hardbreak") top().append(document.createElement("br"));
    else if (child.type === "code_inline") { const c = document.createElement("code"); c.textContent = child.content; top().append(c); }
    else if (child.type === "math_inline") top().append(renderMath(child.content, false, ctx, ctx.nextMath()));
    else if (child.nesting === 1 && INLINE_TAGS.has(child.tag)) { const el = document.createElement(child.tag); top().append(el); stack.push(el); }
    else if (child.nesting === -1 && INLINE_TAGS.has(child.tag) && stack.length > 1) stack.pop();
  }
}

function appendHeading(token, stack, top) {
  const heading = document.createElement(`h${Math.min(Number(token.tag.slice(1)) + 2, 6)}`);
  heading.className = "summary-heading";
  top().append(heading);
  stack.push(heading);
}

function appendParagraph(token, stack, top) {
  if (token.hidden) return; // tight list item: the text goes straight into the item
  const paragraph = document.createElement("p");
  paragraph.className = "summary-paragraph";
  top().append(paragraph);
  stack.push(paragraph);
}

function appendList(token, stack, top) {
  const list = document.createElement(token.tag === "ol" ? "ol" : "ul");
  list.className = "summary-list";
  top().append(list);
  stack.push(list);
}

function appendBlockElement(token, stack, top) {
  const element = document.createElement(token.tag);
  if (token.tag === "table") element.className = "summary-table";
  if (token.tag === "th" || token.tag === "td") {
    const alignment = alignOf(token);
    if (alignment) element.style.textAlign = alignment;
    if (token.tag === "th") element.scope = "col";
  }
  if (token.tag === "table") {
    const wrapper = document.createElement("div");
    wrapper.className = "summary-table-wrap";
    wrapper.append(element);
    top().append(wrapper);
  } else top().append(element);
  stack.push(element);
}

function appendCodeBlock(token, top) {
  const pre = document.createElement("pre");
  const code = document.createElement("code");
  code.textContent = token.content;
  pre.append(code);
  top().append(pre);
}

function appendOtherBlock(token, stack, top, ctx) {
  if (token.nesting === 1 && BLOCK_TAGS.has(token.tag)) {
    appendBlockElement(token, stack, top);
  } else if (token.nesting === -1 && BLOCK_TAGS.has(token.tag)) {
    stack.pop();
  } else if (token.type === "hr") {
    top().append(document.createElement("hr"));
  } else if (token.type === "fence" || token.type === "code_block") {
    appendCodeBlock(token, top);
  } else if (token.type === "math_block") {
    top().append(renderMath(token.content, true, ctx, ctx.nextMath()));
  } else if (token.type === "figure") {
    top().append(renderFigure(token.meta.id, ctx, token.meta.width ?? null));
  }
}

function appendBlockToken(token, stack, top, ctx) {
  if (token.type === "inline") {
    appendInline(top(), token.children, ctx);
  } else if (token.type === "heading_open") {
    appendHeading(token, stack, top);
  } else if (token.type === "heading_close") {
    stack.pop();
  } else if (token.type === "paragraph_open") {
    appendParagraph(token, stack, top);
  } else if (token.type === "paragraph_close") {
    if (!token.hidden) stack.pop();
  } else if (token.type === "bullet_list_open" || token.type === "ordered_list_open") {
    appendList(token, stack, top);
  } else if (token.type === "bullet_list_close" || token.type === "ordered_list_close") {
    stack.pop();
  } else {
    appendOtherBlock(token, stack, top, ctx);
  }
}

function buildBlocks(tokens, root, ctx) {
  const stack = [root];
  const top = () => stack[stack.length - 1];
  for (const token of tokens) appendBlockToken(token, stack, top, ctx);
}

/** One formula drawn exactly as on every screen (an invalid one shows its message and original text); `onEdit` makes it clickable. For the visual editor. */
export function renderMathElement(tex, displayMode, onEdit = null) {
  return renderMath(tex, displayMode, { onEditMath: onEdit ? () => onEdit() : null }, onEdit ? { start: 0 } : null);
}

/** One figure drawn exactly as on every screen, inside a host element that stays the same when the figure's texts are edited. For the visual editor. */
export function renderFigureElement(id, { loadFigure = loadFigureRecord, onOpenSource = openSourcePage } = {}) {
  const host = document.createElement("div");
  host.className = "summary-figure-host";
  const draw = () => {
    const ctx = { eager: true, loadFigure, onOpenFigure: (record) => openFigureViewer(record, { onOpenSource, onEdited: draw }) };
    host.replaceChildren(renderFigure(id, ctx));
  };
  draw();
  return host;
}

/**
 * The table of contents of a rendered summary, in the left margin like a PDF reader's navigation pane: one entry per heading, each moving
 * the reading position to that heading INSIDE the page (no hash links: the app's own routing lives in the hash). Offered only when the
 * summary has at least two headings; `nav` is emptied and hidden otherwise.
 */
export function renderSummaryOutline(nav, container) {
  const headings = [...container.querySelectorAll(".summary-heading")];
  nav.replaceChildren();
  nav.hidden = headings.length < 2;
  if (nav.hidden) return;
  const title = document.createElement("p");
  title.className = "summary-outline-title";
  title.textContent = t("summary.outline.title");
  const list = document.createElement("ul");
  list.className = "summary-outline-list";
  for (const heading of headings) {
    const level = Number(heading.tagName.slice(1)); // h3 = a section, h4 and below = its subsections
    const item = document.createElement("li");
    item.style.setProperty("--outline-level", String(Math.max(level - 3, 0)));
    const go = document.createElement("button");
    go.type = "button";
    go.className = "text-button summary-outline-item";
    go.textContent = heading.textContent;
    go.addEventListener("click", () => {
      heading.tabIndex = -1;
      const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      heading.scrollIntoView({ block: "start", behavior: calm ? "auto" : "smooth" });
      heading.focus({ preventScroll: true });
    });
    item.append(go);
    list.append(item);
  }
  nav.append(title, list);
}

/**
 * Replaces the children of `container` with the rendered summary.
 *   onEditMath(location)  - makes formulas clickable (and invalid ones fixable); location = {kind, tex, start, end} in the source text
 *   loadFigure(id)        - async: {url, alt, caption, ...} for a figure the owner can see, or null
 *   onOpenFigure(record)  - enlarges a figure
 */
export function renderSummary(container, text, options = {}) {
  const source = String(text ?? "");
  const { onEditMath = null, loadFigure = loadFigureRecord, onOpenSource = openSourcePage } = options;
  const locations = onEditMath ? locateMath(source) : [];
  let mathIndex = 0;
  // by default a figure opens enlarged, with a way to edit its texts; after an edit the same summary is drawn again
  const onOpenFigure = options.onOpenFigure ?? ((record) => openFigureViewer(record, { onOpenSource, onEdited: () => renderSummary(container, source, options) }));
  const ctx = { onEditMath, loadFigure, onOpenFigure, nextMath: () => locations[mathIndex++] ?? null };
  container.classList.add("summary-rendered");
  const root = document.createDocumentFragment();
  buildBlocks(parseSummaryTokens(source), root, ctx);
  container.replaceChildren(root);
  return container;
}
