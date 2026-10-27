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

/** Renders the panel into `host` (a container on Hoje). Safe to call again: it replaces its own content. */
export async function renderObligationsPanel(host, { plan } = {}) {
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

  const refresh = (planArg) => renderObligationsPanel(host, { plan: planArg });
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

  const list = document.createElement("ul");
  list.className = "experiment-units";
  for (const unit of view.units) {
    const li = document.createElement("li");
    li.dataset.unitId = String(unit.unitId);
    li.append(createTextElement("strong", "experiment-unit-title", unit.unitTitle));
    let status;
    if (unit.paused) status = t("experiment.unit.paused");
    else if (unit.required) status = t("experiment.unit.required", { days: unit.required.offsetDays, due: day(unit.required.dueDate) });
    else if (unit.upcoming) status = t("experiment.unit.nothing", { due: day(unit.upcoming.dueDate) });
    else status = t("experiment.unit.finished");
    li.append(createTextElement("p", "experiment-unit-status", status));
    if (unit.required && unit.collapsedCount > 0) li.append(createTextElement("p", "lesson-hint", t("experiment.unit.grouped", { count: unit.collapsedCount })));
    const actions = document.createElement("div");
    actions.className = "experiment-actions";
    if (unit.required) actions.append(button(t("experiment.action.do"), "experiment-complete", () => act(`/v1/review-obligations/${unit.unitId}/complete`, { profile: "DECIDED" }, t("experiment.done"))));
    actions.append(unit.paused
      ? button(t("experiment.action.resume"), "experiment-resume", () => act(`/v1/review-obligations/${unit.unitId}/resume`, {}))
      : button(t("experiment.action.pause"), "experiment-pause", () => act(`/v1/review-obligations/${unit.unitId}/pause`, {})));
    li.append(actions);
    list.append(li);
  }
  section.append(list);

  // Plano do dia: the student states the minutes; nothing is guessed.
  const form = document.createElement("form");
  form.className = "experiment-plan-form";
  form.append(createTextElement("h3", "lesson-subheading", t("experiment.plan.title")));
  const field = (name, label, value) => {
    const wrap = document.createElement("label");
    wrap.textContent = label;
    const input = document.createElement("input");
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
  section.append(form);

  if (plan?.result) {
    const out = document.createElement("div");
    out.className = "experiment-plan-result";
    if (plan.result.planned.length + plan.result.deferred.length === 0) out.append(createTextElement("p", "lesson-hint", t("experiment.plan.empty")));
    if (plan.result.planned.length) {
      out.append(createTextElement("h4", "lesson-subheading", t("experiment.plan.planned", { used: plan.result.usedMinutes, available: plan.result.availableMinutes })));
      const ul = document.createElement("ul");
      ul.className = "experiment-planned";
      for (const p of plan.result.planned) ul.append(createTextElement("li", "", t("experiment.plan.item", { title: p.unitTitle, minutes: p.minutes })));
      out.append(ul);
    }
    if (plan.result.deferred.length) {
      out.append(createTextElement("h4", "lesson-subheading", t("experiment.plan.deferred")));
      const ul = document.createElement("ul");
      ul.className = "experiment-deferred";
      for (const d of plan.result.deferred) ul.append(createTextElement("li", "", `${d.unitTitle} — ${t(`experiment.plan.reason.${d.reason}`)}`));
      out.append(ul);
    }
    section.append(out);
  }
  message.classList.add("experiment-message");
  section.append(message);
  host.append(section);
}
