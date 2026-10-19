// Draws a Resumo Mestre (summary_body) as DOM: headings, paragraphs, lists, tables, KaTeX formulas and figures.
// Nothing here uses innerHTML for user text: text goes through textContent and formulas through katex.render with trust:false,
// so a hostile summary can at worst show an error-colored formula, never run code or load a foreign URL.
import katex from "katex";
import "katex/dist/katex.min.css";
import { inlineParts, parseSummary } from "../shared/summary-markup.js";
import { t } from "./i18n/index.js";

const MAX_MACRO_EXPANSION = 1000;

function renderMath(tex, displayMode) {
  const el = document.createElement(displayMode ? "div" : "span");
  el.className = displayMode ? "summary-math summary-math-display" : "summary-math";
  try {
    katex.render(tex, el, { displayMode, throwOnError: true, trust: false, maxExpand: MAX_MACRO_EXPANSION, strict: "ignore" });
  } catch {
    // Invalid formula: keep what the author typed, visibly marked, instead of hiding it or breaking the whole summary.
    el.textContent = displayMode ? `$$ ${tex} $$` : `$${tex}$`;
    el.classList.add("summary-math-error");
    el.title = t("summary.math.invalid");
  }
  return el;
}

function appendParts(parent, parts) {
  for (const part of parts) parent.append(part.type === "math" ? renderMath(part.tex, false) : document.createTextNode(part.text));
}

function inlineElement(tag, className, parts) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  appendParts(el, parts);
  return el;
}

function renderTable(block) {
  const wrap = document.createElement("div");
  wrap.className = "summary-table-wrap";
  const table = document.createElement("table");
  table.className = "summary-table";
  const head = table.createTHead().insertRow();
  block.header.forEach((cell, k) => {
    const th = document.createElement("th");
    th.scope = "col";
    if (block.align[k]) th.style.textAlign = block.align[k];
    appendParts(th, cell.parts);
    head.append(th);
  });
  const body = table.createTBody();
  for (const row of block.rows) {
    const tr = body.insertRow();
    row.forEach((cell, k) => {
      const td = tr.insertCell();
      if (block.align[k]) td.style.textAlign = block.align[k];
      appendParts(td, cell.parts);
    });
  }
  wrap.append(table);
  return wrap;
}

function renderFigure(block, figureSrc) {
  const figure = document.createElement("figure");
  figure.className = "summary-figure";
  const src = figureSrc?.(block.figureId);
  if (src) {
    const img = document.createElement("img");
    img.src = src;
    img.alt = block.alt;
    img.loading = "lazy";
    figure.append(img);
  } else {
    const missing = document.createElement("p");
    missing.className = "summary-figure-missing";
    missing.textContent = block.alt ? t("summary.figure.unavailableNamed", { alt: block.alt }) : t("summary.figure.unavailable");
    figure.append(missing);
  }
  if (block.caption) {
    const cap = document.createElement("figcaption");
    cap.textContent = block.caption;
    figure.append(cap);
  }
  return figure;
}

function renderBlock(block, figureSrc) {
  switch (block.type) {
    case "heading": {
      const h = document.createElement(`h${Math.min(block.level + 2, 6)}`);
      h.className = "summary-heading";
      h.textContent = block.text;
      return h;
    }
    case "paragraph": return inlineElement("p", "summary-paragraph", block.parts);
    case "math": return renderMath(block.tex, true);
    case "list": {
      const list = document.createElement(block.ordered ? "ol" : "ul");
      list.className = "summary-list";
      for (const item of block.items) list.append(inlineElement("li", "", inlineParts(item)));
      return list;
    }
    case "table": return renderTable(block);
    case "figure": return renderFigure(block, figureSrc);
    default: return document.createComment("");
  }
}

// Same-origin (or the configured API origin) and cookie-authenticated, exactly like the original-PDF link: the owner sees the image, nobody else does.
function ownerFigureUrl(id) {
  const base = (typeof window !== "undefined" && window.__SMARTLEARN_API_BASE__) || "";
  return `${base}/v1/summary-figures/${id}`;
}

/** Replaces the children of `container` with the rendered summary. `figureSrc(id)` returns an image URL or null. */
export function renderSummary(container, text, { figureSrc = ownerFigureUrl } = {}) {
  container.classList.add("summary-rendered");
  container.replaceChildren(...parseSummary(text).map((block) => renderBlock(block, figureSrc)));
  return container;
}
