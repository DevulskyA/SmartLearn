// "Adiar vencidas" confirmation (Hoje, bloco Vencidas): shows HOW MANY reviews will move and to WHEN before anything changes, and lets the
// student choose the daily maximum. Resolves with the chosen maximum, or null when the student cancels. It only asks: moving the dates is the
// store's job (DB.reviewTasks.postponeOverdue), and the plan shown here is the same pure function the store runs (shared/review-postpone.js).
import { planPostpone, normalizePerDay, POSTPONE_DEFAULT_PER_DAY, POSTPONE_MAX_PER_DAY } from "../shared/review-postpone.js";
import { t } from "./i18n/index.js";

const STORAGE_KEY = "smartlearn:postpone-per-day";

// A per-viewer convenience only: the page works the same when storage is blocked.
function savedPerDay() {
  try { return normalizePerDay(localStorage.getItem(STORAGE_KEY)); } catch { return null; }
}
function savePerDay(value) {
  try { localStorage.setItem(STORAGE_KEY, String(value)); } catch { /* not saved: the default applies next time */ }
}

/** The sentence under the title: "N revisões vencidas serão adiadas ... de X a Y". `formatDay` turns YYYY-MM-DD into the reader's format. */
export function describePlan(plan, perDay, formatDay) {
  const count = plan.moves.length;
  if (count === 0) return t("today.postpone.none");
  const first = formatDay(plan.days[0].date);
  const last = formatDay(plan.days[plan.days.length - 1].date);
  if (count === 1) return t("today.postpone.summary.single", { count, first });
  if (plan.days.length === 1) return t("today.postpone.summary.oneDay", { count, first });
  return t("today.postpone.summary.range", { count, perDay, first, last });
}

export function askPostpone({ tasks, today, formatDay }) {
  return new Promise((resolve) => {
    const dialog = document.getElementById("postpone-dialog");
    const form = document.getElementById("postpone-form");
    const input = document.getElementById("postpone-per-day");
    const summary = document.getElementById("postpone-summary");
    const error = document.getElementById("postpone-error");
    const confirmBtn = document.getElementById("postpone-confirm");
    const cancelBtn = document.getElementById("postpone-cancel");
    input.value = String(savedPerDay() ?? POSTPONE_DEFAULT_PER_DAY);

    const refresh = () => {
      const perDay = normalizePerDay(input.value);
      error.hidden = perDay !== null;
      error.textContent = perDay === null ? t("today.postpone.perDay.invalid", { max: POSTPONE_MAX_PER_DAY }) : "";
      input.setAttribute("aria-invalid", String(perDay === null));
      confirmBtn.disabled = perDay === null;
      summary.textContent = perDay === null ? "" : describePlan(planPostpone(tasks, today, perDay), perDay, formatDay);
      return perDay;
    };
    const finish = (result) => {
      input.removeEventListener("input", refresh);
      form.removeEventListener("submit", onSubmit);
      cancelBtn.removeEventListener("click", onCancel);
      dialog.removeEventListener("cancel", onCancel);
      dialog.close();
      resolve(result);
    };
    const onSubmit = (event) => {
      event.preventDefault();
      const perDay = refresh();
      if (perDay === null) { input.focus(); return; }
      savePerDay(perDay);
      finish(perDay);
    };
    const onCancel = (event) => { event?.preventDefault?.(); finish(null); };
    input.addEventListener("input", refresh);
    form.addEventListener("submit", onSubmit);
    cancelBtn.addEventListener("click", onCancel);
    dialog.addEventListener("cancel", onCancel);
    refresh();
    dialog.showModal();
  });
}
