// The single presentation component of the Resumo Mestre: markdown tokens -> DOM, used by EVERY screen that shows the summary.
// Nothing here uses innerHTML for user text: text goes through text nodes and formulas through katex.render, so a hostile summary can at
// worst show an error-marked formula, never run code or load a foreign URL. Figures are references to the owner's private assets only.
import "katex/dist/katex.min.css";
import { parseSummaryTokens, locateMath } from "../shared/summary-markdown.js";
import { katex, katexOptions } from "../shared/summary-math.js";
import { t } from "./i18n/index.js";
import { loadFigureRecord } from "./visual-assets-api.js";
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
  img.loading = "lazy";
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
function renderFigure(id, ctx) {
  const figure = document.createElement("figure");
  figure.className = "summary-figure";
  figure.dataset.figureId = id;
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

function buildBlocks(tokens, root, ctx) {
  const stack = [root];
  const top = () => stack[stack.length - 1];
  for (const token of tokens) {
    if (token.type === "inline") { appendInline(top(), token.children, ctx); continue; }
    if (token.type === "heading_open") {
      const h = document.createElement(`h${Math.min(Number(token.tag.slice(1)) + 2, 6)}`);
      h.className = "summary-heading";
      top().append(h);
      stack.push(h);
    } else if (token.type === "heading_close") stack.pop();
    else if (token.type === "paragraph_open") {
      if (token.hidden) continue; // tight list item: the text goes straight into the item
      const p = document.createElement("p");
      p.className = "summary-paragraph";
      top().append(p);
      stack.push(p);
    } else if (token.type === "paragraph_close") { if (!token.hidden) stack.pop(); }
    else if (token.type === "bullet_list_open" || token.type === "ordered_list_open") {
      const list = document.createElement(token.tag === "ol" ? "ol" : "ul");
      list.className = "summary-list";
      top().append(list);
      stack.push(list);
    } else if (token.type === "bullet_list_close" || token.type === "ordered_list_close") stack.pop();
    else if (token.nesting === 1 && BLOCK_TAGS.has(token.tag)) {
      const el = document.createElement(token.tag);
      if (token.tag === "table") el.className = "summary-table";
      if (token.tag === "th" || token.tag === "td") { const a = alignOf(token); if (a) el.style.textAlign = a; if (token.tag === "th") el.scope = "col"; }
      if (token.tag === "table") {
        const wrap = document.createElement("div");
        wrap.className = "summary-table-wrap";
        wrap.append(el);
        top().append(wrap);
      } else top().append(el);
      stack.push(el);
    } else if (token.nesting === -1 && BLOCK_TAGS.has(token.tag)) stack.pop();
    else if (token.type === "hr") top().append(document.createElement("hr"));
    else if (token.type === "fence" || token.type === "code_block") {
      const pre = document.createElement("pre");
      const code = document.createElement("code");
      code.textContent = token.content;
      pre.append(code);
      top().append(pre);
    } else if (token.type === "math_block") top().append(renderMath(token.content, true, ctx, ctx.nextMath()));
    else if (token.type === "figure") top().append(renderFigure(token.meta.id, ctx));
  }
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
