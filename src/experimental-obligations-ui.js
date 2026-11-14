// EXPERIMENTAL panel on Hoje ("Revisões por unidade" + "Plano do dia"), visible only when the student turns the experiment on in Configurações.
// It reads and writes ONLY the experimental routes (profile DECIDED); the standard calendar below it is untouched. The switch lives in this browser
// only (localStorage), so turning it off, or clearing site data, restores the standard Hoje with nothing to undo.
import { apiRequest } from "./api-client.js";
import { createTextElement } from "./dom-utils.js";
import { t } from "./i18n/index.js";
import { formatDate } from "./i18n/format.js";

const KEY = "smartlearn.experiment.obligations";
export function isExperimentOn() {
  try { return window.localStorage.getItem(KEY) === "1"; } catch { return false; }
}
export function setExperiment(on) {
  try { if (on) window.localStorage.setItem(KEY, "1"); else window.localStorage.removeItem(KEY); } catch { /* storage unavailable: stays off */ }
}

const day = (iso) => formatDate(`${iso}T12:00:00Z`, { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });

function button(label, action, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "secondary-button";
  b.dataset.action = action;
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}

function obligationUnitStatus(unit) {
  if (unit.paused) return t("experiment.unit.paused");
  if (unit.required) return t("experiment.unit.required", { days: unit.required.offsetDays, due: day(unit.required.dueDate) });
  if (unit.upcoming) return t("experiment.unit.nothing", { due: day(unit.upcoming.dueDate) });
  return t("experiment.unit.finished");
}

function createObligationUnitActions(unit, message, onPractice, act) {
  const actions = document.createElement("div");
  actions.className = "experiment-actions";
  // A stage with questions is concluded by practising them (the app opens the focused review and concludes it with their evidence);
  // only a stage without questions is concluded by reading, straight from here.
  if (unit.required && unit.exerciseCount > 0) actions.append(button(t("experiment.action.do"), "experiment-complete", () => {
    if (!onPractice) { message.textContent = t("experiment.failed"); return; }
    Promise.resolve(onPractice(unit)).then((opened) => { if (opened === false) message.textContent = t("experiment.failed"); });
  }));
  else if (unit.required) actions.append(button(t("experiment.action.do"), "experiment-complete", () => act(`/v1/review-obligations/${unit.unitId}/complete`, { profile: "DECIDED" }, t("experiment.done"))));
  actions.append(unit.paused
    ? button(t("experiment.action.resume"), "experiment-resume", () => act(`/v1/review-obligations/${unit.unitId}/resume`, {}))
    : button(t("experiment.action.pause"), "experiment-pause", () => act(`/v1/review-obligations/${unit.unitId}/pause`, {})));
  return actions;
}

function createObligationUnit(unit, message, onPractice, act) {
  const li = document.createElement("li");
  li.dataset.unitId = String(unit.unitId);
  li.append(createTextElement("strong", "experiment-unit-title", unit.unitTitle));
  li.append(createTextElement("p", "experiment-unit-status", obligationUnitStatus(unit)));
  if (unit.required && unit.collapsedCount > 0) li.append(createTextElement("p", "lesson-hint", t("experiment.unit.grouped", { count: unit.collapsedCount })));
  li.append(createObligationUnitActions(unit, message, onPractice, act));
  return li;
}

function createObligationUnitList(units, message, onPractice, act) {
  const list = document.createElement("ul");
  list.className = "experiment-units";
  for (const unit of units) list.append(createObligationUnit(unit, message, onPractice, act));
  return list;
}

function createExperimentPlanForm(plan, refresh, message) {
  // Plano do dia: the student states the minutes; nothing is guessed.
  const form = document.createElement("form");
  form.className = "experiment-plan-form";
  form.append(createTextElement("h3", "lesson-subheading", t("experiment.plan.title")));
  const field = (name, label, value) => {
    const wrap = document.createElement("label");
    wrap.textContent = label;
    const input = document.createElement("input");
    input.max = "100000";
    input.type = "number"; input.min = "0"; input.name = name; input.value = value ?? "";
    wrap.append(input);
    return { wrap, input };
  };
  const minutes = field("availableMinutes", t("experiment.plan.minutes"), plan?.availableMinutes);
  const perReview = field("perReviewMinutes", t("experiment.plan.perReview"), plan?.perReviewMinutes);
  const submit = document.createElement("button");
  submit.type = "submit"; submit.className = "primary-button"; submit.textContent = t("experiment.plan.build");
  form.append(minutes.wrap, perReview.wrap, submit);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const qs = new URLSearchParams({ availableMinutes: minutes.input.value || "0" });
    if (perReview.input.value) qs.set("perReviewMinutes", perReview.input.value);
    try {
      const result = await apiRequest(`/v1/daily-plan-experiment?${qs}`);
      await refresh({ availableMinutes: minutes.input.value, perReviewMinutes: perReview.input.value, result });
    } catch { message.textContent = t("experiment.failed"); }
  });
  return form;
}

function createExperimentPlanResult(result) {
  const out = document.createElement("div");
  out.className = "experiment-plan-result";
  if (result.planned.length + result.deferred.length === 0) out.append(createTextElement("p", "lesson-hint", t("experiment.plan.empty")));
  if (result.planned.length) {
    out.append(createTextElement("h4", "lesson-subheading", t("experiment.plan.planned", { used: result.usedMinutes, available: result.availableMinutes })));
    const ul = document.createElement("ul");
    ul.className = "experiment-planned";
    for (const item of result.planned) ul.append(createTextElement("li", "", t("experiment.plan.item", { title: item.unitTitle, minutes: item.minutes })));
    out.append(ul);
  }
  if (result.deferred.length) {
    out.append(createTextElement("h4", "lesson-subheading", t("experiment.plan.deferred")));
    const ul = document.createElement("ul");
    ul.className = "experiment-deferred";
    for (const item of result.deferred) {
      const reasonKey = `experiment.plan.reason.${item.reason}`;
      ul.append(createTextElement("li", "", `${item.unitTitle} — ${t(reasonKey)}`));
    }
    out.append(ul);
  }
  return out;
}

/** Renders the panel into `host` (a container on Hoje). Safe to call again: it replaces its own content. */
export async function renderObligationsPanel(host, { plan, onPractice } = {}) {
  host.replaceChildren();
  let view;
  try {
    view = await apiRequest("/v1/review-obligations");
  } catch {
    return; // offline or not signed in: the standard Hoje is all there is
  }
  const section = document.createElement("section");
  section.className = "experiment-panel";
  section.append(createTextElement("h2", "experiment-title", t("experiment.panel.title")), createTextElement("p", "lesson-hint", t("experiment.panel.hint")));
  const message = createTextElement("p", "form-message", "");
  message.setAttribute("role", "status");
  message.setAttribute("aria-live", "polite");

  const refresh = (planArg) => renderObligationsPanel(host, { plan: planArg, onPractice });
  const act = async (path, body, okText) => {
    try {
      await apiRequest(path, { method: "POST", body });
      await refresh(plan);
      const again = host.querySelector(".experiment-message");
      if (again && okText) again.textContent = okText;
    } catch {
      message.textContent = t("experiment.failed");
    }
  };

  section.append(createObligationUnitList(view.units, message, onPractice, act));
  section.append(createExperimentPlanForm(plan, refresh, message));
  if (plan?.result) section.append(createExperimentPlanResult(plan.result));
  message.classList.add("experiment-message");
  section.append(message);
  host.append(section);
}
