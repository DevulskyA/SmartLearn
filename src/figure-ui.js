// Dialogs of the figures of the Resumo Mestre: the details form (alternative text, caption, description) used to insert or edit one, and the
// enlarged view. Native <dialog> elements: focus is trapped, Esc closes, focus returns to where it was.
import { t } from "./i18n/index.js";
import { uploadAsset, updateAssetTexts, forgetFigure } from "./visual-assets-api.js";

export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_ALT = 300;
const MAX_CAPTION = 300;
const MAX_DESCRIPTION = 2000;

function field(labelText, input) {
  const label = document.createElement("label");
  label.className = "figure-dialog-field";
  label.append(document.createTextNode(`${labelText} `), input);
  return label;
}
const textInput = (max) => Object.assign(document.createElement("input"), { type: "text", maxLength: max, className: "figure-dialog-input" });

function modal(titleText, className) {
  const previouslyFocused = document.activeElement;
  const dialog = document.createElement("dialog");
  dialog.className = `figure-dialog ${className}`;
  const titleId = `figure-dialog-${Math.random().toString(36).slice(2)}`;
  dialog.setAttribute("aria-labelledby", titleId);
  const title = document.createElement("h2");
  title.id = titleId;
  title.textContent = titleText;
  dialog.append(title);
  const close = () => {
    if (dialog.open) dialog.close();
    dialog.remove();
    if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus({ preventScroll: true });
  };
  document.body.append(dialog);
  return { dialog, close };
}

/**
 * The details form of one figure. Without `record` it CREATES: `blob` is the chosen/pasted image (or a PDF crop, with `crop`), uploaded on confirm.
 * With `record` it EDITS the texts of an existing figure. Resolves with the stored record, or null when cancelled.
 */
export function openFigureDetailsDialog({ blob = null, record = null, crop = null } = {}) {
  return new Promise((resolve) => {
    const { dialog, close } = modal(t(record ? "summary.figure.dialog.edit" : "summary.figure.dialog.insert"), "figure-details-dialog");
    const preview = document.createElement("img");
    preview.className = "figure-dialog-preview";
    preview.alt = "";
    const previewUrl = record ? record.url : URL.createObjectURL(blob);
    preview.src = previewUrl;
    const alt = textInput(MAX_ALT);
    alt.required = true;
    alt.className += " figure-dialog-alt";
    alt.value = record?.alt ?? "";
    const caption = textInput(MAX_CAPTION);
    caption.className += " figure-dialog-caption";
    caption.value = record?.caption ?? "";
    const description = Object.assign(document.createElement("textarea"), { rows: 3, maxLength: MAX_DESCRIPTION, className: "figure-dialog-description" });
    description.value = record?.description ?? "";
    const hint = document.createElement("p");
    hint.className = "lesson-hint";
    hint.textContent = t("summary.figure.dialog.hint");
    const status = document.createElement("p");
    status.className = "form-message figure-dialog-status";
    status.setAttribute("role", "status");
    const actions = document.createElement("div");
    actions.className = "figure-dialog-actions";
    const cancel = Object.assign(document.createElement("button"), { type: "button", className: "secondary-button", textContent: t("summary.figure.cancel") });
    const confirm = Object.assign(document.createElement("button"), { type: "button", className: "primary-button figure-dialog-confirm", textContent: t(record ? "summary.figure.dialog.save" : "summary.figure.dialog.insertConfirm") });
    actions.append(cancel, confirm);
    dialog.append(preview, field(t("summary.figure.dialog.alt"), alt), field(t("summary.figure.dialog.caption"), caption), field(t("summary.figure.dialog.description"), description), hint, status, actions);

    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      if (!record) URL.revokeObjectURL(previewUrl);
      close();
      resolve(value);
    };
    cancel.addEventListener("click", () => finish(null));
    dialog.addEventListener("cancel", (event) => { event.preventDefault(); finish(null); });
    confirm.addEventListener("click", async () => {
      if (!alt.value.trim()) { status.textContent = t("summary.figure.dialog.needAlt"); alt.focus(); return; }
      confirm.disabled = true;
      status.textContent = t("summary.figure.dialog.saving");
      try {
        const texts = { alt: alt.value.trim(), caption: caption.value.trim(), description: description.value.trim() };
        const stored = record ? await updateAssetTexts(record.id, texts) : await uploadAsset(blob, { ...texts, crop });
        finish(stored);
      } catch (err) {
        status.textContent = err?.message || t("summary.figure.dialog.failed");
        confirm.disabled = false;
      }
    });
    dialog.showModal();
    alt.focus();
  });
}

/** The enlarged figure with its texts, its origin (page of the PDF it was cut from) and a way to edit them. */
export function openFigureViewer(record, { onEdited = null, onOpenSource = null } = {}) {
  const { dialog, close } = modal(record.caption || record.alt, "figure-viewer-dialog");
  const img = Object.assign(document.createElement("img"), { src: record.url, alt: record.alt, className: "figure-viewer-image" });
  const alt = document.createElement("p");
  alt.className = "figure-viewer-alt";
  alt.textContent = `${t("summary.figure.viewer.alt")}: ${record.alt}`;
  dialog.append(img, alt);
  if (record.description) {
    const details = document.createElement("p");
    details.className = "figure-viewer-description";
    details.textContent = record.description;
    dialog.append(details);
  }
  const actions = document.createElement("div");
  actions.className = "figure-dialog-actions";
  if (record.source && onOpenSource) {
    const open = Object.assign(document.createElement("button"), { type: "button", className: "secondary-button figure-viewer-source", textContent: t("summary.figure.viewer.openPage", { page: record.source.pageIndex }) });
    open.addEventListener("click", () => onOpenSource(record.source));
    actions.append(open);
  }
  const edit = Object.assign(document.createElement("button"), { type: "button", className: "secondary-button figure-viewer-edit", textContent: t("summary.figure.viewer.edit") });
  edit.addEventListener("click", async () => {
    close();
    const updated = await openFigureDetailsDialog({ record });
    if (updated) { forgetFigure(record.id); onEdited?.(updated); }
  });
  const closeBtn = Object.assign(document.createElement("button"), { type: "button", className: "primary-button figure-viewer-close", textContent: t("summary.figure.viewer.close") });
  closeBtn.addEventListener("click", close);
  actions.append(edit, closeBtn);
  dialog.append(actions);
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); close(); });
  dialog.showModal();
  closeBtn.focus();
}
