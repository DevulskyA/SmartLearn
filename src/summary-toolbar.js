// Small insert bar for the Resumo Mestre textarea: formula, block formula, table and figure are typed as controlled Markdown at the cursor.
// The textarea stays the single source of truth (summary_body is the plain text); the bar only saves the student from remembering syntax.
import { t } from "./i18n/index.js";
import { apiUpload } from "./api-client.js";

const TABLE_TEMPLATE = "| Coluna 1 | Coluna 2 |\n|---|---|\n| | |";

const blockLead = (value, start) => {
  const before = value.slice(0, start);
  if (start === 0 || before.endsWith("\n\n")) return "";
  return before.endsWith("\n") ? "\n" : "\n\n";
};

/** `![alt](smartlearn-figure:ID "caption")`; `]`/newlines in the alt and `"` in the caption would break the line, so they are flattened. */
export function figureMarkdown(id, alt, caption) {
  const safeAlt = String(alt).replace(/[\]\r\n]+/g, " ").trim();
  const safeCaption = String(caption ?? "").replace(/"/g, "'").replace(/[\r\n]+/g, " ").trim();
  return `![${safeAlt}](smartlearn-figure:${id}${safeCaption ? ` "${safeCaption}"` : ""})`;
}

/** Pure: the new value and the range to select after inserting `kind` over [start, end) of `value`. */
export function applyInsertion(value, start, end, kind, markdown = "") {
  if (kind !== "inline" && start === end) {
    // a block never lands in the middle of a line (or of a formula): it goes after the line the cursor is on
    const eol = value.indexOf("\n", start);
    start = end = eol === -1 ? value.length : eol;
  }
  const selected = value.slice(start, end);
  let snippet;
  let selectFrom;
  let selectTo;
  if (kind === "inline") {
    const inner = selected || "fórmula";
    snippet = `$${inner}$`;
    selectFrom = 1;
    selectTo = 1 + inner.length;
  } else if (kind === "block") {
    const inner = selected || "fórmula";
    const lead = blockLead(value, start);
    snippet = `${lead}$$\n${inner}\n$$\n`;
    selectFrom = lead.length + 3;
    selectTo = selectFrom + inner.length;
  } else if (kind === "figure") {
    const lead = blockLead(value, start);
    snippet = `${lead}${markdown}\n`;
    selectFrom = selectTo = snippet.length;
  } else {
    const lead = blockLead(value, start);
    snippet = `${lead}${TABLE_TEMPLATE}\n`;
    selectFrom = lead.length + 2;
    selectTo = selectFrom + "Coluna 1".length;
  }
  return { value: value.slice(0, start) + snippet + value.slice(end), selectFrom: start + selectFrom, selectTo: start + selectTo };
}

function insertInto(textarea, kind, markdown) {
  const result = applyInsertion(textarea.value, textarea.selectionStart, textarea.selectionEnd, kind, markdown);
  textarea.value = result.value;
  textarea.focus({ preventScroll: true });
  textarea.setSelectionRange(result.selectFrom, result.selectTo);
  textarea.dispatchEvent(new Event("input", { bubbles: true })); // the screens track edits through "input"
}

function labelled(text, input) {
  const label = document.createElement("label");
  label.className = "summary-figure-field";
  label.append(document.createTextNode(`${text} `), input);
  return label;
}

// Picking an image, then its description (required: it is what a screen reader and a failed load show) and an optional caption.
function createFigurePanel(textarea, onDone) {
  const panel = document.createElement("div");
  panel.className = "summary-figure-panel";
  const file = document.createElement("input");
  file.type = "file";
  file.accept = "image/png,image/jpeg,image/webp,image/gif";
  file.className = "summary-figure-file";
  file.setAttribute("aria-label", t("summary.figure.file"));
  const alt = document.createElement("input");
  alt.type = "text";
  alt.maxLength = 300;
  alt.required = true;
  alt.className = "summary-figure-alt";
  const caption = document.createElement("input");
  caption.type = "text";
  caption.maxLength = 200;
  caption.className = "summary-figure-caption";
  const message = document.createElement("span");
  message.className = "form-message summary-figure-message";
  message.setAttribute("role", "status");
  const insert = document.createElement("button");
  insert.type = "button";
  insert.className = "primary-button summary-figure-insert";
  insert.textContent = t("summary.figure.insert");
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "text-button";
  cancel.textContent = t("summary.figure.cancel");
  cancel.addEventListener("click", onDone);
  insert.addEventListener("click", async () => {
    const image = file.files?.[0];
    if (!image) { message.textContent = t("summary.figure.needFile"); return; }
    if (!alt.value.trim()) { message.textContent = t("summary.figure.needAlt"); alt.focus(); return; }
    insert.disabled = true;
    message.textContent = t("summary.figure.uploading");
    try {
      const form = new FormData();
      form.append("file", image, image.name);
      const { figure } = await apiUpload(`/v1/summary-figures?alt=${encodeURIComponent(alt.value.trim())}`, form);
      insertInto(textarea, "figure", figureMarkdown(figure.id, figure.alt, caption.value));
      onDone();
    } catch (err) {
      message.textContent = err?.message || t("summary.figure.failed");
      insert.disabled = false;
    }
  });
  panel.append(labelled(t("summary.figure.file"), file), labelled(t("summary.figure.alt"), alt), labelled(t("summary.figure.caption"), caption), insert, cancel, message);
  return panel;
}

export function createSummaryToolbar(textarea) {
  const bar = document.createElement("div");
  bar.className = "summary-toolbar";
  bar.setAttribute("role", "group");
  bar.setAttribute("aria-label", t("summary.toolbar.label"));
  const buttons = document.createElement("div");
  buttons.className = "summary-toolbar-buttons";
  for (const [kind, key] of [["inline", "summary.toolbar.formula"], ["block", "summary.toolbar.formulaBlock"], ["table", "summary.toolbar.table"]]) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "text-button summary-toolbar-btn";
    btn.dataset.insert = kind;
    btn.textContent = t(key);
    btn.addEventListener("click", () => insertInto(textarea, kind));
    buttons.append(btn);
  }
  const figureBtn = document.createElement("button");
  figureBtn.type = "button";
  figureBtn.className = "text-button summary-toolbar-btn";
  figureBtn.dataset.insert = "figure";
  figureBtn.textContent = t("summary.toolbar.figure");
  figureBtn.setAttribute("aria-expanded", "false");
  let panel = null;
  const closePanel = () => {
    panel?.remove();
    panel = null;
    figureBtn.setAttribute("aria-expanded", "false");
    figureBtn.focus({ preventScroll: true });
  };
  figureBtn.addEventListener("click", () => {
    if (panel) { closePanel(); return; }
    panel = createFigurePanel(textarea, closePanel);
    bar.append(panel);
    figureBtn.setAttribute("aria-expanded", "true");
    panel.querySelector("input")?.focus();
  });
  buttons.append(figureBtn);
  bar.append(buttons);
  return bar;
}
