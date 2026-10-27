// "Inserir fórmula": an accessible modal dialog to type, pick symbols for, or edit one formula. MathLive (the visual editor) is loaded only
// when the dialog opens; its fonts are the KaTeX fonts the app already bundles, so nothing is fetched and it works offline. KaTeX draws
// the preview and validates the syntax: the dialog never claims that the formula is scientifically correct.
// The LaTeX box is always there: it is the keyboard/screen-reader path, the way to type chemistry (\ce{H2O}) and the exact text that is saved.
import { katex, katexOptions, mathProblem } from "../shared/summary-math.js";
import { t } from "./i18n/index.js";

const createSummary = (text) => Object.assign(document.createElement("summary"), { textContent: text });

let mathliveLoading = null;
export function loadMathLive() {
  mathliveLoading ??= import("mathlive").then((module) => {
    module.MathfieldElement.fontsDirectory = null; // the KaTeX fonts are already in the page (katex.min.css, bundled locally)
    module.MathfieldElement.soundsDirectory = null;
    return module;
  });
  return mathliveLoading;
}

/**
 * Opens the dialog. Resolves with {tex, display} when the student confirms, or null when cancelled/closed.
 * `tex` empty = a new formula; otherwise the existing one being edited.
 */
export function openMathDialog({ tex = "", display = false, lockDisplay = false } = {}) {
  return new Promise((resolve) => {
    const previouslyFocused = document.activeElement;
    const dialog = document.createElement("dialog");
    dialog.className = "math-dialog";
    const titleId = `math-dialog-title-${Math.random().toString(36).slice(2)}`;
    dialog.setAttribute("aria-labelledby", titleId);

    const title = document.createElement("h2");
    title.id = titleId;
    title.textContent = tex ? t("summary.math.dialog.edit") : t("summary.math.dialog.insert");

    const fieldHost = document.createElement("div");
    fieldHost.className = "math-dialog-field";
    const loading = document.createElement("p");
    loading.className = "math-dialog-loading";
    loading.textContent = t("summary.math.dialog.loading");
    fieldHost.append(loading);

    const texLabel = document.createElement("label");
    texLabel.className = "math-dialog-label";
    const latex = document.createElement("textarea");
    latex.className = "math-dialog-latex";
    latex.rows = 3;
    latex.spellcheck = false;
    latex.autocapitalize = "off";
    latex.value = tex;
    texLabel.append(document.createTextNode(`${t("summary.math.dialog.latex")} `), latex);

    const displayLabel = document.createElement("label");
    displayLabel.className = "math-dialog-display";
    const displayBox = document.createElement("input");
    displayBox.type = "checkbox";
    displayBox.checked = display;
    displayLabel.append(displayBox, document.createTextNode(` ${t("summary.math.dialog.block")}`));
    displayLabel.hidden = lockDisplay; // an existing formula keeps its form (inline stays inline), only its content changes

    const preview = document.createElement("div");
    preview.className = "math-dialog-preview";
    preview.setAttribute("aria-live", "polite");
    const status = document.createElement("p");
    status.className = "math-dialog-status";
    status.setAttribute("role", "status");
    const note = document.createElement("p");
    note.className = "lesson-hint";
    note.textContent = `${t("summary.math.dialog.note")} \\ce{H2O}.`; // the example is code, not translatable text

    const actions = document.createElement("div");
    actions.className = "math-dialog-actions";
    const keyboardBtn = document.createElement("button");
    keyboardBtn.type = "button";
    keyboardBtn.className = "text-button";
    keyboardBtn.textContent = t("summary.math.dialog.symbols");
    keyboardBtn.hidden = true;
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "secondary-button";
    cancel.textContent = t("summary.figure.cancel");
    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.className = "primary-button math-dialog-confirm";
    confirm.textContent = t("summary.math.dialog.confirm");
    actions.append(keyboardBtn, cancel, confirm);

    const advanced = document.createElement("details");
    advanced.className = "math-dialog-advanced";
    advanced.open = /\\(?:ce|pu)\b/.test(tex);
    advanced.append(createSummary(t("summary.math.dialog.advanced")), texLabel, note);
    dialog.append(title, fieldHost, displayLabel, preview, status, advanced, actions);

    let mathfield = null;
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      globalThis.mathVirtualKeyboard?.hide?.();
      if (dialog.open) dialog.close();
      dialog.remove();
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus({ preventScroll: true });
      resolve(value);
    };

    // Validation and preview come from KaTeX only; confirming needs a non-empty, syntactically valid formula.
    const refresh = () => {
      const value = latex.value.trim();
      preview.replaceChildren();
      if (!value) { status.textContent = t("summary.math.dialog.empty"); confirm.disabled = true; return; }
      const problem = mathProblem(value, displayBox.checked);
      if (problem) { status.textContent = `${t("summary.math.invalid")}: ${problem}`; confirm.disabled = true; return; }
      katex.render(value, preview, katexOptions(displayBox.checked, { throwOnError: false }));
      status.textContent = t("summary.math.dialog.valid");
      confirm.disabled = false;
    };

    latex.addEventListener("input", () => {
      if (mathfield && mathfield.getValue("latex") !== latex.value) mathfield.setValue(latex.value, { silenceNotifications: true });
      refresh();
    });
    displayBox.addEventListener("change", refresh);
    cancel.addEventListener("click", () => finish(null));
    confirm.addEventListener("click", () => { if (!confirm.disabled) finish({ tex: latex.value.trim(), display: displayBox.checked }); });
    dialog.addEventListener("cancel", (event) => { event.preventDefault(); finish(null); }); // Esc
    dialog.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !confirm.disabled) { event.preventDefault(); confirm.click(); }
    });

    document.body.append(dialog);
    dialog.showModal();
    refresh();
    latex.focus();

    loadMathLive().then(({ MathfieldElement }) => {
      if (settled) return;
      mathfield = new MathfieldElement();
      mathfield.className = "math-dialog-mathfield";
      mathfield.setAttribute("aria-label", t("summary.math.dialog.visual"));
      mathfield.mathVirtualKeyboardPolicy = "manual";
      mathfield.value = latex.value;
      mathfield.addEventListener("input", () => { latex.value = mathfield.getValue("latex"); refresh(); });
      fieldHost.replaceChildren(mathfield);
      keyboardBtn.hidden = false;
      keyboardBtn.addEventListener("click", () => {
        const keyboard = globalThis.mathVirtualKeyboard;
        if (!keyboard) return;
        keyboard.container = dialog; // inside the modal, or the top layer would hide it
        mathfield.focus();
        keyboard.visible ? keyboard.hide() : keyboard.show();
      });
    }).catch(() => {
      fieldHost.replaceChildren(Object.assign(document.createElement("p"), { className: "math-dialog-loading", textContent: t("summary.math.dialog.noVisual") }));
      advanced.open = true;
    });
  });
}
