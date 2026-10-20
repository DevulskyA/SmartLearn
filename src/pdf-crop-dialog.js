// "Selecionar do PDF": the student picks one of the PDFs already uploaded, looks at a page and drags a rectangle over a figure, a table or a
// formula. The region becomes a PNG cropped from the page as drawn here; the details dialog then stores it as a figure that remembers
// WHICH source, page and rectangle it came from. Choosing the region is the only thing recorded: nothing here says the image was checked
// against the source or is medically correct.
// pdf.js (bundled locally, worker included) renders the page from the authenticated original-file endpoint; nothing is fetched from outside.
import { t } from "./i18n/index.js";
import { listSources } from "./source-proposals-ui.js";
import { openFigureDetailsDialog } from "./figure-ui.js";
import { isUsableRect, moveRect, normalizeRotation, pixelBox, rectFromPoints, resizeRect } from "../shared/pdf-crop-geometry.js";

const MAX_CSS_WIDTH = 880;
const MAX_BITMAP_SIDE = 4096;
const apiBase = () => (typeof window !== "undefined" && window.__SMARTLEARN_API_BASE__) || "";

let pdfjsLoading = null;
function loadPdfjs() {
  pdfjsLoading ??= Promise.all([import("pdfjs-dist/build/pdf.min.mjs"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]).then(([lib, worker]) => {
    lib.GlobalWorkerOptions.workerSrc = worker.default;
    return lib;
  });
  return pdfjsLoading;
}

async function openDocument(sourceId) {
  const lib = await loadPdfjs();
  const response = await fetch(`${apiBase()}/v1/sources/${sourceId}/file`, { credentials: "include" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return lib.getDocument({ data: new Uint8Array(await response.arrayBuffer()), isEvalSupported: false, enableXfa: false }).promise;
}

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/**
 * Opens the picker. `sourceId`/`pageIndex` pre-select a source and page (e.g. coming from a citation). Resolves with the stored figure
 * record (already uploaded, with its source/page/rectangle) or null when cancelled.
 */
export function openPdfCropDialog({ sourceId = null, pageIndex = 1 } = {}) {
  return new Promise((resolve) => {
    const previouslyFocused = document.activeElement;
    const dialog = el("dialog", "pdf-crop-dialog");
    const titleId = `pdf-crop-title-${Math.random().toString(36).slice(2)}`;
    dialog.setAttribute("aria-labelledby", titleId);
    const title = el("h2", "", t("summary.pdfCrop.title"));
    title.id = titleId;

    const sourceSelect = el("select", "pdf-crop-source");
    const sourceLabel = el("label", "pdf-crop-field", `${t("summary.pdfCrop.source")} `);
    sourceLabel.append(sourceSelect);
    const pageInput = Object.assign(el("input", "pdf-crop-page"), { type: "number", min: "1", value: String(pageIndex) });
    const pageLabel = el("label", "pdf-crop-field", `${t("summary.pdfCrop.page")} `);
    pageLabel.append(pageInput);
    const prev = Object.assign(el("button", "secondary-button pdf-crop-prev", t("summary.pdfCrop.prev")), { type: "button" });
    const next = Object.assign(el("button", "secondary-button pdf-crop-next", t("summary.pdfCrop.next")), { type: "button" });
    const controls = el("div", "pdf-crop-controls");
    controls.append(sourceLabel, prev, pageLabel, next);

    const instructions = el("p", "lesson-hint", t("summary.pdfCrop.instructions"));
    const stage = el("div", "pdf-crop-stage");
    stage.tabIndex = 0;
    stage.setAttribute("role", "group");
    stage.setAttribute("aria-label", t("summary.pdfCrop.stageLabel"));
    const canvas = el("canvas", "pdf-crop-canvas");
    const selection = el("div", "pdf-crop-selection");
    selection.hidden = true;
    stage.append(canvas, selection);
    const status = el("p", "form-message pdf-crop-status");
    status.setAttribute("role", "status");

    const actions = el("div", "figure-dialog-actions");
    const cancel = Object.assign(el("button", "secondary-button", t("summary.figure.cancel")), { type: "button" });
    const confirm = Object.assign(el("button", "primary-button pdf-crop-confirm", t("summary.pdfCrop.confirm")), { type: "button" });
    confirm.disabled = true;
    actions.append(cancel, confirm);
    dialog.append(title, controls, instructions, stage, status, actions);
    document.body.append(dialog);

    let settled = false;
    let doc = null;
    let docSourceId = null;
    let sources = [];
    let rect = null;
    let rotation = 0;
    let renderToken = 0;
    let renderTask = null;

    const finish = (value) => {
      if (settled) return;
      settled = true;
      renderTask?.cancel?.();
      doc?.destroy?.();
      if (dialog.open) dialog.close();
      dialog.remove();
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus({ preventScroll: true });
      resolve(value);
    };

    const showRect = () => {
      confirm.disabled = !isUsableRect(rect);
      selection.hidden = !rect;
      if (!rect) return;
      Object.assign(selection.style, { left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%` });
    };
    const setRect = (value) => { rect = value; showRect(); if (rect) status.textContent = t("summary.pdfCrop.selected", { percent: Math.round(rect.w * rect.h * 100) }); };

    const currentPage = () => Math.max(1, Math.min(Number(pageInput.value) || 1, doc?.numPages ?? 1));

    async function renderPage() {
      if (!doc) return;
      const token = ++renderToken;
      renderTask?.cancel?.();
      const number = currentPage();
      pageInput.value = String(number);
      pageInput.max = String(doc.numPages);
      prev.disabled = number <= 1;
      next.disabled = number >= doc.numPages;
      setRect(null);
      status.textContent = t("summary.pdfCrop.loadingPage");
      try {
        const page = await doc.getPage(number);
        if (token !== renderToken) return;
        // getViewport() already applies the page's own /Rotate, so a rotated page is drawn (and selected) the way the student reads it
        rotation = normalizeRotation(page.rotate);
        const base = page.getViewport({ scale: 1 });
        const cssScale = Math.min(MAX_CSS_WIDTH / base.width, 2);
        const density = Math.min(Math.max(globalThis.devicePixelRatio || 1, 2), MAX_BITMAP_SIDE / (Math.max(base.width, base.height) * cssScale));
        const viewport = page.getViewport({ scale: cssScale * density });
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${Math.floor(base.width * cssScale)}px`;
        canvas.style.aspectRatio = `${canvas.width} / ${canvas.height}`;
        renderTask = page.render({ canvasContext: canvas.getContext("2d"), viewport });
        await renderTask.promise;
        if (token !== renderToken) return;
        status.textContent = t("summary.pdfCrop.ready", { page: number, pages: doc.numPages });
      } catch (err) {
        if (token !== renderToken || err?.name === "RenderingCancelledException") return;
        status.textContent = t("summary.pdfCrop.pageFailed");
      }
    }

    async function chooseSource(id) {
      status.textContent = t("summary.pdfCrop.loadingPdf");
      setRect(null);
      try {
        const opened = await openDocument(id);
        if (settled) { opened.destroy?.(); return; }
        doc?.destroy?.();
        doc = opened;
        docSourceId = id;
        await renderPage();
      } catch {
        doc = null;
        status.textContent = t("summary.pdfCrop.pdfFailed");
      }
    }

    // pointer selection: press, drag, release. The rectangle is stored as fractions of the displayed page.
    let anchor = null;
    const pointOf = (event) => {
      const box = canvas.getBoundingClientRect();
      return { x: event.clientX - box.left, y: event.clientY - box.top, width: box.width, height: box.height };
    };
    stage.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || !doc) return;
      anchor = pointOf(event);
      stage.setPointerCapture?.(event.pointerId);
      stage.focus({ preventScroll: true });
      setRect(null);
    });
    stage.addEventListener("pointermove", (event) => {
      if (!anchor) return;
      const here = pointOf(event);
      rect = rectFromPoints(anchor, here, anchor.width, anchor.height);
      showRect();
    });
    const endDrag = (event) => {
      if (!anchor) return;
      anchor = null;
      stage.releasePointerCapture?.(event.pointerId);
      if (!isUsableRect(rect)) setRect(null);
      else setRect(rect);
    };
    stage.addEventListener("pointerup", endDrag);
    stage.addEventListener("pointercancel", endDrag);

    // keyboard selection: Enter starts a centered rectangle, arrows move it, Shift+arrows resize it, Enter again confirms
    stage.addEventListener("keydown", (event) => {
      if (!doc) return;
      const step = 0.02;
      const arrows = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (event.key === "Enter") {
        event.preventDefault();
        if (!rect) setRect({ x: 0.3, y: 0.3, w: 0.4, h: 0.4 });
        else if (isUsableRect(rect)) confirm.click();
      } else if (event.key === "Escape" && rect) {
        event.preventDefault();
        event.stopPropagation();
        setRect(null);
      } else if (arrows[event.key] && rect) {
        event.preventDefault();
        const [dx, dy] = arrows[event.key];
        setRect(event.shiftKey ? resizeRect(rect, dx, dy) : moveRect(rect, dx, dy));
      }
    });

    pageInput.addEventListener("change", renderPage);
    prev.addEventListener("click", () => { pageInput.value = String(currentPage() - 1); renderPage(); });
    next.addEventListener("click", () => { pageInput.value = String(currentPage() + 1); renderPage(); });
    sourceSelect.addEventListener("change", () => { pageInput.value = "1"; chooseSource(Number(sourceSelect.value)); });
    cancel.addEventListener("click", () => finish(null));
    dialog.addEventListener("cancel", (event) => { event.preventDefault(); finish(null); });

    confirm.addEventListener("click", async () => {
      if (!isUsableRect(rect) || !doc) return;
      const box = pixelBox(rect, canvas.width, canvas.height);
      const out = document.createElement("canvas");
      out.width = box.sw;
      out.height = box.sh;
      out.getContext("2d").drawImage(canvas, box.sx, box.sy, box.sw, box.sh, 0, 0, box.sw, box.sh);
      const blob = await new Promise((done) => out.toBlob(done, "image/png"));
      if (!blob) { status.textContent = t("summary.pdfCrop.cropFailed"); return; }
      const record = await openFigureDetailsDialog({
        blob,
        crop: { sourceId: docSourceId, pageIndex: currentPage(), x: rect.x, y: rect.y, w: rect.w, h: rect.h, rotation },
      });
      if (record) finish(record);
    });

    dialog.showModal();
    listSources().then(async (result) => {
      if (settled) return;
      sources = result.ok ? result.sources.filter((source) => /pdf/i.test(source.contentType ?? "")) : [];
      if (!sources.length) { status.textContent = t("summary.pdfCrop.noSources"); return; }
      for (const source of sources) sourceSelect.append(Object.assign(el("option", "", source.originalName), { value: String(source.id) }));
      const chosen = sources.find((source) => source.id === sourceId) ?? sources[0];
      sourceSelect.value = String(chosen.id);
      await chooseSource(chosen.id);
      stage.focus({ preventScroll: true });
    });
  });
}
