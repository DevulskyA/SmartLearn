// The ONE registration of a discipline (name + colour). Every door that creates one - Disciplinas, Cadastro and Plano - shows this same
// form, so its fields, validation, messages and colour choice cannot drift apart. A door only decides WHERE the form sits and what
// happens once the discipline exists (`submit`). Creating a discipline together with a lesson in one save (Plano) reads the typed
// name and colour from the same form instead of having a field of its own.

import { t } from "./i18n/index.js";
import { validateNamingField } from "./naming-validation.js";
import { colorVarForKey, SUBJECT_COLOR_KEYS } from "./performance-thresholds.js";

export const DEFAULT_SUBJECT_COLOR = "DISC-BLUE";

export function buildColorPicker(container, selectedKey, onSelect) {
  if (!container) return;
  container.replaceChildren();
  // A radio group is ONE stop of the Tab key; the arrows move inside it (the colours are not eight stops on the way to the next field)
  const swatches = [];
  const choose = (btn, { focus = false } = {}) => {
    for (const b of swatches) {
      const on = b === btn;
      b.classList.toggle("is-selected", on);
      b.setAttribute("aria-checked", String(on));
      b.tabIndex = on ? 0 : -1;
    }
    if (focus) btn.focus();
    onSelect(btn.dataset.colorKey);
  };
  for (const key of SUBJECT_COLOR_KEYS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "color-swatch";
    btn.dataset.colorKey = key;
    btn.style.setProperty("--swatch-color", `var(${colorVarForKey(key)})`);
    btn.setAttribute("role", "radio");
    btn.setAttribute("aria-label", key.replace("DISC-", "").toLowerCase());
    const selected = key === selectedKey;
    if (selected) btn.classList.add("is-selected");
    btn.setAttribute("aria-checked", String(selected));
    btn.tabIndex = selected ? 0 : -1;
    btn.addEventListener("click", () => choose(btn));
    btn.addEventListener("keydown", (event) => {
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
      if (!step) return;
      event.preventDefault();
      choose(swatches[(swatches.indexOf(btn) + step + swatches.length) % swatches.length], { focus: true });
    });
    swatches.push(btn);
    container.append(btn);
  }
  // with nothing selected (an unknown colour) the first swatch is still reachable
  if (!swatches.some((b) => b.tabIndex === 0) && swatches[0]) swatches[0].tabIndex = 0;
}

const isDuplicate = (error) => /unique|duplicate/i.test(String(error?.message ?? error));

/**
 * Builds the form inside `slot` (hidden until `show()`), and returns its handles.
 * @param {object} o
 * @param {Element} o.slot       where the form is placed
 * @param {{form:string, input:string, submit?:string, cancel?:string, message?:string}} o.ids  ids of the elements (kept stable for the tests and for labels)
 * @param {Element} [o.trigger]  the button that opens it: its aria-expanded follows the form
 * @param {(name:string, color:string) => Promise<void>} o.submit  creates the discipline and refreshes whatever the door shows
 * @param {(text:string, isError?:boolean) => void} [o.report]  where messages go (default: a line inside the form)
 * @param {boolean} [o.cancellable] a "Cancelar" button that closes the form
 * @param {boolean} [o.atomic] the form is part of a bigger save (the lesson being accepted): always open, no button of its own, the owner reads
 *   the typed name and colour when it saves; Enter does nothing
 * @param {string} [o.inputClass] extra class of the name input
 * @param {() => void} [o.onHide]  runs when the form closes (cancel, success or hide())
 */
export function createSubjectCreateForm({ slot, ids, trigger = null, submit = null, report = null, cancellable = false, atomic = false, inputClass = "", onHide = null }) {
  if (!slot) return null;
  let color = DEFAULT_SUBJECT_COLOR;

  const form = document.createElement("form");
  form.className = "inline-form subject-create-form";
  form.id = ids.form;
  form.noValidate = true;
  form.hidden = !atomic;

  const nameGroup = document.createElement("div");
  nameGroup.className = "field-group inline-form-field";
  const label = document.createElement("label");
  label.htmlFor = ids.input;
  label.textContent = t("screens.form.newSubjectName");
  const input = document.createElement("input");
  input.id = ids.input;
  input.name = "subjectName";
  input.type = "text";
  input.maxLength = 100;
  input.autocomplete = "off";
  if (inputClass) input.classList.add(inputClass);
  nameGroup.append(label, input);

  const colorGroup = document.createElement("div");
  colorGroup.className = "field-group inline-form-field";
  const colorLabel = document.createElement("span");
  colorLabel.className = "field-label";
  colorLabel.textContent = t("screens.subjects.form.color");
  const picker = document.createElement("div");
  picker.className = "color-picker";
  picker.setAttribute("role", "radiogroup");
  picker.setAttribute("aria-label", t("screens.subjects.form.colorLabel"));
  colorGroup.append(colorLabel, picker);

  const actions = document.createElement("div");
  actions.className = "inline-form-row";
  const submitBtn = document.createElement("button");
  submitBtn.type = "submit";
  submitBtn.className = "primary-button";
  if (ids.submit) submitBtn.id = ids.submit;
  submitBtn.textContent = t("screens.form.add");
  if (!atomic) actions.append(submitBtn);
  let cancelBtn = null;
  if (cancellable) {
    cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "small-button";
    if (ids.cancel) cancelBtn.id = ids.cancel;
    cancelBtn.textContent = t("screens.form.cancel");
    actions.append(cancelBtn);
  }

  let ownMessage = null;
  if (!report) {
    ownMessage = document.createElement("p");
    ownMessage.className = "form-message";
    ownMessage.setAttribute("role", "status");
    ownMessage.setAttribute("aria-live", "polite");
    if (ids.message) ownMessage.id = ids.message;
    actions.append(ownMessage);
  }
  const say = (text = "", isError = false) => {
    if (ownMessage) { ownMessage.textContent = text; ownMessage.classList.toggle("is-error", isError); } else report(text, isError);
  };

  form.append(nameGroup, colorGroup);
  if (actions.children.length > 0 || ownMessage) form.append(actions);
  slot.append(form);

  const paintPicker = () => {
    buildColorPicker(picker, color, (key) => { color = key; });
    for (const swatch of picker.querySelectorAll(".color-swatch")) swatch.disabled = input.disabled;
  };
  paintPicker();

  function reset() {
    input.value = "";
    color = DEFAULT_SUBJECT_COLOR;
    paintPicker();
  }
  function hide() {
    form.hidden = true;
    trigger?.setAttribute("aria-expanded", "false");
    onHide?.();
  }
  function show() {
    if (form.hidden) { reset(); say(); }
    form.hidden = false;
    trigger?.setAttribute("aria-expanded", "true");
    input.focus();
  }

  trigger?.addEventListener("click", () => (form.hidden ? show() : hide()));
  cancelBtn?.addEventListener("click", () => { say(); hide(); });

  /** The same check for every door: the message to show for the name typed, or "" when it is fine. */
  const validate = () => validateNamingField(input.value.trim(), t("shell.field.subjectName")) || "";

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (atomic) return; // the owner saves it together with the rest
    const name = input.value.trim();
    const problem = validate();
    if (problem) { say(problem, true); input.focus(); return; }
    submitBtn.disabled = true;
    try {
      await submit(name, color);
      say();
      reset();
      hide();
    } catch (error) {
      say(t(isDuplicate(error) ? "appRegister.subject.nameTaken" : "appRegister.subject.createFailed"), true);
      input.focus();
    } finally {
      submitBtn.disabled = false;
    }
  });

  return {
    form,
    input,
    show,
    hide,
    reset,
    say,
    /** the colour chosen in the form */
    get color() { return color; },
    validate,
    /** an existing discipline was picked instead: the form stays visible but cannot be used */
    setEnabled(enabled) {
      input.disabled = !enabled;
      for (const swatch of picker.querySelectorAll(".color-swatch")) swatch.disabled = !enabled;
    },
    /** the name typed, only while the form is open and usable: what the owner saves together with its lesson */
    pendingName: () => (form.hidden || input.disabled ? "" : input.value.trim()),
    get hidden() { return form.hidden; },
  };
}
