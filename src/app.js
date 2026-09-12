import "./styles.css";
import { DB as LocalDB } from "./db.js";
import { DB as RemoteDB } from "./remote-store.js";
import { NetworkError } from "./api-client.js";
import { Stats } from "./stats.js";
import { getReviewScoreValidationMessage, getReviewScoreValues } from "./review-score.js";
import { generateInitialTasks } from "./scheduler.js";
import {
  THEME_OPTIONS,
  applyThemePreference,
  getStoredThemePreference,
  resolveThemePreference,
} from "./theme.js";
import { colorVarForKey, performanceColor, SUBJECT_COLORS, SUBJECT_COLOR_KEYS, THRESHOLDS } from "./performance-thresholds.js";
import { Analytics, subtractDays } from "./analytics.js";
import { getTrackingState } from "./tracking-state.js";
import { validateNamingField, validateTitleField } from "./naming-validation.js";
import * as AuthUI from "./auth-ui.js";
import * as MigrationUI from "./migration-ui.js";
import * as SourceProposalsUI from "./source-proposals-ui.js";
import * as DraftReviewUI from "./draft-review-ui.js";
import * as OfflineStore from "./offline-store.js";
import * as OfflineUI from "./offline-ui.js";

async function withScrollPreserved(fn) {
  const top = mainContent?.scrollTop ?? 0;
  await fn();
  requestAnimationFrame(() => {
    if (mainContent) mainContent.scrollTop = top;
  });
}

function showConfirm(message) {
  return new Promise((resolve) => {
    const dialog = document.getElementById("confirm-dialog");
    const msgEl = document.getElementById("confirm-dialog-message");
    const okBtn = document.getElementById("confirm-dialog-ok");
    const cancelBtn = document.getElementById("confirm-dialog-cancel");
    msgEl.textContent = message;
    const finish = (result) => {
      okBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);
      dialog.removeEventListener("cancel", onCancel);
      dialog.close();
      resolve(result);
    };
    const onOk = () => finish(true);
    const onCancel = () => finish(false);
    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
    dialog.addEventListener("cancel", onCancel);
    dialog.showModal();
  });
}

// T21: explicit, configuration-controlled authority switch — never an
// automatic/implicit fallback. Default is the existing local BrowserStore/
// SQLite path (db.js), completely unchanged; the real server-authoritative
// path (remote-store.js) is opt-in via this runtime flag so it can be
// staged and tested (e.g. e2e/server-authority.spec.js sets it via
// page.addInitScript, the same mechanism already used for
// window.__SMARTLEARN_API_BASE__) without touching the many existing
// screens/tests that still assume the local store. Flipping this default
// once every screen has real server parity is T22-T24's job, not this one's.
const REMOTE_MODE = typeof window !== "undefined" && window.__SMARTLEARN_REMOTE_MODE__ === true;
const DB = REMOTE_MODE ? RemoteDB : LocalDB;

// LOCAL-01A / ARCH-01: Desktop still uses REMOTE_MODE=true (same
// remote-store.js/API-HTTP pipeline as before — see .specs/STATE.md's
// "ARCHITECTURE SUPERSESSION" section), but the "remote" it talks to is a
// backend running on THIS computer (127.0.0.1 loopback), started by the
// Tauri wrapper, not a cloud server. Set once by src-tauri/src/lib.rs's
// window init script, never by remote/web content. api-client.js and
// offline-ui.js each read this same flag independently for their own
// LOCAL_DESKTOP_AUTHORITY branches — this module's copy is for renderToday.
const LOCAL_AUTHORITY = typeof window !== "undefined" && window.__SMARTLEARN_LOCAL_AUTHORITY__ === true;

// PV1-01: Materiais (the PDF -> proposal -> draft -> accept pipeline,
// relocated from Configurações to its own primary screen) is exclusive to
// LOCAL_DESKTOP_AUTHORITY — Companion (not implemented yet) stays a
// read-only surface, and REMOTE_AUTHORITY-without-local-authority keeps
// the existing server endpoints reachable (nothing removed server-side)
// but never surfaces this as a product screen. This flag is stable for
// the whole session (set once by the window init script before this
// module loads), so it's safe to apply it once here rather than on every
// navigation.
const materialsNavItem = document.querySelector('[data-screen="materials"]');
if (materialsNavItem) materialsNavItem.hidden = !(REMOTE_MODE && LOCAL_AUTHORITY);

let databaseAvailable = false;
// In remote mode, "available" also requires a logged-in session — there is
// no local schema to fail to open, but every domain call needs an
// authenticated actor. This is the "distinguish unavailable server from
// empty data" seam: a reachable-but-unauthenticated server is a distinct,
// visible state (redirect to login), never rendered as an empty agenda.
let authenticated = !REMOTE_MODE;
const dbInit = DB.init()
  .then(async () => {
    databaseAvailable = true;
    if (REMOTE_MODE) {
      const user = await AuthUI.bootstrap();
      // T40: best-effort — a registration/sync failure here never blocks
      // boot, same "failure only logs" contract as T30's client wiring.
      OfflineStore.registerServiceWorker().catch(() => {});
      // T41: app-wide connectivity indicator + reconnect handling (session
      // revalidation + resync), mounted once regardless of auth outcome so
      // it can show "offline" state even for a not-yet-authenticated tab.
      OfflineUI.mount({ onReconnect: () => { if (authenticated) return renderToday(); } });
      if (user) {
        authenticated = true;
        OfflineStore.syncSnapshot(user.id).catch(() => {});
      } else if (AuthUI.wasLastBootstrapNetworkError() && OfflineStore.getLastAccountId()) {
        // Cold offline reopen: the server can't confirm a session, but a
        // previously-synced account exists on this device — presume it for
        // read-only offline display. The server remains the sole real
        // session authority the moment it's reachable again; nothing here
        // grants any write capability (T41's job to keep it that way).
        authenticated = true;
      } else {
        authenticated = false;
      }
    }
    return true;
  })
  .catch((error) => {
    console.error("Falha ao inicializar o banco local.", error);
    const banner = document.createElement('div');
    banner.id = 'db-error-banner';
    banner.setAttribute('role', 'alert');
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#b91c1c;color:#fff;padding:.75rem 1rem;font-size:.875rem;text-align:center;';
    banner.textContent = REMOTE_MODE
      ? 'Erro: não foi possível conectar ao servidor. Tente novamente em instantes.'
      : 'Erro: dados locais não puderam ser lidos. Seus dados estão preservados, mas o app está temporariamente inativo.';
    document.body.prepend(banner);
    return false;
  });

const DEFAULT_SCREEN = "today";
const LAST_SUBJECT_KEY = "smartlearn:lastSubjectId";

// Estado de edição inline — null quando nenhuma linha está em modo edição.
let activeSubjectEditId = null;
let activeStudyEditId = null;

function rememberSelection(key, value) {
  try {
    if (value) localStorage.setItem(key, String(value));
  } catch {
    // localStorage indisponível (modo privado): ignora silenciosamente.
  }
}

function recallSelection(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function forgetSelection(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // localStorage indisponível (modo privado): ignora silenciosamente.
  }
}
const navigationItems = [...document.querySelectorAll("[data-screen]")];
const screenPanels = [...document.querySelectorAll("[data-screen-panel]")];
const mainContent = document.querySelector(".app-main");
const subjectSelect = document.querySelector("#subject-select");
const showSubjectFormButton = document.querySelector("#show-subject-form");
const newSubjectForm = document.querySelector("#new-subject-form");
const newSubjectInput = document.querySelector("#new-subject-input");
const subjectMessage = document.querySelector("#subject-message");
const subjectList = document.querySelector("#subject-list");
const subjectsEmpty = document.querySelector("#subjects-empty");
const subjectManagerMessage = document.querySelector("#subject-manager-message");
const studyForm = document.querySelector("#study-form");
const studyDateInput = document.querySelector("#study-date");
const studyContentInput = document.querySelector("#study-content");
const studySummaryTextarea = document.querySelector("#study-summary");
const studySourceTextInput = document.querySelector("#study-source-text");
const sourceMessage = document.querySelector("#source-message");
const studyList = document.querySelector("#study-list");
const studiesEmpty = document.querySelector("#studies-empty");
const studyManagerMessage = document.querySelector("#study-manager-message");
const studyMessage = document.querySelector("#study-message");
const todayDateLabel = document.querySelector("#today-date-label");
const todayEmptyState = document.querySelector("#today-empty-state");
const todaySuccessState = document.querySelector("#today-success-state");
const todayTomorrow = document.querySelector("#today-tomorrow");
const todayLoadSummary = document.querySelector("#today-load-summary");
const reviewDashboard = document.querySelector("#review-dashboard");
const todayPrimaryAction = document.querySelector("#today-primary-action");
const todayPrimaryActionText = document.querySelector("#today-primary-action-text");
const todayPrimaryActionBtn = document.querySelector("#today-primary-action-btn");
const dailySummaryBtn = document.querySelector("#daily-summary-btn");
const dailySummaryPanel = document.querySelector("#daily-summary-panel");
const dailySummaryList = document.querySelector("#daily-summary-list");
const dailySummaryClose = document.querySelector("#daily-summary-close");
const reviewGroups = {
  overdue: document.querySelector("#block-overdue"),
  today: document.querySelector("#block-today"),
  doneToday: document.querySelector("#block-done-today"),
};
const metricElements = {
  totalQuestions: document.querySelector("#metric-questions"),
  totalCorrect: document.querySelector("#metric-correct"),
  avgScore: document.querySelector("#metric-average"),
  reviewsDone: document.querySelector("#metric-reviews-done"),
  reviewsPending: document.querySelector("#metric-reviews-pending"),
  reviewsOverdue: document.querySelector("#metric-reviews-overdue"),
};
const subjectKpiList = document.querySelector("#subject-kpi-list");
const subjectKpiEmpty = document.querySelector("#subject-kpi-empty");
const statsSubjectSort = document.querySelector("#stats-subject-sort");
const unitStatsList = document.querySelector("#unit-stats-list");
const unitStatsEmpty = document.querySelector("#unit-stats-empty");
const statsUnitFilterSubject = document.querySelector("#stats-unit-filter-subject");
const statsUnitFilterTrend = document.querySelector("#stats-unit-filter-trend");
const statsUnitFilterPeriod = document.querySelector("#stats-unit-filter-period");
const statsUnitSort = document.querySelector("#stats-unit-sort");
const evolutionSvg = document.querySelector("#evolution-svg");
const evolutionFilterSubject = document.querySelector("#evolution-filter-subject");
const evolutionFilterPeriod = document.querySelector("#evolution-filter-period");
const exerciseNotesBody = document.querySelector("#exercise-notes-body");
const exerciseNotesEmpty = document.querySelector("#exercise-notes-empty");
const subjectAveragesBody = document.querySelector("#subject-averages-body");
const subjectAveragesEmpty = document.querySelector("#subject-averages-empty");
const evolutionChart = document.querySelector("#evolution-chart");
const chartEmpty = document.querySelector("#chart-empty");
const exportBackupButton = document.querySelector("#export-backup");
const chooseBackupFileButton = document.querySelector("#choose-backup-file");
const lastBackupLabel = document.querySelector("#last-backup-label");
const backupMessage = document.querySelector("#backup-message");
const importBackupInput = document.querySelector("#import-backup");
const reviewMessage = document.createElement("p");
reviewMessage.id = "review-dashboard-message";
reviewMessage.className = "form-message";
reviewMessage.setAttribute("role", "status");
reviewMessage.setAttribute("aria-live", "polite");
reviewDashboard?.after(reviewMessage);
const trackingList = document.querySelector("#tracking-list");
const trackingEmpty = document.querySelector("#tracking-empty");
const trackingFilterSubject = document.querySelector("#tracking-filter-subject");
const trackingFilterState = document.querySelector("#tracking-filter-state");
const trackingFilterPeriod = document.querySelector("#tracking-filter-period");
const subjectsCatalog = document.querySelector("#subjects-catalog");
const subjectsCatalogEmpty = document.querySelector("#subjects-catalog-empty");
const subjectsShowCreateBtn = document.querySelector("#subjects-show-create-btn");
const subjectsCreateForm = document.querySelector("#subjects-create-form");
const subjectsNewName = document.querySelector("#subjects-new-name");
const subjectsNewColorPicker = document.querySelector("#subjects-new-color-picker");
const subjectsCreateSaveBtn = document.querySelector("#subjects-create-save-btn");
const subjectsCreateCancelBtn = document.querySelector("#subjects-create-cancel-btn");
const subjectsCreateMessage = document.querySelector("#subjects-create-message");
const planList = document.querySelector("#plan-list");
const planEmpty = document.querySelector("#plan-empty");
const planFilterSubject = document.querySelector("#plan-filter-subject");
const planFilterState = document.querySelector("#plan-filter-state");
const planSort = document.querySelector("#plan-sort");
const planNewUnitBtn = document.querySelector("#plan-new-unit-btn");
const planNewUnitForm = document.querySelector("#plan-new-unit-form");
const planSubjectSelect = document.querySelector("#plan-subject-select");
const planShowSubjectForm = document.querySelector("#plan-show-subject-form");
const planNewSubjectForm = document.querySelector("#plan-new-subject-form");
const planNewSubjectInput = document.querySelector("#plan-new-subject-input");
const planStudySource = document.querySelector("#plan-study-source");
const planStudyDate = document.querySelector("#plan-study-date");
const planStudyTitle = document.querySelector("#plan-study-title");
const planStudySummary = document.querySelector("#plan-study-summary");
const planUnitSaveBtn = document.querySelector("#plan-unit-save-btn");
const planUnitCancelBtn = document.querySelector("#plan-unit-cancel-btn");
const planUnitFormMessage = document.querySelector("#plan-unit-form-message");
const resetDatabaseButton = document.querySelector("#reset-database");
const resetMessage = document.querySelector("#reset-message");
const migrationCard = document.querySelector("#migration-card");
const migrationChooseFileButton = document.querySelector("#migration-choose-file");
const migrationFileInput = document.querySelector("#migration-file-input");
const migrationMessage = document.querySelector("#migration-message");
const migrationPreviewPanel = document.querySelector("#migration-preview-panel");
const migrationCounts = document.querySelector("#migration-counts");
const migrationWarnings = document.querySelector("#migration-warnings");
const migrationConflicts = document.querySelector("#migration-conflicts");
const migrationConfirmBtn = document.querySelector("#migration-confirm-btn");
const migrationCancelBtn = document.querySelector("#migration-cancel-btn");
const migrationResultPanel = document.querySelector("#migration-result-panel");
const migrationResultSummary = document.querySelector("#migration-result-summary");
const migrationDownloadReportBtn = document.querySelector("#migration-download-report");
const sourcesChooseFileButton = document.querySelector("#sources-choose-file");
const sourcesFileInput = document.querySelector("#sources-file-input");
const sourcesMessage = document.querySelector("#sources-message");
const sourcesProposalsPanel = document.querySelector("#sources-proposals-panel");
const sourcesProposalsList = document.querySelector("#sources-proposals-list");
const studyNowSubjectEl = document.querySelector("#study-now-subject");
const studyNowTitleEl = document.querySelector("#title-study-now");
const studyNowSummaryCard = document.querySelector("#study-now-summary-card");
const studyNowSummaryBody = document.querySelector("#study-now-summary-body");
const studyNowProgress = document.querySelector("#study-now-progress");
const studyNowQuestionArea = document.querySelector("#study-now-question-area");
const studyNowQuestionText = document.querySelector("#study-now-question-text");
const studyNowHintText = document.querySelector("#study-now-hint-text");
const studyNowRevealBtn = document.querySelector("#study-now-reveal-btn");
const studyNowAnswerText = document.querySelector("#study-now-answer-text");
const studyNowJudgment = document.querySelector("#study-now-judgment");
const studyNowCorrectBtn = document.querySelector("#study-now-correct-btn");
const studyNowIncorrectBtn = document.querySelector("#study-now-incorrect-btn");
const studyNowNoExercises = document.querySelector("#study-now-no-exercises");
const studyNowResultCard = document.querySelector("#study-now-result-card");
const studyNowResultText = document.querySelector("#study-now-result-text");
const studyNowNextReviewText = document.querySelector("#study-now-next-review-text");
const studyNowReviewErrorsBtn = document.querySelector("#study-now-review-errors-btn");
const studyNowErrorsList = document.querySelector("#study-now-errors-list");
let migrationActivePreview = null;
let migrationLastReport = null;
const themeToggle = document.querySelector("#theme-toggle");
const themePicker = document.querySelector("#theme-picker");
const prefersDarkScheme = window.matchMedia("(prefers-color-scheme: dark)");

function getLocalDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(dateValue, options = {}) {
  if (!dateValue) return "—";
  const date = new Date(`${dateValue.slice(0, 10)}T12:00:00`);
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...options,
  }).format(date);
}

function getTomorrowValue(today) {
  const date = new Date(`${today}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function createTextElement(tagName, className, text) {
  const element = document.createElement(tagName);
  element.className = className;
  element.textContent = text;
  return element;
}

function setReviewMessage(message = "", isError = false) {
  reviewMessage.textContent = message;
  reviewMessage.classList.toggle("is-error", isError);
}

function formatPerformanceScore(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  const rounded = Math.round(number * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1).replace(".", ",")}%`;
}

function getPerformanceBandClass(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  if (number < THRESHOLDS.ATTENTION) return "performance-badge--critical";
  if (number < THRESHOLDS.ADEQUATE) return "performance-badge--attention";
  if (number < THRESHOLDS.STRONG) return "performance-badge--good";
  return "performance-badge--strong";
}

function createPerformanceBadge(value) {
  const badge = document.createElement("span");
  badge.className = ["performance-badge", getPerformanceBandClass(value)].filter(Boolean).join(" ");
  badge.textContent = formatPerformanceScore(value);
  return badge;
}

function createExerciseRow(exercise) {
  const row = document.createElement("tr");
  row.className = "exercise-row";

  const subjectCell = document.createElement("th");
  subjectCell.scope = "row";
  subjectCell.dataset.cell = "subject";
  subjectCell.textContent = exercise.subjectName;

  const contentCell = document.createElement("td");
  contentCell.dataset.cell = "content";
  contentCell.textContent = exercise.title;

  const questionsCell = document.createElement("td");
  questionsCell.dataset.cell = "q";
  questionsCell.textContent = exercise.questionsCount == null ? "—" : String(exercise.questionsCount);

  const correctCell = document.createElement("td");
  correctCell.dataset.cell = "a";
  correctCell.textContent = String(exercise.correctCount);

  const scoreCell = document.createElement("td");
  scoreCell.dataset.cell = "score";
  scoreCell.append(createPerformanceBadge(exercise.scorePercent));

  row.append(subjectCell, contentCell, questionsCell, correctCell, scoreCell);
  return row;
}
function getDaysBetween(fromDate, toDate) {
  const from = new Date(`${fromDate}T00:00:00.000Z`);
  const to = new Date(`${toDate}T00:00:00.000Z`);
  return Math.round((to - from) / 86400000);
}

function getReviewStatusLabel(groupName, task, today) {
  if (groupName === "doneToday") return "Concluída";
  if (groupName === "today") return "Vence hoje";
  const days = getDaysBetween(task.dueDate, today);
  return days <= 1 ? "Atrasada 1 dia" : `Atrasada ${days} dias`;
}

function createScoreInput(task, field, label) {
  const wrapper = document.createElement("label");
  wrapper.className = "number-control review-number-control";
  wrapper.append(createTextElement("span", "review-field-label", label));
  const input = document.createElement("input");
  input.type = "number";
  input.min = "0";
  input.step = "1";
  input.inputMode = "numeric";
  input.value = task[field] ?? "";
  input.dataset.action = "score-input";
  input.dataset.field = field;
  input.dataset.reviewId = String(task.id);
  input.dataset.committedValue = String(task[field] ?? "");
  input.setAttribute("aria-label", `${label} da revisão R${task.reviewNumber}`);
  wrapper.append(input);
  return wrapper;
}

function formatReviewScore(value) {
  return value == null ? "—" : `${Number(value).toFixed(1)}%`;
}

function createReviewRow(task, unit, subject, groupName, today, exercises = []) {
  const row = document.createElement("article");
  row.className = "review-row";
  row.dataset.reviewId = String(task.id);
  row.dataset.unitId = String(unit?.id ?? "");
  row.dataset.group = groupName;

  // Header: review-number marker + identity + status/score tags
  const header = document.createElement("div");
  header.className = "review-row-header";

  const marker = createTextElement("span", "review-marker", `R${task.reviewNumber}`);
  marker.classList.add(`is-${groupName === "doneToday" ? "done" : groupName}`);
  marker.setAttribute("aria-label", `Revisão número ${task.reviewNumber}`);

  const heading = document.createElement("div");
  heading.className = "review-row-heading";
  const subjectChip = document.createElement("span");
  subjectChip.className = "subject-chip";
  subjectChip.textContent = subject?.name ?? "Sem disciplina";
  subjectChip.style.setProperty("--subject-color", `var(${colorVarForKey(subject?.color ?? "DISC-BLUE")})`);
  heading.append(subjectChip);
  heading.append(createTextElement("h3", "review-content", unit?.title ?? "Conteúdo indisponível"));
  heading.append(
    createTextElement(
      "p",
      "review-meta",
      `${unit?.sourceText ?? ""} · ${formatDate(unit?.studyDate)}`.replace(/^\s*·\s*/, ""),
    ),
  );

  const tags = document.createElement("div");
  tags.className = "review-row-tags";
  const statusBadge = createTextElement("span", "review-status", getReviewStatusLabel(groupName, task, today));
  statusBadge.classList.add(`is-${groupName === "doneToday" ? "done" : groupName}`);
  const initialScoreValues = getReviewScoreValues(task.questionsCount, task.correctCount);
  const scorePill = createTextElement("span", "review-score-pill", formatReviewScore(initialScoreValues.scorePercent));
  scorePill.classList.toggle("is-empty", initialScoreValues.scorePercent == null);
  scorePill.dataset.scoreFor = String(task.id);
  scorePill.setAttribute("aria-hidden", "true");
  tags.append(statusBadge, scorePill);

  header.append(marker, heading, tags);

  // Primary action row: mark review done + expand toggle
  const primary = document.createElement("div");
  primary.className = "review-row-primary";

  const reviewDoneLabel = document.createElement("label");
  reviewDoneLabel.className = "check-control review-toggle";
  const reviewDoneInput = document.createElement("input");
  reviewDoneInput.type = "checkbox";
  reviewDoneInput.checked = task.reviewDone;
  reviewDoneInput.dataset.action = "review-done";
  reviewDoneInput.dataset.reviewId = String(task.id);
  reviewDoneInput.dataset.committedChecked = String(task.reviewDone);
  reviewDoneLabel.append(reviewDoneInput, document.createTextNode("Revisão feita"));

  const hasScoreData =
    task.questionsDone ||
    task.questionsCount != null ||
    task.correctCount != null ||
    (task.comment ?? "") !== "";

  // Collapsible detail: questions-done toggle, free-form score inputs,
  // comment. None of these have a server-mode equivalent (T20/heritage.md:
  // the new model records evidence atomically via the exercises Q&A flow
  // or the external-exercises form below, never a free-standing manual
  // patch of questionsDone/score/comment) — showing controls that would
  // fail on every use is worse than not showing them, so remote mode
  // simply omits this panel rather than rendering a broken one.
  const detail = document.createElement("div");
  detail.className = "review-row-detail";
  detail.hidden = true;

  let expandButton = null;
  if (!REMOTE_MODE) {
    expandButton = document.createElement("button");
    expandButton.type = "button";
    expandButton.className = "review-expand";
    expandButton.dataset.action = "expand";
    expandButton.setAttribute("aria-expanded", String(hasScoreData));
    expandButton.textContent = "Ver desempenho";
    detail.hidden = !hasScoreData;

    const questionsDoneLabel = document.createElement("label");
    questionsDoneLabel.className = "check-control review-toggle";
    const questionsDoneInput = document.createElement("input");
    questionsDoneInput.type = "checkbox";
    questionsDoneInput.checked = task.questionsDone;
    questionsDoneInput.dataset.action = "questions-done";
    questionsDoneInput.dataset.reviewId = String(task.id);
    questionsDoneInput.dataset.committedChecked = String(task.questionsDone);
    questionsDoneLabel.append(questionsDoneInput, document.createTextNode("Questões feitas"));

    const scoreInputs = document.createElement("div");
    scoreInputs.className = "review-score-inputs";
    const live = document.createElement("div");
    live.className = "review-score-live";
    live.append(createTextElement("span", "review-field-label", "Aproveitamento"));
    const score = createTextElement("span", "score-value review-score-value", formatReviewScore(initialScoreValues.scorePercent));
    score.dataset.scoreFor = String(task.id);
    score.setAttribute("aria-label", "Percentual de acertos");
    live.append(score);
    scoreInputs.append(
      createScoreInput(task, "questionsCount", "Questões"),
      createScoreInput(task, "correctCount", "Acertos"),
      live,
    );

    const commentLabel = document.createElement("label");
    commentLabel.className = "comment-control review-note";
    commentLabel.append(createTextElement("span", "review-field-label", "Comentário"));
    const commentInput = document.createElement("textarea");
    commentInput.rows = 2;
    commentInput.maxLength = 500;
    commentInput.value = task.comment ?? "";
    commentInput.placeholder = "Anote uma dúvida ou ponto importante";
    commentInput.dataset.action = "comment";
    commentInput.dataset.reviewId = String(task.id);
    commentInput.dataset.committedValue = task.comment ?? "";
    commentInput.setAttribute("aria-label", `Comentário da revisão R${task.reviewNumber}`);
    commentLabel.append(commentInput);

    detail.append(questionsDoneLabel, scoreInputs, commentLabel);
  }

  const externalBtn = document.createElement("button");
  externalBtn.type = "button";
  externalBtn.className = "review-expand";
  externalBtn.dataset.action = "toggle-external";
  externalBtn.setAttribute("aria-expanded", "false");
  externalBtn.textContent = "Exercícios externos";

  primary.append(reviewDoneLabel, ...(expandButton ? [expandButton] : []), externalBtn);

  // External exercises section
  const externalSection = document.createElement("div");
  externalSection.className = "review-external-section";
  externalSection.hidden = true;

  const extForm = document.createElement("div");
  extForm.className = "external-exercise-form";

  const extQLabel = document.createElement("label");
  extQLabel.className = "number-control review-number-control";
  extQLabel.append(createTextElement("span", "review-field-label", "Questões feitas"));
  const extQInput = document.createElement("input");
  extQInput.type = "number";
  extQInput.min = "1";
  extQInput.step = "1";
  extQInput.inputMode = "numeric";
  extQInput.className = "external-questions-input";
  extQInput.placeholder = "0";
  extQLabel.append(extQInput);

  const extALabel = document.createElement("label");
  extALabel.className = "number-control review-number-control";
  extALabel.append(createTextElement("span", "review-field-label", "Acertos"));
  const extAInput = document.createElement("input");
  extAInput.type = "number";
  extAInput.min = "0";
  extAInput.step = "1";
  extAInput.inputMode = "numeric";
  extAInput.className = "external-correct-input";
  extAInput.placeholder = "0";
  extALabel.append(extAInput);

  const extSubmitBtn = document.createElement("button");
  extSubmitBtn.type = "button";
  extSubmitBtn.className = "small-button is-primary";
  extSubmitBtn.dataset.action = "submit-external";
  extSubmitBtn.dataset.reviewId = String(task.id);
  extSubmitBtn.dataset.unitId = String(unit?.id ?? "");
  extSubmitBtn.textContent = "Registrar";

  const extMsg = createTextElement("p", "field-message external-form-message", "");
  extMsg.setAttribute("role", "status");
  extMsg.setAttribute("aria-live", "polite");

  extForm.append(extQLabel, extALabel, extSubmitBtn, extMsg);
  externalSection.append(
    createTextElement("p", "review-field-label", "Registrar exercícios externos"),
    extForm,
  );

  // Resumo Mestre section
  const summarySection = document.createElement("div");
  summarySection.className = "review-row-summary";

  const summaryDisplayText = unit?.summaryBody ?? unit?.title ?? "";
  const summaryDisplay = createTextElement("p", "review-summary-text", summaryDisplayText);
  summaryDisplay.dataset.summaryDisplay = String(task.id);

  const editSummaryButton = document.createElement("button");
  editSummaryButton.type = "button";
  editSummaryButton.className = "text-button review-edit-summary";
  editSummaryButton.dataset.action = "edit-summary";
  editSummaryButton.textContent = "Editar Resumo";

  const summaryEditArea = document.createElement("div");
  summaryEditArea.className = "review-summary-edit";
  summaryEditArea.hidden = true;

  const summaryTextarea = document.createElement("textarea");
  summaryTextarea.rows = 6;
  summaryTextarea.value = unit?.summaryBody ?? "";
  summaryTextarea.placeholder = "Escreva o resumo do conteúdo estudado...";
  summaryTextarea.dataset.summaryEdit = String(task.id);
  summaryTextarea.setAttribute("aria-label", "Resumo Mestre");

  const saveSummaryButton = document.createElement("button");
  saveSummaryButton.type = "button";
  saveSummaryButton.className = "primary-button review-save-summary";
  saveSummaryButton.dataset.action = "save-summary";
  saveSummaryButton.textContent = "Salvar";

  const summaryMessage = createTextElement("p", "field-message review-summary-message", "");
  summaryMessage.setAttribute("role", "status");
  summaryMessage.setAttribute("aria-live", "polite");

  summaryEditArea.append(summaryTextarea, saveSummaryButton, summaryMessage);
  summarySection.append(summaryDisplay, editSummaryButton, summaryEditArea);

  // Exercises section (Q→reveal-A→Acertei/Errei in the review context)
  if (exercises.length > 0) {
    const exercisesReviewSection = document.createElement("div");
    exercisesReviewSection.className = "review-row-exercises";
    exercisesReviewSection.dataset.exercisesTotal = String(exercises.length);
    exercisesReviewSection.dataset.exercisesAnswered = "0";
    exercisesReviewSection.dataset.exercisesCorrect = "0";

    const exercisesTitle = createTextElement("p", "review-exercises-title", `Exercícios (${exercises.length})`);
    exercisesReviewSection.append(exercisesTitle);

    for (const exercise of exercises) {
      const exItem = document.createElement("div");
      exItem.className = "review-exercise-item";
      exItem.dataset.exerciseAnswered = "false";
      exItem.dataset.exerciseId = String(exercise.id);
      exItem.dataset.reviewTaskId = String(task.id);

      const qEl = createTextElement("p", "review-exercise-question", exercise.questionText);

      const revealBtn = document.createElement("button");
      revealBtn.type = "button";
      revealBtn.className = "text-button review-exercise-reveal";
      revealBtn.dataset.action = "reveal-answer";
      revealBtn.textContent = "Ver resposta";

      const answerEl = createTextElement("p", "review-exercise-answer", exercise.answerText);
      answerEl.hidden = true;

      const judgmentRow = document.createElement("div");
      judgmentRow.className = "exercise-judgment";
      judgmentRow.hidden = true;

      const acerteiBtn = document.createElement("button");
      acerteiBtn.type = "button";
      acerteiBtn.className = "small-button exercise-correct-btn";
      acerteiBtn.dataset.action = "exercise-acertei";
      acerteiBtn.dataset.reviewId = String(task.id);
      acerteiBtn.textContent = "Acertei";

      const erreiBtn = document.createElement("button");
      erreiBtn.type = "button";
      erreiBtn.className = "small-button exercise-wrong-btn";
      erreiBtn.dataset.action = "exercise-errei";
      erreiBtn.dataset.reviewId = String(task.id);
      erreiBtn.textContent = "Errei";

      judgmentRow.append(acerteiBtn, erreiBtn);

      if (exercise.hintText) {
        const hintEl = createTextElement("p", "review-exercise-hint", `Dica: ${exercise.hintText}`);
        exItem.append(qEl, hintEl, revealBtn, answerEl, judgmentRow);
      } else {
        exItem.append(qEl, revealBtn, answerEl, judgmentRow);
      }
      exercisesReviewSection.append(exItem);
    }

    row.append(header, summarySection, exercisesReviewSection, primary, detail, externalSection);
  } else {
    row.append(header, summarySection, primary, detail, externalSection);
  }
  return row;
}

// T40: read-only fallback for "cold offline reopen after prior sync
// displays the app/agenda". Deliberately renders plain text rows, not
// createReviewRow's interactive complete/reveal actions — those require a
// live server round-trip that offline-by-definition cannot make (T41
// disables mutation UI explicitly; this predates that, so it just never
// offers the action at all rather than offering one that would silently
// fail). Only overdue/today buckets are shown: T39's snapshot excludes
// already-completed tasks, so "done today" has no offline equivalent.
async function renderOfflineToday(accountId) {
  const snapshot = await OfflineStore.loadSnapshot(accountId);
  const today = getLocalDateValue();

  let banner = document.querySelector("#offline-banner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "offline-banner";
    banner.setAttribute("role", "status");
    banner.style.cssText = "position:sticky;top:0;z-index:100;background:#92400e;color:#fff;padding:.5rem 1rem;font-size:.8125rem;text-align:center;";
    mainContent?.prepend(banner);
  }
  banner.hidden = false;
  banner.textContent = snapshot
    ? `Modo offline — última sincronização: ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(snapshot.syncedAt))}.`
    : "Modo offline — nenhuma agenda sincronizada anteriormente.";

  const overdue = (snapshot?.items ?? []).filter((i) => i.dueDate < today);
  const dueToday = (snapshot?.items ?? []).filter((i) => i.dueDate === today);
  const groups = { overdue, today: dueToday, doneToday: [] };

  for (const [groupName, tasks] of Object.entries(groups)) {
    const block = reviewGroups[groupName];
    const list = block.querySelector(`[data-review-list="${groupName}"]`);
    const count = block.querySelector(`[data-count-for="${groupName}"]`);
    list.replaceChildren();
    count.textContent = String(tasks.length);
    block.hidden = tasks.length === 0;
    for (const item of tasks) {
      const row = document.createElement("li");
      row.className = "review-row review-row-offline";
      row.dataset.reviewTaskId = String(item.reviewTaskId);
      row.textContent = `${item.unitTitle} — ${item.subjectName}`;
      list.append(row);
    }
  }

  todayEmptyState.hidden = true;
  todaySuccessState.hidden = !(overdue.length === 0 && dueToday.length === 0);
  todayTomorrow.hidden = true;
  if (todayLoadSummary) {
    const parts = [];
    if (overdue.length > 0) parts.push(`${overdue.length} vencida${overdue.length !== 1 ? "s" : ""}`);
    if (dueToday.length > 0) parts.push(`${dueToday.length} hoje`);
    todayLoadSummary.hidden = parts.length === 0;
    todayLoadSummary.textContent = parts.join(" · ");
  }
  todayDateLabel.textContent = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long" }).format(new Date());
}

export async function renderToday() {
  const existingOfflineBanner = document.querySelector("#offline-banner");
  // LOCAL-01A: navigator.onLine tracks the OS network adapter, which says
  // nothing about a loopback backend's reachability — Desktop must not
  // treat "no Wi-Fi/internet" as "no authority" (STATE.md's ARCHITECTURE
  // SUPERSESSION §3). This read-only snapshot fallback stays REMOTE_MODE
  // (non-local) territory only.
  if (REMOTE_MODE && !LOCAL_AUTHORITY && !navigator.onLine) {
    const accountId = AuthUI.getCurrentUser()?.id ?? OfflineStore.getLastAccountId();
    return renderOfflineToday(accountId);
  }

  const today = getLocalDateValue();
  const tomorrow = getTomorrowValue(today);
  let pendingToday, overdueReviews, completedToday, tomorrowReviews, learningUnits, subjects;
  try {
    [pendingToday, overdueReviews, completedToday, tomorrowReviews, learningUnits, subjects] =
      await Promise.all([
        DB.reviewTasks.getForToday(today),
        DB.reviewTasks.getOverdue(today),
        DB.reviewTasks.getCompletedToday(today),
        DB.reviewTasks.getTomorrow(tomorrow),
        DB.learningUnits.getAll(),
        DB.subjects.getAll(),
      ]);
  } catch (error) {
    // T42 fix (AC-24): navigator.onLine only reflects the OS network
    // adapter's link state, not whether the SmartLearn server itself is
    // reachable — a dead/restarting/firewalled server with Wi-Fi otherwise
    // up never flips navigator.onLine, so the check above alone can't catch
    // it. A NetworkError here means fetch() itself never got a response
    // (api-client.js's own distinction) — route it through the same
    // read-only snapshot path as a known-offline cold start. Any other
    // error (a real HTTP response, auth, etc.) is a different failure and
    // must keep propagating, not get silently reinterpreted as "offline".
    // LOCAL-01A: a local backend that's down is a real, explicit failure
    // (item E of LOCAL-01A's discriminating tests) — it must surface as an
    // error, never get silently reinterpreted as "offline, show the last
    // snapshot" the way a genuinely unreachable REMOTE cloud server does.
    if (REMOTE_MODE && !LOCAL_AUTHORITY && error instanceof NetworkError) {
      const accountId = AuthUI.getCurrentUser()?.id ?? OfflineStore.getLastAccountId();
      return renderOfflineToday(accountId);
    }
    throw error;
  }
  if (existingOfflineBanner) existingOfflineBanner.hidden = true;
  const unitsById = new Map(learningUnits.map((unit) => [unit.id, unit]));
  const subjectsById = new Map(subjects.map((subject) => [subject.id, subject]));
  const groups = {
    overdue: overdueReviews,
    today: pendingToday,
    doneToday: completedToday,
  };

  // Load exercises for all learning units visible in the review groups
  const visibleUnitIds = new Set([
    ...overdueReviews.map((t) => t.unitId),
    ...pendingToday.map((t) => t.unitId),
    ...completedToday.map((t) => t.unitId),
  ]);
  const exercisesByUnitId = new Map();
  await Promise.all(
    [...visibleUnitIds].map(async (id) => {
      try {
        exercisesByUnitId.set(id, await DB.exercises.getAll(id));
      } catch {
        exercisesByUnitId.set(id, []);
      }
    }),
  );

  for (const [groupName, tasks] of Object.entries(groups)) {
    const block = reviewGroups[groupName];
    const list = block.querySelector(`[data-review-list="${groupName}"]`);
    const count = block.querySelector(`[data-count-for="${groupName}"]`);
    list.replaceChildren();
    count.textContent = String(tasks.length);
    block.hidden = tasks.length === 0;

    for (const task of tasks) {
      const unit = unitsById.get(task.unitId);
      const subject = subjectsById.get(unit?.subjectId);
      const exercises = exercisesByUnitId.get(task.unitId) ?? [];
      list.append(createReviewRow(task, unit, subject, groupName, today, exercises));
    }
  }

  // Slice 3 (SMARTLEARN_PRODUCT_FIRST_V1): "o que eu faço agora?" answered
  // with data already fetched above — no new scheduler, no change to the
  // 16-review schedule. Priority: overdue (oldest first, already the
  // server's own sort order) > today > (tomorrow/none handled by the
  // existing todayTomorrow/todaySuccessState elements below, which
  // already communicate those two cases adequately).
  if (todayPrimaryAction && todayPrimaryActionText && todayPrimaryActionBtn) {
    const primaryTask = overdueReviews[0] ?? pendingToday[0] ?? null;
    if (primaryTask) {
      todayPrimaryActionText.textContent = overdueReviews.length > 0
        ? (overdueReviews.length === 1 ? "Você tem 1 revisão vencida." : `Você tem ${overdueReviews.length} revisões vencidas.`)
        : (pendingToday.length === 1 ? "Você tem 1 revisão para hoje." : `Você tem ${pendingToday.length} revisões para hoje.`);
      todayPrimaryActionBtn.dataset.reviewId = String(primaryTask.id);
      todayPrimaryAction.hidden = false;
    } else {
      todayPrimaryAction.hidden = true;
    }
  }

  // Load summary above fold
  if (todayLoadSummary) {
    const parts = [];
    if (overdueReviews.length > 0) parts.push(`${overdueReviews.length} vencida${overdueReviews.length !== 1 ? "s" : ""}`);
    if (pendingToday.length > 0) parts.push(`${pendingToday.length} hoje`);
    if (tomorrowReviews.length > 0) parts.push(`${tomorrowReviews.length} amanhã`);
    if (completedToday.length > 0) parts.push(`${completedToday.length} feita${completedToday.length !== 1 ? "s" : ""}`);
    todayLoadSummary.hidden = parts.length === 0;
    todayLoadSummary.textContent = parts.join(" · ");
  }

  const pendingCount = overdueReviews.length + pendingToday.length;
  const hasData = learningUnits.length > 0;
  todayEmptyState.hidden = hasData;
  todaySuccessState.hidden = !(hasData && pendingCount === 0);

  if (tomorrowReviews.length > 0) {
    const label = tomorrowReviews.length === 1 ? "1 revisão" : `${tomorrowReviews.length} revisões`;
    todayTomorrow.textContent = `Amanhã: ${label}.`;
    todayTomorrow.hidden = false;
  } else {
    todayTomorrow.textContent = "";
    todayTomorrow.hidden = true;
  }

  todayDateLabel.textContent = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(new Date());

  // Show/hide daily summary button based on studies with study_date === today
  const todayStudies = learningUnits.filter((u) => u.studyDate === today);
  if (dailySummaryBtn) {
    dailySummaryBtn.hidden = todayStudies.length === 0;
  }
  // Close the panel whenever renderToday re-runs (e.g. after completing a review)
  if (dailySummaryPanel) {
    dailySummaryPanel.hidden = true;
  }
}

export async function renderStats() {
  const [reviewTasks, evidence, learningUnits, subjects] = await Promise.all([
    DB.reviewTasks.getAll(),
    DB.learningEvidence.getAll(),
    DB.learningUnits.getAll(),
    DB.subjects.getAll(),
  ]);
  const stats = Stats.calculate(reviewTasks, evidence, learningUnits, subjects);
  metricElements.totalQuestions.textContent = String(stats.totalQuestions);
  metricElements.totalCorrect.textContent = String(stats.totalCorrect);
  metricElements.avgScore.textContent = `${stats.avgScore.toFixed(1).replace(".", ",")}%`;
  metricElements.reviewsDone.textContent = String(stats.reviewsDone);
  metricElements.reviewsPending.textContent = String(stats.reviewsPending);
  metricElements.reviewsOverdue.textContent = String(stats.reviewsOverdue);

  exerciseNotesBody.replaceChildren();
  exerciseNotesEmpty.hidden = stats.completedExercises.length > 0;
  for (const exercise of stats.completedExercises) {
    exerciseNotesBody.append(createExerciseRow(exercise));
  }

  subjectAveragesBody.replaceChildren();
  subjectAveragesEmpty.hidden = stats.avgBySubject.length > 0;
  for (const subject of stats.avgBySubject) {
    const row = document.createElement("tr");
    const name = document.createElement("th");
    name.scope = "row";
    name.textContent = subject.subjectName;
    const average = document.createElement("td");
    average.dataset.cell = "avg";
    average.append(createPerformanceBadge(subject.avgScore));
    const questions = document.createElement("td");
    questions.textContent = String(subject.totalQuestions);
    row.append(name, average, questions);
    subjectAveragesBody.append(row);
  }

  const dataPoints = evidence
    .filter((ev) => ev.scorePercent != null && ev.evidenceDate != null)
    .sort((a, b) => a.evidenceDate.localeCompare(b.evidenceDate))
    .map((ev) => ({
      date: ev.evidenceDate,
      scorePercent: Number(ev.scorePercent),
    }));
  const chartRendered = Stats.renderChart(evolutionChart, dataPoints);
  evolutionChart.hidden = !chartRendered;
  chartEmpty.hidden = chartRendered;
  if (!chartRendered) {
    chartEmpty.textContent = "Sem dados suficientes para o gráfico.";
  }
  await renderStatsBySubject();
  await renderStatsByUnit();
  // WP-D3: SVG evolution chart
  const [allEvidence, allUnits, allSubjects] = await Promise.all([
    DB.learningEvidence.getAll(),
    DB.learningUnits.getAll(),
    DB.subjects.getAll(),
  ]);
  // Populate evolution subject filter
  if (evolutionFilterSubject && evolutionFilterSubject.options.length <= 1) {
    for (const s of allSubjects.filter((s) => s.isActive)) {
      const opt = document.createElement("option");
      opt.value = String(s.id);
      opt.textContent = s.name;
      evolutionFilterSubject.append(opt);
    }
  }
  const svgRendered = renderEvolutionSvg(allEvidence, allUnits, allSubjects);
  chartEmpty.hidden = svgRendered;
}
const TRACKING_STATE_LABELS = {
  ATRASADO: "Atrasada",
  SEM_EVIDENCIA: "Sem prática registrada",
  EM_REVISAO: "Revisar hoje",
  EM_ESTUDO: "Em estudo",
  EM_DIA: "Em dia",
};

function getPlanStateBadge(state) {
  const span = document.createElement("span");
  span.className = "plan-state-badge";
  span.dataset.state = state;
  span.textContent = TRACKING_STATE_LABELS[state] ?? state;
  return span;
}

function getNextReview(unitId, allTasks) {
  const pending = allTasks
    .filter((t) => t.unitId === unitId && !t.reviewDone)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return pending.length > 0 ? pending[0].dueDate : null;
}

function getPlanPerfBadge(evidence) {
  const total = evidence.reduce((s, e) => s + e.questionsCount, 0);
  if (total === 0) return null;
  const correct = evidence.reduce((s, e) => s + e.correctCount, 0);
  const pct = (correct / total) * 100;
  const span = document.createElement("span");
  span.className = "performance-badge";
  if (pct >= THRESHOLDS.STRONG) span.dataset.perf = "strong";
  else if (pct >= THRESHOLDS.ADEQUATE) span.dataset.perf = "adequate";
  else if (pct >= THRESHOLDS.ATTENTION) span.dataset.perf = "attention";
  else span.dataset.perf = "critical";
  span.textContent = `${pct.toFixed(0)}%`;
  return span;
}

let planCurrentSubjectFilter = "";
let planCurrentStateFilter = "";

export async function renderPlan() {
  if (!planList) return;
  const today = getLocalDateValue();
  const [learningUnits, subjects, allTasks, allEvidence] = await Promise.all([
    DB.learningUnits.getAll(),
    DB.subjects.getAll(),
    DB.reviewTasks.getAll(),
    DB.learningEvidence.getAll(),
  ]);
  const subjectsById = new Map(subjects.map((s) => [s.id, s]));
  const evidenceByUnitId = new Map();
  for (const ev of allEvidence) {
    if (!evidenceByUnitId.has(ev.unitId)) evidenceByUnitId.set(ev.unitId, []);
    evidenceByUnitId.get(ev.unitId).push(ev);
  }

  // Load exercise counts in parallel
  const exerciseCountByUnitId = new Map();
  await Promise.all(
    learningUnits.map(async (unit) => {
      try {
        const exs = await DB.exercises.getAll(unit.id);
        exerciseCountByUnitId.set(unit.id, exs.length);
      } catch {
        exerciseCountByUnitId.set(unit.id, 0);
      }
    }),
  );

  // Populate subject dropdowns (filter + new-unit form)
  const activeSubjects = subjects.filter((s) => s.isActive);
  function syncPlanSubjectOptions(select, currentValue = "") {
    if (!select) return;
    const first = select.options[0];
    select.replaceChildren(first);
    for (const subj of activeSubjects) {
      const opt = document.createElement("option");
      opt.value = String(subj.id);
      opt.textContent = subj.name;
      select.append(opt);
    }
    if (currentValue) select.value = currentValue;
  }
  syncPlanSubjectOptions(planFilterSubject, planFilterSubject?.value);
  syncPlanSubjectOptions(planSubjectSelect, planSubjectSelect?.value);

  // Sort (AC-RP-06)
  const planSortValue = planSort?.value ?? "study-date-desc";
  let sorted;
  if (planSortValue === "subject") {
    sorted = [...learningUnits].sort((a, b) => {
      const sa = subjectsById.get(a.subjectId)?.name ?? "";
      const sb = subjectsById.get(b.subjectId)?.name ?? "";
      return sa.localeCompare(sb) || b.studyDate.localeCompare(a.studyDate);
    });
  } else if (planSortValue === "next-review") {
    const nextByUnit = new Map();
    for (const t of allTasks) {
      if (t.reviewDone) continue;
      const prev = nextByUnit.get(t.unitId);
      if (!prev || t.dueDate < prev) nextByUnit.set(t.unitId, t.dueDate);
    }
    sorted = [...learningUnits].sort((a, b) => {
      const da = nextByUnit.get(a.id) ?? "9999-99-99";
      const db = nextByUnit.get(b.id) ?? "9999-99-99";
      return da.localeCompare(db) || b.studyDate.localeCompare(a.studyDate);
    });
  } else {
    sorted = [...learningUnits].sort((a, b) => b.studyDate.localeCompare(a.studyDate));
  }

  // Apply filters
  const subjectFilter = planFilterSubject?.value ?? "";
  const stateFilter = planFilterState?.value ?? "";
  const filtered = sorted.filter((unit) => {
    if (subjectFilter && String(unit.subjectId) !== subjectFilter) return false;
    if (stateFilter && getTrackingState(unit.id, allTasks, allEvidence, today) !== stateFilter) return false;
    return true;
  });

  planEmpty.hidden = filtered.length > 0;
  planList.replaceChildren();

  for (const unit of filtered) {
    const subject = subjectsById.get(unit.subjectId);
    const evidence = evidenceByUnitId.get(unit.id) ?? [];
    const state = getTrackingState(unit.id, allTasks, allEvidence, today);
    const nextReview = getNextReview(unit.id, allTasks);
    const exerciseCount = exerciseCountByUnitId.get(unit.id) ?? 0;

    const row = document.createElement("article");
    row.className = "plan-row";
    row.dataset.unitId = String(unit.id);

    // Compact summary line
    const compact = document.createElement("div");
    compact.className = "plan-row-compact";

    const subjectChip = document.createElement("span");
    subjectChip.className = "subject-chip";
    subjectChip.textContent = subject?.name ?? "Sem disciplina";
    subjectChip.style.setProperty(
      "--subject-color",
      `var(${colorVarForKey(subject?.color ?? "DISC-BLUE")})`,
    );

    const titleSpan = document.createElement("span");
    titleSpan.className = "plan-unit-title";
    titleSpan.textContent = unit.title;

    const meta = document.createElement("span");
    meta.className = "plan-unit-meta";
    const parts = [formatDate(unit.studyDate)];
    if (unit.sourceText) parts.push(unit.sourceText);
    if (exerciseCount > 0) parts.push(`${exerciseCount} ex.`);
    parts.push(unit.summaryBody ? "Resumo ✓" : "Resumo —");
    if (nextReview) parts.push(`Próx. ${formatDate(nextReview)}`);
    meta.textContent = parts.join(" · ");

    const badges = document.createElement("span");
    badges.className = "plan-row-badges";
    badges.append(getPlanStateBadge(state));
    const perfBadge = getPlanPerfBadge(evidence);
    if (perfBadge) badges.append(perfBadge);

    const expandBtn = document.createElement("button");
    expandBtn.className = "plan-expand-btn";
    expandBtn.type = "button";
    expandBtn.setAttribute("aria-expanded", "false");
    expandBtn.setAttribute("aria-label", "Expandir detalhes");
    expandBtn.textContent = "▸";

    compact.append(subjectChip, titleSpan, meta, badges, expandBtn);

    // Expansion panel (lazy rendered)
    const detail = document.createElement("div");
    detail.className = "plan-row-detail";
    detail.hidden = true;

    expandBtn.addEventListener("click", async () => {
      const isExpanded = expandBtn.getAttribute("aria-expanded") === "true";
      expandBtn.setAttribute("aria-expanded", String(!isExpanded));
      expandBtn.textContent = isExpanded ? "▸" : "▾";
      detail.hidden = isExpanded;

      if (!isExpanded && !detail.dataset.loaded) {
        detail.dataset.loaded = "1";
        detail.replaceChildren();

        // Summary Mestre — always editable in Plan detail
        const summarySection = document.createElement("div");
        summarySection.className = "plan-detail-section plan-summary-section";
        summarySection.dataset.unitId = unit.id;
        const summaryHeading = document.createElement("h3");
        summaryHeading.textContent = "Resumo Mestre";
        summarySection.append(summaryHeading);

        let currentSummary = unit.summaryBody ?? "";

        const summaryDisplayWrap = document.createElement("div");
        summaryDisplayWrap.className = "plan-summary-display-wrap";

        const summaryText = document.createElement("p");
        summaryText.className = "plan-summary-body";
        summaryText.textContent = currentSummary;
        summaryText.hidden = !currentSummary;

        const summaryPlaceholder = document.createElement("p");
        summaryPlaceholder.className = "plan-summary-placeholder";
        summaryPlaceholder.textContent = "Nenhum resumo. Clique em Editar para adicionar.";
        summaryPlaceholder.hidden = !!currentSummary;

        const editSummaryBtn = document.createElement("button");
        editSummaryBtn.type = "button";
        editSummaryBtn.className = "text-button plan-edit-summary-btn";
        editSummaryBtn.textContent = currentSummary ? "Editar resumo" : "Adicionar Resumo Mestre";

        const summaryEditArea = document.createElement("div");
        summaryEditArea.className = "plan-summary-edit-area";
        summaryEditArea.hidden = true;
        const summaryTextarea = document.createElement("textarea");
        summaryTextarea.className = "plan-summary-textarea";
        summaryTextarea.rows = 6;
        summaryTextarea.setAttribute("aria-label", "Resumo Mestre");
        summaryTextarea.value = currentSummary;
        const summaryActions = document.createElement("div");
        summaryActions.className = "plan-summary-edit-actions";
        const saveSummaryBtn = document.createElement("button");
        saveSummaryBtn.type = "button";
        saveSummaryBtn.className = "primary-button";
        saveSummaryBtn.textContent = "Salvar";
        const cancelSummaryBtn = document.createElement("button");
        cancelSummaryBtn.type = "button";
        cancelSummaryBtn.className = "text-button";
        cancelSummaryBtn.textContent = "Cancelar";
        const summaryMsg = document.createElement("p");
        summaryMsg.className = "form-message";
        summaryMsg.setAttribute("role", "status");
        summaryMsg.setAttribute("aria-live", "polite");
        summaryActions.append(saveSummaryBtn, cancelSummaryBtn, summaryMsg);
        summaryEditArea.append(summaryTextarea, summaryActions);

        editSummaryBtn.addEventListener("click", () => {
          summaryTextarea.value = currentSummary;
          summaryDisplayWrap.hidden = true;
          editSummaryBtn.hidden = true;
          summaryEditArea.hidden = false;
          summaryTextarea.focus();
        });
        cancelSummaryBtn.addEventListener("click", () => {
          summaryDisplayWrap.hidden = false;
          editSummaryBtn.hidden = false;
          summaryEditArea.hidden = true;
        });
        saveSummaryBtn.addEventListener("click", async () => {
          const newBody = summaryTextarea.value.trim() || null;
          summaryMsg.textContent = "Salvando…";
          try {
            await DB.learningUnits.update(unit.id, { summaryBody: newBody });
            currentSummary = newBody ?? "";
            summaryText.textContent = currentSummary;
            summaryText.hidden = !currentSummary;
            summaryPlaceholder.hidden = !!currentSummary;
            editSummaryBtn.textContent = currentSummary ? "Editar resumo" : "Adicionar Resumo Mestre";
            summaryDisplayWrap.hidden = false;
            editSummaryBtn.hidden = false;
            summaryEditArea.hidden = true;
            summaryMsg.textContent = "";
            unit.summaryBody = newBody;
          } catch (err) {
            summaryMsg.textContent = "Erro ao salvar: " + err.message;
          }
        });

        summaryDisplayWrap.append(summaryText, summaryPlaceholder);
        summarySection.append(summaryDisplayWrap, editSummaryBtn, summaryEditArea);
        detail.append(summarySection);

        // Exercises
        const exs = await DB.exercises.getAll(unit.id);
        if (exs.length > 0) {
          const exSection = document.createElement("div");
          exSection.className = "plan-detail-section";
          const exHeading = document.createElement("h3");
          exHeading.textContent = `Exercícios (${exs.length})`;
          exSection.append(exHeading);
          for (const ex of exs) {
            const item = document.createElement("div");
            item.className = "plan-exercise-item";
            item.textContent = ex.questionText;
            exSection.append(item);
          }
          detail.append(exSection);
        }

        // Evidence history
        if (evidence.length > 0) {
          const evSection = document.createElement("div");
          evSection.className = "plan-detail-section";
          const evHeading = document.createElement("h3");
          evHeading.textContent = "Histórico de desempenho";
          evSection.append(evHeading);
          const evList = document.createElement("ul");
          evList.className = "plan-evidence-list";
          for (const ev of [...evidence].sort((a, b) => b.evidenceDate.localeCompare(a.evidenceDate))) {
            const li = document.createElement("li");
            const ctx = { INITIAL_PRACTICE: "Prática inicial", REVIEW: "Revisão", EXTERNAL: "Externo" };
            li.textContent = `${formatDate(ev.evidenceDate)} — ${ctx[ev.context] ?? ev.context}: ${ev.correctCount}/${ev.questionsCount} (${ev.scorePercent.toFixed(0)}%)`;
            evList.append(li);
          }
          evSection.append(evList);
          detail.append(evSection);
        }

        if (!detail.children.length) {
          const empty = document.createElement("p");
          empty.className = "plan-detail-empty";
          empty.textContent = "Nenhum detalhe disponível.";
          detail.append(empty);
        }
      }
    });

    row.append(compact, detail);
    planList.append(row);
  }
}

function createTrendBadge(direction) {
  const span = document.createElement("span");
  span.className = "trend-badge";
  span.dataset.direction = direction;
  const labels = { IMPROVING: "↑ Melhorando", DECLINING: "↓ Caindo", STABLE: "→ Estável", INSUFFICIENT: "— Insuficiente" };
  span.textContent = labels[direction] ?? direction;
  return span;
}

function createStateBadge(state) {
  const span = document.createElement("span");
  span.className = "performance-state-badge";
  span.dataset.state = state;
  const labels = { NO_EVIDENCE: "Sem evidência", CRITICAL: "Crítico", ATTENTION: "Atenção", ADEQUATE: "Adequado", STRONG: "Forte" };
  span.textContent = labels[state] ?? state;
  return span;
}

export async function renderStatsBySubject() {
  if (!subjectKpiList) return;
  const today = getLocalDateValue();
  const [evidence, units, subjects] = await Promise.all([
    DB.learningEvidence.getAll(),
    DB.learningUnits.getAll(),
    DB.subjects.getAll(),
  ]);
  let results = Analytics.bySubject(evidence, units, subjects, today);

  const sortValue = statsSubjectSort?.value ?? "worst-first";
  if (sortValue === "best-first") {
    results = [...results].sort((a, b) => {
      if (a.weightedAccuracy == null && b.weightedAccuracy == null) return 0;
      if (a.weightedAccuracy == null) return 1;
      if (b.weightedAccuracy == null) return -1;
      return b.weightedAccuracy - a.weightedAccuracy;
    });
  } else if (sortValue === "volume") {
    results = [...results].sort((a, b) => b.totalQuestions - a.totalQuestions);
  } else if (sortValue === "trend") {
    const trendOrder = { DECLINING: 0, INSUFFICIENT: 1, STABLE: 2, IMPROVING: 3 };
    results = [...results].sort((a, b) => (trendOrder[a.trend.direction] ?? 1) - (trendOrder[b.trend.direction] ?? 1));
  }
  // "worst-first" is default from Analytics.bySubject sort

  const hasAny = results.some((r) => r.totalQuestions > 0);
  subjectKpiEmpty.hidden = hasAny || results.length > 0;
  subjectKpiList.replaceChildren();

  for (const r of results) {
    const card = document.createElement("article");
    card.className = "subject-kpi";
    card.dataset.state = r.state;

    const header = document.createElement("div");
    header.className = "subject-kpi-header";

    const chip = document.createElement("span");
    chip.className = "subject-chip";
    chip.textContent = r.subjectName;
    chip.style.setProperty("--subject-color", `var(${colorVarForKey(r.color)})`);

    const badges = document.createElement("div");
    badges.className = "subject-kpi-badges";
    badges.append(createStateBadge(r.state), createTrendBadge(r.trend.direction));

    header.append(chip, badges);

    const metrics = document.createElement("div");
    metrics.className = "subject-kpi-metrics";

    const accEl = document.createElement("div");
    accEl.className = "subject-kpi-acc";
    // AC-EST1-05: sem evidência ≠ 0% — show neutral, never red
    // AC-EST1-07: always show % + n questões
    if (r.weightedAccuracy == null) {
      accEl.textContent = "Sem evidência";
      accEl.classList.add("is-no-evidence");
    } else {
      accEl.textContent = `${r.weightedAccuracy.toFixed(1).replace(".", ",")}%`;
    }

    const qEl = document.createElement("div");
    qEl.className = "subject-kpi-questions";
    qEl.textContent = `${r.totalQuestions} questões · ${r.totalCorrect} acertos`;

    const recentEl = document.createElement("div");
    recentEl.className = "subject-kpi-recent";
    recentEl.textContent = `Últimos 30d: ${r.recentQuestions} questões`;

    metrics.append(accEl, qEl, recentEl);

    // Continuous visual performance signal (0%=vermelho, 60%=amarelo,
    // 100%=verde) — additive to the numeric/label/volume/trend above, never
    // a replacement for them, and independent from the subject's own color.
    const perfBar = document.createElement("div");
    perfBar.className = "subject-kpi-perfbar";
    perfBar.setAttribute("role", "presentation");
    const perfBarFill = document.createElement("div");
    perfBarFill.className = "subject-kpi-perfbar-fill";
    const hasEvidence = r.weightedAccuracy != null;
    perfBarFill.style.width = hasEvidence ? `${Math.min(100, Math.max(0, r.weightedAccuracy))}%` : "100%";
    perfBarFill.style.background = performanceColor(r.weightedAccuracy, r.totalQuestions);
    perfBarFill.classList.toggle("is-no-evidence", !hasEvidence);
    perfBar.append(perfBarFill);

    card.append(header, metrics, perfBar);
    subjectKpiList.append(card);
  }
}

function createTrackingStateBadge(state) {
  const span = document.createElement("span");
  span.className = "tracking-state-badge";
  span.dataset.state = state;
  span.textContent = TRACKING_STATE_LABELS[state] ?? state;
  return span;
}

export async function renderTracking() {
  if (!trackingList) return;
  const today = getLocalDateValue();
  const [units, subjects, allTasks, allEvidence] = await Promise.all([
    DB.learningUnits.getAll(),
    DB.subjects.getAll(),
    DB.reviewTasks.getAll(),
    DB.learningEvidence.getAll(),
  ]);
  const subjectsById = new Map(subjects.map((s) => [s.id, s]));
  const evidenceByUnitId = new Map();
  for (const ev of allEvidence) {
    if (!evidenceByUnitId.has(ev.unitId)) evidenceByUnitId.set(ev.unitId, []);
    evidenceByUnitId.get(ev.unitId).push(ev);
  }

  // Populate subject filter
  if (trackingFilterSubject && trackingFilterSubject.options.length <= 1) {
    for (const s of subjects.filter((s) => s.isActive)) {
      const opt = document.createElement("option");
      opt.value = String(s.id);
      opt.textContent = s.name;
      trackingFilterSubject.append(opt);
    }
  }

  const subjFilter = trackingFilterSubject?.value ?? "";
  const stateFilter = trackingFilterState?.value ?? "";
  const periodFilter = trackingFilterPeriod?.value ?? "";
  const periodCutoff = periodFilter ? subtractDays(today, periodFilter === "last-30" ? 30 : periodFilter === "last-90" ? 90 : 365) : null;

  let filtered = units.filter((u) => {
    if (subjFilter && String(u.subjectId) !== subjFilter) return false;
    if (stateFilter && getTrackingState(u.id, allTasks, allEvidence, today) !== stateFilter) return false;
    if (periodCutoff && u.studyDate < periodCutoff) return false;
    return true;
  });
  filtered.sort((a, b) => b.studyDate.localeCompare(a.studyDate));

  trackingEmpty.hidden = filtered.length > 0;
  trackingList.replaceChildren();

  for (const unit of filtered) {
    const subject = subjectsById.get(unit.subjectId);
    const state = getTrackingState(unit.id, allTasks, allEvidence, today);
    const evidence = evidenceByUnitId.get(unit.id) ?? [];
    const tasks = allTasks.filter((t) => t.unitId === unit.id);
    const doneTasks = tasks.filter((t) => t.reviewDone);
    const pendingTasks = tasks.filter((t) => !t.reviewDone);

    const totalQ = evidence.reduce((s, e) => s + e.questionsCount, 0);
    const totalC = evidence.reduce((s, e) => s + e.correctCount, 0);
    const accText = totalQ > 0 ? `${((totalC / totalQ) * 100).toFixed(0)}%` : null;

    const card = document.createElement("article");
    card.className = "tracking-card";

    const header = document.createElement("div");
    header.className = "tracking-card-header";

    const chip = document.createElement("span");
    chip.className = "subject-chip";
    chip.textContent = subject?.name ?? "Sem disciplina";
    chip.style.setProperty("--subject-color", `var(${colorVarForKey(subject?.color ?? "DISC-BLUE")})`);

    const title = document.createElement("span");
    title.className = "tracking-unit-title";
    title.textContent = unit.title;

    header.append(chip, title, createTrackingStateBadge(state));

    const meta = document.createElement("div");
    meta.className = "tracking-card-meta";
    const parts = [formatDate(unit.studyDate)];
    if (unit.sourceText) parts.push(unit.sourceText);
    parts.push(unit.summaryBody ? "Resumo ✓" : "Resumo —");
    if (accText) parts.push(`${accText} · ${totalQ} q`);
    parts.push(`${doneTasks.length}/${tasks.length} revisões`);

    const nextPending = pendingTasks.sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
    if (nextPending) parts.push(`Próx. ${formatDate(nextPending.dueDate)}`);

    meta.textContent = parts.join(" · ");

    // AC-ACOMP-05: quick actions — open unit (Plano), add Resumo, go to pending review
    const actions = document.createElement("div");
    actions.className = "tracking-card-actions";

    const goToPlanBtn = document.createElement("button");
    goToPlanBtn.className = "small-button";
    goToPlanBtn.type = "button";
    goToPlanBtn.textContent = "Ver no Plano";
    goToPlanBtn.addEventListener("click", () => {
      showScreen("plan");
      // after render, expand this unit
      renderPlan().then(() => {
        const row = document.querySelector(`[data-unit-id="${unit.id}"]`);
        if (row) {
          row.scrollIntoView({ behavior: "smooth", block: "center" });
          const expandBtn = row.querySelector(".plan-expand-btn");
          if (expandBtn && !row.classList.contains("is-expanded")) expandBtn.click();
        }
      }).catch(console.error);
    });

    actions.append(goToPlanBtn);

    if (!unit.summaryBody) {
      const addSummaryBtn = document.createElement("button");
      addSummaryBtn.className = "small-button";
      addSummaryBtn.type = "button";
      addSummaryBtn.textContent = "+ Resumo Mestre";
      addSummaryBtn.addEventListener("click", () => {
        showScreen("plan");
        renderPlan().then(() => {
          const row = document.querySelector(`[data-unit-id="${unit.id}"]`);
          if (!row) return;
          row.scrollIntoView({ behavior: "smooth", block: "center" });
          const expandBtn = row.querySelector(".plan-expand-btn");
          if (expandBtn && expandBtn.getAttribute("aria-expanded") !== "true") expandBtn.click();
          setTimeout(() => {
            const editBtn = row.querySelector(".plan-edit-summary-btn");
            if (editBtn) {
              editBtn.scrollIntoView({ behavior: "smooth", block: "nearest" });
              editBtn.click();
            }
          }, 350);
        }).catch(console.error);
      });
      actions.append(addSummaryBtn);
    }

    if (nextPending) {
      const goToReviewBtn = document.createElement("button");
      goToReviewBtn.className = "small-button";
      goToReviewBtn.type = "button";
      goToReviewBtn.textContent = `Ir para revisão`;
      goToReviewBtn.addEventListener("click", () => {
        if (nextPending.dueDate <= today) {
          // Overdue or due today: visible on Hoje screen.
          showScreen("today");
          renderToday().then(() => {
            setTimeout(() => {
              const reviewRow = document.querySelector(`[data-review-id="${nextPending.id}"]`);
              if (reviewRow) reviewRow.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 300);
          }).catch(console.error);
        } else {
          // Due tomorrow or future: not on Hoje. Navigate to Plano and expand the unit.
          showScreen("plan");
          renderPlan().then(() => {
            const row = document.querySelector(`[data-unit-id="${unit.id}"]`);
            if (!row) return;
            row.scrollIntoView({ behavior: "smooth", block: "center" });
            const expandBtn = row.querySelector(".plan-expand-btn");
            if (expandBtn && expandBtn.getAttribute("aria-expanded") !== "true") expandBtn.click();
          }).catch(console.error);
        }
      });
      actions.append(goToReviewBtn);
    }

    card.append(header, meta, actions);
    trackingList.append(card);
  }
}

function buildColorPicker(container, selectedKey, onSelect) {
  if (!container) return;
  container.replaceChildren();
  for (const key of SUBJECT_COLOR_KEYS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "color-swatch";
    btn.dataset.colorKey = key;
    btn.style.setProperty("--swatch-color", `var(${colorVarForKey(key)})`);
    btn.setAttribute("aria-label", key.replace("DISC-", "").toLowerCase());
    if (key === selectedKey) btn.classList.add("is-selected");
    btn.addEventListener("click", () => {
      for (const b of container.querySelectorAll(".color-swatch")) b.classList.remove("is-selected");
      btn.classList.add("is-selected");
      onSelect(key);
    });
    container.append(btn);
  }
}

export async function renderDisciplinas() {
  if (!subjectsCatalog) return;
  const [subjects, allUnits, allEvidence] = await Promise.all([
    DB.subjects.getAll(),
    DB.learningUnits.getAll(),
    DB.learningEvidence.getAll(),
  ]);
  const unitsBySubject = new Map();
  for (const u of allUnits) {
    if (!unitsBySubject.has(u.subjectId)) unitsBySubject.set(u.subjectId, []);
    unitsBySubject.get(u.subjectId).push(u);
  }
  const evidenceByUnit = new Map();
  for (const ev of allEvidence) {
    if (!evidenceByUnit.has(ev.unitId)) evidenceByUnit.set(ev.unitId, []);
    evidenceByUnit.get(ev.unitId).push(ev);
  }

  subjectsCatalogEmpty.hidden = subjects.length > 0;
  subjectsCatalog.replaceChildren();

  for (const subj of subjects) {
    const units = unitsBySubject.get(subj.id) ?? [];
    const subjectEvidence = units.flatMap((u) => evidenceByUnit.get(u.id) ?? []);
    const totalQ = subjectEvidence.reduce((s, e) => s + e.questionsCount, 0);
    const totalC = subjectEvidence.reduce((s, e) => s + e.correctCount, 0);
    const acc = totalQ > 0 ? `${((totalC / totalQ) * 100).toFixed(0)}%` : null;

    const card = document.createElement("article");
    card.className = `subject-catalog-card${subj.isActive ? "" : " is-archived"}`;
    card.dataset.subjectId = String(subj.id);

    const chipRow = document.createElement("div");
    chipRow.className = "subject-catalog-chip-row";

    const chip = document.createElement("span");
    chip.className = "subject-chip";
    chip.textContent = subj.name;
    chip.style.setProperty("--subject-color", `var(${colorVarForKey(subj.color ?? "DISC-BLUE")})`);

    const archiveLabel = document.createElement("span");
    archiveLabel.className = "subject-archive-label";
    archiveLabel.textContent = subj.isActive ? "" : "Arquivada";
    archiveLabel.hidden = subj.isActive;

    chipRow.append(chip, archiveLabel);

    const metaEl = document.createElement("div");
    metaEl.className = "subject-catalog-meta";
    const metaParts = [`${units.length} aula${units.length !== 1 ? "s" : ""}`];
    if (acc) metaParts.push(`${acc} média`);
    metaEl.textContent = metaParts.join(" · ");

    // Edit form (inline, initially hidden)
    const editForm = document.createElement("div");
    editForm.className = "subject-catalog-edit";
    editForm.hidden = true;

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "subject-edit-name";
    nameInput.value = subj.name;
    nameInput.maxLength = 100;

    let editColor = subj.color ?? "DISC-BLUE";
    const colorPickerEl = document.createElement("div");
    colorPickerEl.className = "color-picker";
    colorPickerEl.setAttribute("role", "radiogroup");
    buildColorPicker(colorPickerEl, editColor, (k) => { editColor = k; });

    const editMessage = document.createElement("p");
    editMessage.className = "form-message";
    editMessage.setAttribute("role", "status");

    const saveEditBtn = document.createElement("button");
    saveEditBtn.className = "small-button is-primary";
    saveEditBtn.type = "button";
    saveEditBtn.textContent = "Salvar";

    const cancelEditBtn = document.createElement("button");
    cancelEditBtn.className = "small-button";
    cancelEditBtn.type = "button";
    cancelEditBtn.textContent = "Cancelar";

    const editActions = document.createElement("div");
    editActions.className = "form-actions";
    editActions.append(saveEditBtn, cancelEditBtn, editMessage);
    editForm.append(nameInput, colorPickerEl, editActions);

    saveEditBtn.addEventListener("click", async () => {
      const newName = nameInput.value.trim();
      const editNameErr = validateNamingField(newName, "o nome da disciplina");
      if (editNameErr) { editMessage.textContent = editNameErr; nameInput.focus(); return; }
      try {
        await DB.subjects.update(subj.id, { name: newName, color: editColor });
        await renderDisciplinas();
        // refresh other screens that show chips
        if (document.querySelector('#screen-today:not([hidden])') || document.querySelector('#review-dashboard')) {
          renderToday().catch(console.error);
        }
        renderPlan().catch(console.error);
      } catch { editMessage.textContent = "Erro ao salvar."; }
    });
    cancelEditBtn.addEventListener("click", () => { editForm.hidden = true; });

    // Action buttons
    const actions = document.createElement("div");
    actions.className = "subject-catalog-actions";

    const editBtn = document.createElement("button");
    editBtn.className = "small-button";
    editBtn.type = "button";
    editBtn.textContent = "Editar";
    editBtn.addEventListener("click", () => {
      editForm.hidden = false;
      nameInput.focus();
    });

    const archiveBtn = document.createElement("button");
    archiveBtn.className = "small-button";
    archiveBtn.type = "button";
    archiveBtn.textContent = subj.isActive ? "Arquivar" : "Reativar";
    archiveBtn.addEventListener("click", async () => {
      try {
        await DB.subjects.update(subj.id, { isActive: !subj.isActive });
        await renderDisciplinas();
      } catch { }
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "small-button is-danger";
    deleteBtn.type = "button";
    deleteBtn.textContent = "Excluir";
    deleteBtn.addEventListener("click", async () => {
      // AC-DISC-04: hard delete only when no learning_units
      if (units.length > 0) {
        const msg = card.querySelector(".subject-catalog-delete-msg");
        if (msg) msg.textContent = "Não é possível excluir: há aulas nesta disciplina. Arquive-a primeiro.";
        return;
      }
      const confirmed = await showConfirm(`Excluir disciplina "${subj.name}"? Essa ação não pode ser desfeita.`);
      if (!confirmed) return;
      try {
        await DB.subjects.delete(subj.id);
        await renderDisciplinas();
      } catch { }
    });

    const deleteMsg = document.createElement("p");
    deleteMsg.className = "subject-catalog-delete-msg field-message";
    deleteMsg.setAttribute("role", "alert");

    actions.append(editBtn, archiveBtn, deleteBtn);
    card.append(chipRow, metaEl, editForm, actions, deleteMsg);
    subjectsCatalog.append(card);
  }
}

function buildSparkline(scores, width = 60, height = 24) {
  const pts = scores.slice(-5);
  if (pts.length < 2) return null;
  const minY = Math.min(...pts);
  const maxY = Math.max(...pts);
  const rangeY = maxY - minY || 1;
  const pad = 2;
  const xStep = (width - pad * 2) / (pts.length - 1);
  const points = pts
    .map((v, i) => {
      const x = pad + i * xStep;
      const y = pad + (1 - (v - minY) / rangeY) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", width);
  svg.setAttribute("height", height);
  svg.setAttribute("aria-hidden", "true");
  svg.className.baseVal = "sparkline";
  const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  polyline.setAttribute("points", points);
  polyline.setAttribute("fill", "none");
  polyline.setAttribute("stroke", "currentColor");
  polyline.setAttribute("stroke-width", "1.5");
  polyline.setAttribute("stroke-linejoin", "round");
  svg.append(polyline);
  return svg;
}

export async function renderStatsByUnit() {
  if (!unitStatsList) return;
  const [evidence, units, subjects] = await Promise.all([
    DB.learningEvidence.getAll(),
    DB.learningUnits.getAll(),
    DB.subjects.getAll(),
  ]);
  let results = Analytics.byUnit(evidence, units, subjects);
  const subjectsById = new Map(subjects.map((s) => [s.id, s]));

  // Populate subject filter
  if (statsUnitFilterSubject && statsUnitFilterSubject.options.length <= 1) {
    for (const s of subjects.filter((s) => s.isActive)) {
      const opt = document.createElement("option");
      opt.value = String(s.id);
      opt.textContent = s.name;
      statsUnitFilterSubject.append(opt);
    }
  }

  // Apply filters (AC-EST2-04)
  const subjFilter = statsUnitFilterSubject?.value ?? "";
  const trendFilter = statsUnitFilterTrend?.value ?? "";
  const unitPeriodFilter = statsUnitFilterPeriod?.value ?? "";
  if (subjFilter) results = results.filter((r) => String(r.subjectId) === subjFilter);
  if (trendFilter) results = results.filter((r) => r.trend.direction === trendFilter);
  if (unitPeriodFilter) {
    const days = unitPeriodFilter === "last-30" ? 30 : unitPeriodFilter === "last-90" ? 90 : 365;
    const cutoff = subtractDays(today, days);
    results = results.filter((r) => r.lastEvidence?.evidenceDate != null && r.lastEvidence.evidenceDate >= cutoff);
  }

  // Sort (AC-EST2-05)
  const unitSortValue = statsUnitSort?.value ?? "worst-first";
  if (unitSortValue === "trend") {
    const trendOrder = { DECLINING: 0, INSUFFICIENT: 1, STABLE: 2, IMPROVING: 3 };
    results = results.sort((a, b) => (trendOrder[a.trend.direction] ?? 1) - (trendOrder[b.trend.direction] ?? 1));
  } else if (unitSortValue === "volume") {
    results = results.sort((a, b) => b.evidenceCount - a.evidenceCount);
  } else if (unitSortValue === "subject") {
    results = results.sort((a, b) => (a.subjectName ?? "").localeCompare(b.subjectName ?? "") || (a.unitTitle ?? "").localeCompare(b.unitTitle ?? ""));
  } else if (unitSortValue === "last-activity") {
    results = results.sort((a, b) => {
      const da = a.lastEvidence?.evidenceDate;
      const db = b.lastEvidence?.evidenceDate;
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return db.localeCompare(da);
    });
  } else {
    // worst-first (default): worst recent score → best
    results = results.sort((a, b) => {
      if (a.weightedAccuracy == null && b.weightedAccuracy == null) return 0;
      if (a.weightedAccuracy == null) return 1;
      if (b.weightedAccuracy == null) return -1;
      return a.weightedAccuracy - b.weightedAccuracy;
    });
  }

  const hasData = results.some((r) => r.evidenceCount > 0);
  unitStatsEmpty.hidden = results.length > 0;
  unitStatsList.replaceChildren();

  for (const r of results) {
    const subject = subjectsById.get(r.subjectId);
    const row = document.createElement("article");
    row.className = "unit-stats-row";

    const header = document.createElement("div");
    header.className = "unit-stats-header";

    const chip = document.createElement("span");
    chip.className = "subject-chip";
    chip.textContent = r.subjectName;
    chip.style.setProperty("--subject-color", `var(${colorVarForKey(r.color)})`);

    const title = document.createElement("span");
    title.className = "unit-stats-title";
    title.textContent = r.unitTitle;

    header.append(chip, title);

    const body = document.createElement("div");
    body.className = "unit-stats-body";

    const sparkEl = buildSparkline(r.scoresSequence);
    if (sparkEl) body.append(sparkEl);

    const meta = document.createElement("div");
    meta.className = "unit-stats-meta";

    const accText = r.weightedAccuracy != null
      ? `${r.weightedAccuracy.toFixed(1).replace(".", ",")}% · ${r.totalQuestions} q`
      : "Sem evidência";
    meta.textContent = accText;
    if (r.lastEvidence) {
      const lastDate = document.createElement("span");
      lastDate.className = "unit-stats-last";
      lastDate.textContent = ` · ${formatDate(r.lastEvidence.evidenceDate)}`;
      meta.append(lastDate);
    }

    const trendBadge = createTrendBadge(r.trend.direction);

    body.append(meta, trendBadge);
    row.append(header, body);
    unitStatsList.append(row);
  }
}

function renderEvolutionSvg(evidence, units, subjects) {
  if (!evolutionSvg) return false;
  const subjectFilter = evolutionFilterSubject?.value ?? "";
  const periodMonths = Number(evolutionFilterPeriod?.value ?? "6");
  const today = getLocalDateValue();
  const cutoff = periodMonths > 0
    ? (() => { const d = new Date(`${today}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - periodMonths); return d.toISOString().slice(0, 7); })()
    : "0000-01";

  // Map unitId → subjectId
  const unitToSubject = new Map(units.map((u) => [u.id, u.subjectId]));
  const subjectsById = new Map(subjects.map((s) => [s.id, s]));

  // Group evidence by month + subject, compute weighted_accuracy per month per subject
  const dataBySubject = new Map();
  for (const ev of evidence) {
    const month = ev.evidenceDate.slice(0, 7);
    if (month < cutoff) continue;
    const subjectId = unitToSubject.get(ev.unitId);
    if (!subjectId) continue;
    if (subjectFilter && String(subjectId) !== subjectFilter) continue;
    if (!dataBySubject.has(subjectId)) dataBySubject.set(subjectId, new Map());
    const monthMap = dataBySubject.get(subjectId);
    if (!monthMap.has(month)) monthMap.set(month, { q: 0, c: 0 });
    const m = monthMap.get(month);
    m.q += ev.questionsCount;
    m.c += ev.correctCount;
  }

  if (dataBySubject.size === 0) { evolutionSvg.hidden = true; return false; }

  // Collect all months and sort
  const allMonths = [...new Set(
    [...dataBySubject.values()].flatMap((mm) => [...mm.keys()])
  )].sort();

  if (allMonths.length < 1) { evolutionSvg.hidden = true; return false; }

  // Build series per subject
  const series = [];
  for (const [subjectId, monthMap] of dataBySubject) {
    const subject = subjectsById.get(subjectId);
    const points = allMonths.map((m) => {
      const d = monthMap.get(m);
      return d && d.q > 0 ? (d.c / d.q) * 100 : null;
    });
    series.push({ subject, points, subjectId });
  }

  // SVG layout
  const W = 320, H = 160, padL = 36, padR = 12, padT = 10, padB = 28;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  evolutionSvg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  evolutionSvg.setAttribute("width", "100%");
  evolutionSvg.setAttribute("height", H);
  evolutionSvg.replaceChildren();

  const ns = "http://www.w3.org/2000/svg";

  // Y axis labels 0 / 50 / 100
  for (const pct of [0, 50, 100]) {
    const y = padT + chartH * (1 - pct / 100);
    const text = document.createElementNS(ns, "text");
    text.setAttribute("x", padL - 4);
    text.setAttribute("y", y + 4);
    text.setAttribute("text-anchor", "end");
    text.setAttribute("font-size", "9");
    text.setAttribute("fill", "currentColor");
    text.setAttribute("opacity", "0.5");
    text.textContent = `${pct}%`;
    evolutionSvg.append(text);
    const line = document.createElementNS(ns, "line");
    line.setAttribute("x1", padL);
    line.setAttribute("x2", W - padR);
    line.setAttribute("y1", y);
    line.setAttribute("y2", y);
    line.setAttribute("stroke", "currentColor");
    line.setAttribute("stroke-width", "0.5");
    line.setAttribute("opacity", "0.2");
    evolutionSvg.append(line);
  }

  // X axis labels (month abbreviations)
  const xStep = allMonths.length > 1 ? chartW / (allMonths.length - 1) : chartW;
  for (let i = 0; i < allMonths.length; i++) {
    const x = padL + i * xStep;
    const [year, month] = allMonths[i].split("-");
    const label = new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(new Date(`${allMonths[i]}-15T12:00:00`));
    const text = document.createElementNS(ns, "text");
    text.setAttribute("x", x);
    text.setAttribute("y", H - padB + 14);
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("font-size", "9");
    text.setAttribute("fill", "currentColor");
    text.setAttribute("opacity", "0.6");
    text.textContent = label;
    evolutionSvg.append(text);
  }

  // Lines per subject
  const palette = ["#3b82f6", "#16a34a", "#7c3aed", "#ea580c", "#dc2626", "#0d9488", "#db2777", "#4338ca"];
  series.forEach(({ points, subject }, idx) => {
    const color = palette[idx % palette.length];
    const pts = [];
    for (let i = 0; i < points.length; i++) {
      if (points[i] == null) continue;
      const x = padL + i * xStep;
      const y = padT + chartH * (1 - points[i] / 100);
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    if (pts.length < 1) return;
    if (pts.length === 1) {
      const [x, y] = pts[0].split(",");
      const circle = document.createElementNS(ns, "circle");
      circle.setAttribute("cx", x);
      circle.setAttribute("cy", y);
      circle.setAttribute("r", "3");
      circle.setAttribute("fill", color);
      evolutionSvg.append(circle);
    } else {
      const polyline = document.createElementNS(ns, "polyline");
      polyline.setAttribute("points", pts.join(" "));
      polyline.setAttribute("fill", "none");
      polyline.setAttribute("stroke", color);
      polyline.setAttribute("stroke-width", "2");
      polyline.setAttribute("stroke-linejoin", "round");
      polyline.setAttribute("stroke-linecap", "round");
      evolutionSvg.append(polyline);
    }
    // Legend label
    if (subject) {
      const lastPt = pts[pts.length - 1];
      const [lx, ly] = lastPt.split(",");
      const text = document.createElementNS(ns, "text");
      text.setAttribute("x", Number(lx) + 3);
      text.setAttribute("y", Number(ly) + 4);
      text.setAttribute("font-size", "8");
      text.setAttribute("fill", color);
      text.textContent = subject.name;
      evolutionSvg.append(text);
    }
  });

  evolutionSvg.hidden = false;
  return true;
}

export async function renderSettings() {
  const settings = await DB.settings.get();
  lastBackupLabel.textContent = settings?.lastBackupAt
    ? `Último backup: ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(settings.lastBackupAt))}`
    : "Nenhum backup exportado.";

  // T22: importAll/clearAll are explicitly NOT_YET_SUPPORTED in remote
  // mode (T20) — restoring a snapshot into the server, and a full-account
  // wipe, are real operations the migration phase (T25+) and an explicit
  // future owned-reset endpoint must define deliberately, not something a
  // client-only local-DB affordance can honestly offer against someone
  // else's data authority. Rather than leave buttons that fail every
  // click, this is the "safe explanatory state" tasks.md T22 asks for:
  // hidden buttons, a plain-language reason in their place.
  if (chooseBackupFileButton) chooseBackupFileButton.hidden = REMOTE_MODE;
  if (resetDatabaseButton) resetDatabaseButton.hidden = REMOTE_MODE;
  if (REMOTE_MODE) {
    setResetMessage("Apagar todos os dados ainda não é uma operação suportada no modo servidor.");
  }
  // T28: legacy-import migration only exists against the real server
  // (T25-T27) — no local-only equivalent, so it's REMOTE_MODE-only,
  // mirroring how import/reset are REMOTE_MODE-only in the opposite
  // direction above.
  if (migrationCard) migrationCard.hidden = !REMOTE_MODE;
}

function hasTauriRuntime() {
  return typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__?.invoke);
}

// Salva o JSON em disco. O wrapper remoto não recebe diálogo/FS nativos:
// nele, exportar permanece um download do próprio WebView. O caminho nativo
// fica restrito ao legado local, onde as permissões correspondentes existem.
async function saveBackupFile(filename, contents) {
  if (hasTauriRuntime() && !REMOTE_MODE) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    const path = await save({
      defaultPath: filename,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!path) return false; // usuário cancelou
    await writeTextFile(path, contents);
    return true;
  }

  const blob = new Blob([contents], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return true;
}

export async function exportBackup() {
  exportBackupButton.disabled = true;
  backupMessage.classList.remove("is-error");
  backupMessage.textContent = "";
  try {
    const data = await DB.exportAll();
    const contents = JSON.stringify(data, null, 2);
    const saved = await saveBackupFile(
      `smartlearn-backup-${getLocalDateValue()}.json`,
      contents,
    );
    if (!saved) {
      return; // exportação cancelada pelo usuário
    }

    // Best-effort bookkeeping only — the export itself already succeeded
    // and was saved, so a failure here (e.g. remote mode doesn't track
    // lastBackupAt at all, per T18's settings contract) must never turn
    // an already-successful export into a reported failure.
    try {
      await DB.settings.update({ lastBackupAt: new Date().toISOString() });
    } catch (metaError) {
      console.warn("Não foi possível registrar a data do último backup.", metaError);
    }
    await renderSettings();
    backupMessage.textContent = "Backup exportado com sucesso.";
  } catch (error) {
    backupMessage.classList.add("is-error");
    backupMessage.textContent = "Não foi possível exportar o backup.";
    console.error("Falha ao exportar backup.", error);
  } finally {
    exportBackupButton.disabled = false;
  }
}

function readFileText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsText(file);
  });
}

function setResetMessage(message = "", isError = false) {
  resetMessage.classList.toggle("is-error", isError);
  resetMessage.textContent = message;
}

function setMigrationMessage(message = "", isError = false) {
  if (!migrationMessage) return;
  migrationMessage.classList.toggle("is-error", isError);
  migrationMessage.textContent = message;
}

function resetMigrationPanels() {
  migrationActivePreview = null;
  migrationLastReport = null;
  if (migrationPreviewPanel) migrationPreviewPanel.hidden = true;
  if (migrationResultPanel) migrationResultPanel.hidden = true;
  if (migrationCounts) migrationCounts.replaceChildren();
  if (migrationWarnings) migrationWarnings.replaceChildren();
  if (migrationConflicts) migrationConflicts.replaceChildren();
}

function renderMigrationPreview(preview) {
  migrationActivePreview = preview;
  if (migrationCounts) {
    migrationCounts.replaceChildren();
    for (const [key, value] of Object.entries(preview.counts ?? {})) {
      const dt = document.createElement("dt");
      dt.textContent = MigrationUI.entityLabel(key);
      const dd = document.createElement("dd");
      dd.textContent = String(value);
      migrationCounts.append(dt, dd);
    }
  }
  if (migrationWarnings) {
    migrationWarnings.replaceChildren();
    for (const warning of preview.warnings ?? []) {
      const li = document.createElement("li");
      li.textContent = warning.message ?? warning.code ?? String(warning);
      migrationWarnings.append(li);
    }
  }
  const hasConflicts = (preview.conflicts ?? []).length > 0;
  if (migrationConflicts) {
    migrationConflicts.replaceChildren();
    for (const conflict of preview.conflicts ?? []) {
      const li = document.createElement("li");
      li.textContent = conflict.reason === 'ARCHIVED_HOMONYM'
        ? `"${conflict.name}" já existe nesta conta como disciplina arquivada — reative-a nas Disciplinas ou renomeie a de origem e envie o arquivo novamente.`
        : `"${conflict.name}" já existe nesta conta — renomeie a disciplina de origem e envie o arquivo novamente para importar este item.`;
      migrationConflicts.append(li);
    }
  }
  if (migrationConfirmBtn) migrationConfirmBtn.disabled = hasConflicts;
  if (migrationPreviewPanel) migrationPreviewPanel.hidden = false;
  if (migrationResultPanel) migrationResultPanel.hidden = true;
  setMigrationMessage(hasConflicts
    ? "Há conflitos de nome — resolva-os antes de confirmar (veja a lista abaixo)."
    : "Revise os itens acima. Confirmar grava esses dados nesta conta.");
}

migrationChooseFileButton?.addEventListener("click", () => {
  migrationFileInput?.click();
});

migrationFileInput?.addEventListener("change", async () => {
  const [file] = migrationFileInput.files ?? [];
  if (!file) return;
  resetMigrationPanels();
  setMigrationMessage("Lendo e validando o arquivo...");
  try {
    const rawSource = JSON.parse(await readFileText(file));
    const result = await MigrationUI.previewImport(rawSource);
    if (!result.ok) {
      setMigrationMessage(result.message || "Não foi possível gerar a prévia desta importação.", true);
      return;
    }
    renderMigrationPreview(result.preview);
  } catch (error) {
    setMigrationMessage(
      error instanceof SyntaxError
        ? "O arquivo selecionado não contém JSON válido."
        : "Não foi possível ler o arquivo selecionado.",
      true,
    );
    console.error("Falha ao gerar prévia de migração.", error);
  } finally {
    migrationFileInput.value = "";
  }
});

migrationCancelBtn?.addEventListener("click", () => {
  resetMigrationPanels();
  setMigrationMessage("Importação cancelada. Nenhum dado foi alterado.");
});

migrationConfirmBtn?.addEventListener("click", async () => {
  if (!migrationActivePreview) return;
  const confirmed = await showConfirm(
    "Confirmar grava estes dados de forma real e definitiva nesta conta. Continuar?",
  );
  if (!confirmed) return;

  migrationConfirmBtn.disabled = true;
  setMigrationMessage("Confirmando importação...");
  try {
    const result = await MigrationUI.commitImportPreview(migrationActivePreview.id);
    if (!result.ok) {
      setMigrationMessage(result.message || "Não foi possível confirmar a importação.", true);
      migrationConfirmBtn.disabled = false; // still on the preview panel — must stay clickable to retry
      return;
    }
    migrationLastReport = MigrationUI.buildMigrationReport({ preview: migrationActivePreview, commit: result.commit });
    if (migrationPreviewPanel) migrationPreviewPanel.hidden = true;
    if (migrationResultPanel) migrationResultPanel.hidden = false;
    if (migrationResultSummary) {
      const parts = Object.entries(result.commit.counts ?? {})
        .map(([key, value]) => `${MigrationUI.entityLabel(key)}: ${value}`);
      migrationResultSummary.textContent = `Importação concluída — ${parts.join(", ")}.`;
    }
    setMigrationMessage("");
    // Deliberately NOT re-enabling migrationConfirmBtn here: the preview
    // panel is now hidden, so its own enabled/disabled state is moot until
    // the next previewImport() explicitly sets it — resetting it here on a
    // delay (after these renders) could otherwise race a fresh preview the
    // user already started uploading and silently re-enable a
    // conflict-blocked confirm underneath them.
    await Promise.all([renderSubjects(), renderStudies(), renderToday(), renderStats()]);
  } catch (error) {
    setMigrationMessage("Não foi possível confirmar a importação.", true);
    migrationConfirmBtn.disabled = false;
    console.error("Falha ao confirmar migração.", error);
  }
});

migrationDownloadReportBtn?.addEventListener("click", async () => {
  if (!migrationLastReport) return;
  await saveBackupFile(
    `smartlearn-migracao-${getLocalDateValue()}.json`,
    JSON.stringify(migrationLastReport, null, 2),
  );
});

function setSourcesMessage(message = "", isError = false) {
  if (!sourcesMessage) return;
  sourcesMessage.classList.toggle("is-error", isError);
  sourcesMessage.textContent = message;
}

function createSourceProposalItem(proposal) {
  const li = document.createElement("li");
  li.className = "source-proposal-item";
  li.dataset.proposalId = String(proposal.id);

  const range = createTextElement(
    "p",
    "source-proposal-range",
    proposal.pageStart === proposal.pageEnd ? `Página ${proposal.pageStart}` : `Páginas ${proposal.pageStart}–${proposal.pageEnd}`,
  );

  const titleInput = document.createElement("input");
  titleInput.type = "text";
  titleInput.className = "source-proposal-title-input";
  titleInput.value = proposal.title;

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "small-button";
  saveBtn.dataset.action = "save-proposal-title";
  saveBtn.textContent = "Salvar título";

  const toggleBtn = document.createElement("button");
  toggleBtn.type = "button";
  toggleBtn.className = "text-button";
  toggleBtn.dataset.action = "toggle-proposal-excerpt";
  toggleBtn.textContent = "Ver trecho da fonte";

  const excerpt = createTextElement("p", "source-proposal-excerpt", proposal.excerpt);
  excerpt.hidden = true;

  const generateDraftBtn = document.createElement("button");
  generateDraftBtn.type = "button";
  generateDraftBtn.className = "small-button";
  generateDraftBtn.dataset.action = "generate-draft";
  generateDraftBtn.textContent = "Gerar rascunho com IA";

  const draftPanel = document.createElement("div");
  draftPanel.className = "source-draft-panel";
  draftPanel.hidden = true;

  li.append(range, titleInput, saveBtn, toggleBtn, excerpt, generateDraftBtn, draftPanel);
  return li;
}

// T38: renders one generated draft for inspection/acceptance. Every
// rendering carries the same explicit caveat — this is unverified AI
// output, not a medical/scientific claim (design.md/T37/T38).
// PRODUCT-REAL-01 P1_PRODUCT A: before this, accepting a draft could only
// ever create a NEW subject (free-text name) — a returning student adding
// more material to a discipline they already created had no way to pick
// it, and typing the existing name outright failed ("Já existe uma
// disciplina com esse nome."). The server already supports accepting
// with either `subjectId` (existing) or `newSubjectName` (create) — see
// accept-draft.js — this was a client-only gap. Mirrors the exact same
// existing-vs-new pattern Plano's own new-unit form already uses.
function renderDraftPanel(draftPanel, draft, subjects = []) {
  draftPanel.dataset.draftId = String(draft.id);
  draftPanel.dataset.revision = String(draft.revision);
  draftPanel.replaceChildren();

  const caveat = createTextElement(
    "p",
    "source-draft-caveat",
    "Rascunho gerado por IA — não verificado. Revise cada questão antes de aceitar; isto não é uma validação científica ou médica do conteúdo.",
  );
  const summary = createTextElement("p", "source-draft-summary", draft.summary);

  const questionsList = document.createElement("ul");
  questionsList.className = "source-draft-questions";
  for (const question of draft.questions ?? []) {
    const item = document.createElement("li");
    item.append(
      createTextElement("p", "source-draft-question", question.question),
      createTextElement("p", "source-draft-answer", question.answer),
    );
    questionsList.append(item);
  }

  const subjectSelect = document.createElement("select");
  subjectSelect.className = "source-draft-subject-select";
  subjectSelect.setAttribute("aria-label", "Disciplina existente");
  const newSubjectOption = document.createElement("option");
  newSubjectOption.value = "";
  newSubjectOption.textContent = "+ Nova disciplina (usar campo abaixo)";
  subjectSelect.append(newSubjectOption);
  for (const subject of subjects) {
    const opt = document.createElement("option");
    opt.value = String(subject.id);
    opt.textContent = subject.name;
    subjectSelect.append(opt);
  }

  const subjectInput = document.createElement("input");
  subjectInput.type = "text";
  subjectInput.className = "source-draft-subject-input";
  subjectInput.placeholder = "Nome da disciplina";
  subjectInput.setAttribute("aria-label", "Nome da disciplina");

  subjectSelect.addEventListener("change", () => {
    const pickedExisting = subjectSelect.value !== "";
    subjectInput.disabled = pickedExisting;
    if (pickedExisting) subjectInput.value = "";
  });

  const dateInput = document.createElement("input");
  dateInput.type = "date";
  dateInput.className = "source-draft-date-input";
  dateInput.value = getLocalDateValue();
  dateInput.setAttribute("aria-label", "Data da aula");

  const acceptBtn = document.createElement("button");
  acceptBtn.type = "button";
  acceptBtn.className = "primary-button";
  acceptBtn.dataset.action = "accept-draft";
  acceptBtn.textContent = "Aceitar e criar aula";

  const resultMessage = createTextElement("p", "source-draft-result", "");

  draftPanel.append(caveat, summary, questionsList, subjectSelect, subjectInput, dateInput, acceptBtn, resultMessage);
  draftPanel.hidden = false;
}

function renderSourceProposals(proposals) {
  if (!sourcesProposalsList) return;
  sourcesProposalsList.replaceChildren();
  for (const proposal of proposals) {
    sourcesProposalsList.append(createSourceProposalItem(proposal));
  }
  if (sourcesProposalsPanel) sourcesProposalsPanel.hidden = proposals.length === 0;
}

sourcesChooseFileButton?.addEventListener("click", () => {
  sourcesFileInput?.click();
});

sourcesFileInput?.addEventListener("change", async () => {
  const [file] = sourcesFileInput.files ?? [];
  if (!file) return;
  if (sourcesProposalsPanel) sourcesProposalsPanel.hidden = true;
  if (sourcesProposalsList) sourcesProposalsList.replaceChildren();

  try {
    setSourcesMessage("Enviando PDF...");
    const uploadResult = await SourceProposalsUI.uploadSource(file);
    if (!uploadResult.ok) {
      setSourcesMessage(uploadResult.message || "Não foi possível enviar o arquivo.", true);
      return;
    }

    setSourcesMessage("Extraindo texto do PDF...");
    const extractResult = await SourceProposalsUI.extractSource(uploadResult.source.id);
    if (!extractResult.ok) {
      setSourcesMessage(extractResult.message || "Não foi possível extrair o texto do PDF.", true);
      return;
    }
    if (extractResult.extraction.status !== "EXTRACTED") {
      const reasons = {
        ENCRYPTED: "Este PDF está criptografado e não pode ser lido.",
        TIMEOUT: "A extração excedeu o tempo limite.",
        IMAGE_ONLY_OR_UNREADABLE: "Este PDF parece ser apenas imagem (sem texto extraível).",
        EXTRACTION_FAILED: "Não foi possível extrair o texto deste PDF.",
      };
      setSourcesMessage(reasons[extractResult.extraction.status] || "Não foi possível extrair o texto deste PDF.", true);
      return;
    }

    setSourcesMessage("Gerando trechos propostos...");
    const chunkResult = await SourceProposalsUI.chunkSource(uploadResult.source.id);
    if (!chunkResult.ok) {
      setSourcesMessage(chunkResult.message || "Não foi possível gerar propostas para este PDF.", true);
      return;
    }

    renderSourceProposals(chunkResult.proposals);
    setSourcesMessage(`${chunkResult.proposals.length} trecho(s) proposto(s). Revise e ajuste os títulos antes de qualquer uso.`);
  } catch (error) {
    setSourcesMessage("Não foi possível processar o arquivo selecionado.", true);
    console.error("Falha ao processar fonte enviada.", error);
  } finally {
    sourcesFileInput.value = "";
  }
});

sourcesProposalsList?.addEventListener("click", async (event) => {
  const item = event.target.closest(".source-proposal-item");
  if (!item) return;
  const proposalId = item.dataset.proposalId;

  const toggleBtn = event.target.closest('[data-action="toggle-proposal-excerpt"]');
  if (toggleBtn) {
    const excerptEl = item.querySelector(".source-proposal-excerpt");
    if (!excerptEl) return;
    if (excerptEl.hidden) {
      const result = await SourceProposalsUI.getProposal(proposalId);
      if (result.ok) excerptEl.textContent = result.proposal.excerpt;
      excerptEl.hidden = false;
      toggleBtn.textContent = "Ocultar trecho da fonte";
    } else {
      excerptEl.hidden = true;
      toggleBtn.textContent = "Ver trecho da fonte";
    }
    return;
  }

  const saveBtn = event.target.closest('[data-action="save-proposal-title"]');
  if (saveBtn) {
    const input = item.querySelector(".source-proposal-title-input");
    if (!input) return;
    saveBtn.disabled = true;
    try {
      const result = await SourceProposalsUI.renameProposal(proposalId, input.value);
      if (result.ok) {
        setSourcesMessage("Título atualizado.");
      } else {
        setSourcesMessage(result.message || "Não foi possível salvar o título.", true);
      }
    } finally {
      saveBtn.disabled = false;
    }
    return;
  }

  const generateDraftBtn = event.target.closest('[data-action="generate-draft"]');
  if (generateDraftBtn) {
    const draftPanel = item.querySelector(".source-draft-panel");
    if (!draftPanel) return;
    generateDraftBtn.disabled = true;
    setSourcesMessage("Gerando rascunho com IA...");
    try {
      const result = await DraftReviewUI.generateDraft(proposalId);
      if (!result.ok) {
        setSourcesMessage(result.message || "Não foi possível gerar o rascunho.", true);
        return;
      }
      // P1_PRODUCT A: existing subjects, so the accept form can offer
      // reusing one instead of only ever creating a new one.
      const existingSubjects = await DB.subjects.getActive().catch(() => []);
      renderDraftPanel(draftPanel, result.draft, existingSubjects);
      setSourcesMessage("Rascunho gerado. Revise antes de aceitar.");
    } finally {
      generateDraftBtn.disabled = false;
    }
    return;
  }

  const acceptDraftBtn = event.target.closest('[data-action="accept-draft"]');
  if (acceptDraftBtn) {
    const draftPanel = item.querySelector(".source-draft-panel");
    if (!draftPanel) return;
    const draftId = draftPanel.dataset.draftId;
    const subjectSelect = draftPanel.querySelector(".source-draft-subject-select");
    const subjectInput = draftPanel.querySelector(".source-draft-subject-input");
    const dateInput = draftPanel.querySelector(".source-draft-date-input");
    const resultMessage = draftPanel.querySelector(".source-draft-result");

    // P1_PRODUCT A: an existing subject picked in the select wins over the
    // free-text field — the server's own contract already distinguishes
    // subjectId (reuse) from newSubjectName (create); this was only ever
    // a client gap.
    const pickedSubjectId = subjectSelect?.value ? Number(subjectSelect.value) : null;

    acceptDraftBtn.disabled = true;
    try {
      const result = await DraftReviewUI.acceptDraft(draftId, {
        subjectId: pickedSubjectId ?? undefined,
        newSubjectName: pickedSubjectId ? undefined : subjectInput?.value,
        studyDate: dateInput?.value,
        expectedRevision: Number(draftPanel.dataset.revision),
      });
      if (!result.ok) {
        if (resultMessage) { resultMessage.classList.add("is-error"); resultMessage.textContent = result.message || "Não foi possível aceitar o rascunho."; }
        acceptDraftBtn.disabled = false;
        return;
      }
      if (resultMessage) {
        resultMessage.classList.remove("is-error");
        resultMessage.textContent = `Aula criada: ${result.acceptance.exerciseCount} exercício(s), ${result.acceptance.reviewCount} revisões agendadas.`;
      }
      acceptDraftBtn.textContent = "Aceito";
      // PV1-01: continuity after accept — the acceptance response already
      // carries the created unit (real contract field: `acceptance.unit`,
      // confirmed in server/src/services/accept-draft.js's `unitDto`), so
      // "Estudar agora" needs no extra fetch. The user should never have
      // to go find the just-created unit in Plano/Hoje themselves.
      if (!draftPanel.querySelector('[data-action="study-now"]')) {
        const studyNowBtn = document.createElement("button");
        studyNowBtn.type = "button";
        studyNowBtn.className = "primary-button";
        studyNowBtn.dataset.action = "study-now";
        studyNowBtn.textContent = "Estudar agora";
        studyNowBtn.addEventListener("click", () => {
          startStudyNow(result.acceptance.unit, result.acceptance.subject?.name);
        });
        draftPanel.append(studyNowBtn);
      }
      await Promise.all([renderSubjects(), renderStudies(), renderToday()]);
    } catch (error) {
      if (resultMessage) { resultMessage.classList.add("is-error"); resultMessage.textContent = "Não foi possível aceitar o rascunho."; }
      console.error("Falha ao aceitar rascunho.", error);
      acceptDraftBtn.disabled = false;
    }
  }
});

// PV1-01: the first learning journey's focused study surface — reachable
// via "Estudar agora" right after accepting a draft, not necessarily a
// permanent nav item (task's own wording). Reuses the existing
// DB.attempts/DB.exercises/DB.learningEvidence contracts exactly as the
// Hoje review UI does (see ensureAttemptStarted above) — the one real
// difference is deliberate: no reviewTaskId is ever passed (this is
// INITIAL_PRACTICE, not a scheduled review), and no review_task is ever
// created or completed by this flow. One question at a time, per spec.
let studyNowState = null;

async function startStudyNow(unit, subjectName) {
  if (!unit) return;
  studyNowSubjectEl.textContent = subjectName ?? "";
  studyNowTitleEl.textContent = unit.title ?? "";
  if (unit.summaryBody) {
    studyNowSummaryCard.hidden = false;
    studyNowSummaryBody.textContent = unit.summaryBody;
  } else {
    studyNowSummaryCard.hidden = true;
    studyNowSummaryBody.textContent = "";
  }
  studyNowResultCard.hidden = true;
  studyNowResultText.textContent = "";
  studyNowNextReviewText.textContent = "";
  studyNowReviewErrorsBtn.hidden = true;
  studyNowErrorsList.hidden = true;
  studyNowErrorsList.replaceChildren();
  studyNowState = { unitId: unit.id, exercises: [], index: 0, attemptId: null, correctCount: 0, answeredCount: 0, wrongExercises: [] };
  showScreen("study-now", { focus: true });

  try {
    studyNowState.exercises = await DB.exercises.getAll(unit.id);
  } catch (error) {
    console.error("Falha ao carregar exercícios da unidade.", error);
    studyNowState.exercises = [];
  }
  renderStudyNowQuestion();
}

function renderStudyNowQuestion() {
  const state = studyNowState;
  if (!state) return;

  if (state.exercises.length === 0) {
    studyNowQuestionArea.hidden = true;
    studyNowNoExercises.hidden = false;
    studyNowProgress.textContent = "";
    return;
  }

  if (state.index >= state.exercises.length) {
    finishStudyNowSession();
    return;
  }

  studyNowNoExercises.hidden = true;
  studyNowQuestionArea.hidden = false;

  const exercise = state.exercises[state.index];
  studyNowQuestionText.textContent = exercise.questionText;
  studyNowAnswerText.textContent = exercise.answerText;
  studyNowAnswerText.hidden = true;
  if (exercise.hintText) {
    // Honest reuse, not invention: shown unconditionally exactly like the
    // Hoje review UI already does (a hint the learner can already see is
    // truthfully "available", not a fabricated NONE for it).
    studyNowHintText.textContent = exercise.hintText;
    studyNowHintText.hidden = false;
  } else {
    studyNowHintText.hidden = true;
    studyNowHintText.textContent = "";
  }
  studyNowJudgment.hidden = true;
  studyNowRevealBtn.hidden = false;
  studyNowRevealBtn.textContent = "Ver resposta";
  studyNowProgress.textContent = `Questão ${state.index + 1} de ${state.exercises.length}`;
  state.attemptId = null;
  delete studyNowQuestionArea.dataset.attemptId;
}

async function finishStudyNowSession() {
  const state = studyNowState;
  if (!state) return;
  studyNowQuestionArea.hidden = true;
  studyNowProgress.textContent = "";

  const { unitId, answeredCount, correctCount } = state;
  if (answeredCount > 0) {
    try {
      await DB.learningEvidence.create({
        unitId,
        context: "INITIAL_PRACTICE",
        questionsCount: answeredCount,
        correctCount,
        evidenceDate: getLocalDateValue(),
      });
    } catch (error) {
      console.error("Falha ao registrar evidência de prática inicial.", error);
    }
  }

  const pct = answeredCount > 0 ? ((correctCount / answeredCount) * 100).toFixed(1).replace(".", ",") : "0,0";
  studyNowResultText.textContent = `${correctCount}/${answeredCount} corretas — ${pct}%`;

  try {
    const tasks = await DB.reviewTasks.getByUnit(unitId);
    const next = getNextReview(unitId, tasks);
    studyNowNextReviewText.textContent = next ? `Próxima revisão: ${formatDate(next)}` : "Nenhuma revisão pendente.";
  } catch (error) {
    console.error("Falha ao buscar próxima revisão.", error);
    studyNowNextReviewText.textContent = "";
  }

  // Slice 2: the session must not end on a bare score alone — the wrong
  // answers are the most valuable part of it. Reuses exactly the
  // question/answer this same session already showed; no new quiz
  // mechanism, no new analytics, no schema change.
  if (state.wrongExercises.length > 0) {
    studyNowReviewErrorsBtn.hidden = false;
    studyNowReviewErrorsBtn.textContent = `Revisar meus erros (${state.wrongExercises.length})`;
    studyNowErrorsList.replaceChildren();
    for (const wrong of state.wrongExercises) {
      const li = document.createElement("li");
      li.className = "study-now-error-item";
      li.append(
        createTextElement("p", "study-now-error-question", wrong.questionText),
        createTextElement("p", "study-now-error-answer", wrong.answerText),
      );
      studyNowErrorsList.append(li);
    }
  } else {
    studyNowReviewErrorsBtn.hidden = true;
    studyNowErrorsList.hidden = true;
  }

  studyNowResultCard.hidden = false;
  studyNowState = null;
  renderPlan().catch((error) => console.error("Falha ao atualizar plano.", error));
  renderToday().catch((error) => console.error("Falha ao atualizar Hoje.", error));
}

studyNowReviewErrorsBtn?.addEventListener("click", () => {
  studyNowErrorsList.hidden = !studyNowErrorsList.hidden;
  studyNowReviewErrorsBtn.setAttribute("aria-expanded", String(!studyNowErrorsList.hidden));
});

studyNowRevealBtn?.addEventListener("click", async () => {
  const state = studyNowState;
  if (!state || state.index >= state.exercises.length) return;
  const exercise = state.exercises[state.index];

  studyNowAnswerText.hidden = false;
  studyNowJudgment.hidden = false;
  studyNowRevealBtn.hidden = true;

  if (REMOTE_MODE && DB.attempts) {
    try {
      // No reviewTaskId: this is INITIAL_PRACTICE, never a scheduled review.
      const attempt = await DB.attempts.start(exercise.id);
      state.attemptId = attempt.id;
      // Real, observable signal (same idiom as ensureAttemptStarted's
      // exItem.dataset.attemptId above) — lets tests confirm a real
      // server-owned attempt exists without a dedicated listing endpoint.
      studyNowQuestionArea.dataset.attemptId = String(attempt.id);
      if (exercise.hintText) {
        try { await DB.attempts.useHint(attempt.id); }
        catch (error) { console.error("Falha ao registrar uso de dica (prática inicial).", error); }
      }
      await DB.attempts.revealSolution(attempt.id);
    } catch (error) {
      console.error("Falha ao iniciar tentativa (prática inicial).", error);
    }
  }
});

async function judgeStudyNow(isCorrect) {
  const state = studyNowState;
  if (!state || state.index >= state.exercises.length) return;

  state.answeredCount += 1;
  if (isCorrect) {
    state.correctCount += 1;
  } else {
    // Slice 2 (SMARTLEARN_PRODUCT_FIRST_V1): keep the exact question/answer
    // this session already has in memory — no new fetch, no new quiz
    // mechanism, just remembering what was already shown so the result
    // screen can offer "Revisar meus erros" instead of ending on a bare score.
    const exercise = state.exercises[state.index];
    state.wrongExercises.push({ questionText: exercise.questionText, answerText: exercise.answerText });
  }

  if (REMOTE_MODE && DB.attempts && state.attemptId) {
    try {
      await DB.attempts.submit(state.attemptId, { outcome: isCorrect ? "CORRECT" : "INCORRECT", assessmentMethod: "SELF_REPORT" });
    } catch (error) {
      console.error("Falha ao registrar resultado (prática inicial).", error);
    }
  }

  state.index += 1;
  renderStudyNowQuestion();
}

studyNowCorrectBtn?.addEventListener("click", () => judgeStudyNow(true));
studyNowIncorrectBtn?.addEventListener("click", () => judgeStudyNow(false));

export async function importBackup(file) {
  backupMessage.classList.remove("is-error");
  backupMessage.textContent = "";
  try {
    const data = JSON.parse(await readFileText(file));
    await DB.importAll(data);
    await renderSubjects();
    await Promise.all([renderToday(), renderStats(), renderSettings()]);
    backupMessage.textContent = "Backup importado com sucesso.";
    showScreen("today", { focus: true });
  } catch (error) {
    backupMessage.classList.add("is-error");
    backupMessage.textContent = error instanceof SyntaxError
      ? "O arquivo selecionado não contém JSON válido."
      : "O backup é inválido ou não pôde ser importado.";
    console.error("Falha ao importar backup.", error);
  }
}

async function generateReviewTasks(studyData) {
  const { studyDate } = studyData;
  const tasks = generateInitialTasks(studyDate).map((t) => ({
    ...t,
    reviewDone: false,
    questionsDone: false,
  }));

  return DB.learningUnits.createWithReviews(studyData, tasks);
}


function setSubjectMessage(message = "") {
  subjectMessage.textContent = message;
}

function setSubjectManagerMessage(message = "") {
  subjectManagerMessage.textContent = message;
}

function setSubjectFormVisible(visible) {
  newSubjectForm.hidden = !visible;
  showSubjectFormButton.setAttribute("aria-expanded", String(visible));
  setSubjectMessage();

  if (visible) {
    newSubjectInput.focus();
  }
}

function setStudyManagerMessage(message = "") {
  studyManagerMessage.textContent = message;
}

function resetRegisterState() {
  activeSubjectEditId = null;
  activeStudyEditId = null;
  forgetSelection(LAST_SUBJECT_KEY);
  studyForm.reset();
  studyDateInput.value = getLocalDateValue();
  if (studySourceTextInput) studySourceTextInput.value = "";
  newSubjectForm.reset();
  setSubjectFormVisible(false);
  setSubjectManagerMessage();
  setStudyManagerMessage();
  studyMessage.classList.remove("is-error");
  studyMessage.textContent = "";
}

function pluralize(value, singular, plural) {
  return value === 1 ? singular : plural;
}

async function renderStudies() {
  const [learningUnits, subjects] = await Promise.all([
    DB.learningUnits.getAll(),
    DB.subjects.getAll(),
  ]);
  const subjectsById = new Map(subjects.map((subject) => [subject.id, subject]));

  studyList.replaceChildren();
  studiesEmpty.hidden = learningUnits.length > 0;

  for (const record of learningUnits) {
    const row = document.createElement("article");
    row.className = "study-row";
    row.dataset.studyId = String(record.id);

    const info = document.createElement("div");
    info.className = "study-info";

    const actions = document.createElement("div");
    actions.className = "study-actions";

    const subject = subjectsById.get(record.subjectId);

    if (record.id === activeStudyEditId) {
      row.classList.add("is-editing");

      const form = document.createElement("div");
      form.className = "study-edit-grid";

      const sourceLabel = document.createElement("label");
      sourceLabel.textContent = "Fonte";
      const sourceInput = document.createElement("input");
      sourceInput.type = "text";
      sourceInput.className = "study-edit-source";
      sourceInput.dataset.studyField = "sourceText";
      sourceInput.value = record.sourceText ?? "";
      sourceInput.maxLength = 200;
      sourceLabel.append(sourceInput);

      const dateLabel = document.createElement("label");
      dateLabel.textContent = "Data";
      const dateInput = document.createElement("input");
      dateInput.type = "date";
      dateInput.className = "study-edit-date";
      dateInput.dataset.studyField = "studyDate";
      dateInput.value = record.studyDate;
      dateLabel.append(dateInput);

      const contentLabel = document.createElement("label");
      contentLabel.textContent = "Conteúdo";
      const contentInput = document.createElement("textarea");
      contentInput.className = "study-edit-content";
      contentInput.rows = 3;
      contentInput.maxLength = 240;
      contentInput.dataset.studyField = "title";
      contentInput.value = record.title;
      contentLabel.append(contentInput);

      const error = document.createElement("span");
      error.className = "inline-edit-error";
      error.setAttribute("aria-live", "polite");

      form.append(sourceLabel, dateLabel, contentLabel, error);
      info.append(form);

      const saveButton = document.createElement("button");
      saveButton.className = "small-button is-primary";
      saveButton.type = "button";
      saveButton.dataset.action = "save-study";
      saveButton.textContent = "Salvar";

      const cancelButton = document.createElement("button");
      cancelButton.className = "small-button";
      cancelButton.type = "button";
      cancelButton.dataset.action = "cancel-study";
      cancelButton.textContent = "Cancelar";

      actions.append(saveButton, cancelButton);
    } else {
      info.append(createTextElement("p", "study-title", subject?.name ?? "Sem disciplina"));

      const meta = document.createElement("div");
      meta.className = "study-meta";
      meta.append(
        createTextElement("span", "study-source-tag", record.sourceText || ""),
        createTextElement("span", "study-date-tag", formatDate(record.studyDate)),
      );
      info.append(meta);
      info.append(createTextElement("p", "study-content", record.title || "Conteúdo indisponível"));

      const editButton = document.createElement("button");
      editButton.className = "small-button";
      editButton.type = "button";
      editButton.dataset.action = "edit-study";
      editButton.textContent = "Editar";
      actions.append(editButton);
    }

    // Exercises section (always rendered; toggle to show)
    const exercisesSection = document.createElement("div");
    exercisesSection.className = "study-exercises-section";
    exercisesSection.hidden = true;
    exercisesSection.dataset.exercisesFor = String(record.id);

    const exerciseList = document.createElement("div");
    exerciseList.className = "exercise-list";
    exerciseList.dataset.exerciseListFor = String(record.id);

    const exerciseAddForm = document.createElement("div");
    exerciseAddForm.className = "exercise-add-form";

    const qLabel = document.createElement("label");
    qLabel.textContent = "Enunciado";
    const qInput = document.createElement("textarea");
    qInput.rows = 2;
    qInput.className = "exercise-question-input";
    qInput.placeholder = "Enunciado da questão (obrigatório)";
    qLabel.append(qInput);

    const aLabel = document.createElement("label");
    aLabel.textContent = "Resposta";
    const aInput = document.createElement("textarea");
    aInput.rows = 2;
    aInput.className = "exercise-answer-input";
    aInput.placeholder = "Resposta esperada";
    aLabel.append(aInput);

    const hLabel = document.createElement("label");
    hLabel.textContent = "Dica (opcional)";
    const hInput = document.createElement("input");
    hInput.type = "text";
    hInput.className = "exercise-hint-input";
    hInput.placeholder = "Dica (opcional)";
    hLabel.append(hInput);

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "small-button is-primary";
    addBtn.dataset.action = "add-exercise";
    addBtn.dataset.studyId = String(record.id);
    addBtn.textContent = "Adicionar exercício";

    const exerciseFormMsg = createTextElement("p", "field-message exercise-form-message", "");
    exerciseFormMsg.setAttribute("role", "status");

    exerciseAddForm.append(qLabel, aLabel, hLabel, addBtn, exerciseFormMsg);
    exercisesSection.append(exerciseList, exerciseAddForm);

    const toggleExercisesBtn = document.createElement("button");
    toggleExercisesBtn.type = "button";
    toggleExercisesBtn.className = "small-button";
    toggleExercisesBtn.dataset.action = "toggle-exercises";
    toggleExercisesBtn.dataset.studyId = String(record.id);
    toggleExercisesBtn.textContent = "Exercícios";

    actions.append(toggleExercisesBtn);

    row.append(info, actions, exercisesSection);
    studyList.append(row);
  }
}

async function renderExerciseList(unitId) {
  const section = studyList.querySelector(`[data-exercises-for="${unitId}"]`);
  if (!section) return;
  const list = section.querySelector(`[data-exercise-list-for="${unitId}"]`);
  if (!list) return;

  const exercises = await DB.exercises.getAll(unitId);
  list.replaceChildren();
  for (const exercise of exercises) {
    const item = document.createElement("div");
    item.className = "exercise-item";
    item.dataset.exerciseId = String(exercise.id);

    const qEl = createTextElement("p", "exercise-question", exercise.questionText);
    const aEl = createTextElement("p", "exercise-answer", exercise.answerText);
    const hEl = exercise.hintText ? createTextElement("p", "exercise-hint", `Dica: ${exercise.hintText}`) : null;

    const itemActions = document.createElement("div");
    itemActions.className = "exercise-item-actions";

    const editExBtn = document.createElement("button");
    editExBtn.type = "button";
    editExBtn.className = "small-button";
    editExBtn.dataset.action = "edit-exercise";
    editExBtn.dataset.exerciseId = String(exercise.id);
    editExBtn.dataset.studyId = String(unitId);
    editExBtn.textContent = "Editar";

    const delExBtn = document.createElement("button");
    delExBtn.type = "button";
    delExBtn.className = "small-button is-danger";
    delExBtn.dataset.action = "delete-exercise";
    delExBtn.dataset.exerciseId = String(exercise.id);
    delExBtn.dataset.studyId = String(unitId);
    delExBtn.textContent = "Remover";

    itemActions.append(editExBtn, delExBtn);
    if (hEl) item.append(qEl, aEl, hEl, itemActions);
    else item.append(qEl, aEl, itemActions);
    list.append(item);
  }
}

async function renderSubjects(selectedId = subjectSelect.value) {
  const [activeSubjects, allSubjects] = await Promise.all([
    DB.subjects.getActive(),
    DB.subjects.getAll(),
  ]);
  subjectSelect.replaceChildren(new Option("Selecione...", ""));

  for (const subject of activeSubjects) {
    subjectSelect.add(new Option(subject.name, String(subject.id)));
  }

  if (selectedId !== undefined && selectedId !== null) {
    subjectSelect.value = String(selectedId);
  }

  if (!subjectSelect.value) {
    const remembered = recallSelection(LAST_SUBJECT_KEY);
    if (remembered && activeSubjects.some((subject) => String(subject.id) === remembered)) {
      subjectSelect.value = remembered;
    }
  }

  renderSubjectList(allSubjects);
}

function renderSubjectList(subjects) {
  subjectList.replaceChildren();
  subjectsEmpty.hidden = subjects.length > 0;

  for (const subject of subjects) {
    const row = document.createElement("article");
    row.className = "subject-row";
    row.classList.toggle("is-inactive", !subject.isActive);
    row.dataset.subjectId = String(subject.id);

    const info = document.createElement("div");
    info.className = "subject-info";

    const actions = document.createElement("div");
    actions.className = "subject-actions";

    if (subject.id === activeSubjectEditId) {
      // Modo edição inline
      row.classList.add("is-editing");

      const input = document.createElement("input");
      input.type = "text";
      input.className = "inline-edit-input";
      input.value = subject.name;
      input.id = `subject-edit-input-${subject.id}`;
      input.setAttribute("aria-label", "Novo nome da disciplina");
      input.setAttribute("autocomplete", "off");

      const error = document.createElement("span");
      error.className = "inline-edit-error";
      error.setAttribute("aria-live", "polite");

      info.append(input, error);

      const saveBtn = document.createElement("button");
      saveBtn.className = "small-button is-primary";
      saveBtn.type = "button";
      saveBtn.dataset.action = "save-subject";
      saveBtn.textContent = "Salvar";

      const cancelBtn = document.createElement("button");
      cancelBtn.className = "small-button";
      cancelBtn.type = "button";
      cancelBtn.dataset.action = "cancel-subject";
      cancelBtn.textContent = "Cancelar";

      actions.append(saveBtn, cancelBtn);
    } else {
      // Modo visualização
      info.append(createTextElement("p", "subject-name", subject.name));
      info.append(createTextElement("span", "subject-status", subject.isActive ? "Ativa" : "Desativada"));

      const editButton = document.createElement("button");
      editButton.className = "small-button";
      editButton.type = "button";
      editButton.dataset.action = "edit-subject";
      editButton.dataset.subjectName = subject.name;
      editButton.textContent = "Editar";

      const toggleButton = document.createElement("button");
      toggleButton.className = "small-button";
      toggleButton.type = "button";
      toggleButton.dataset.action = subject.isActive ? "deactivate-subject" : "activate-subject";
      toggleButton.textContent = subject.isActive ? "Desativar" : "Ativar";

      const deleteButton = document.createElement("button");
      deleteButton.className = "small-button is-danger";
      deleteButton.type = "button";
      deleteButton.dataset.action = "delete-subject";
      deleteButton.dataset.subjectName = subject.name;
      deleteButton.textContent = "Excluir";

      actions.append(editButton, toggleButton, deleteButton);
    }

    row.append(info, actions);
    subjectList.append(row);
  }
}

function isKnownScreen(screenId) {
  return screenPanels.some((panel) => panel.dataset.screenPanel === screenId);
}

const DATA_SCREENS = new Set(["today", "stats", "plan", "tracking", "subjects", "settings", "materials", "study-now"]);

// T22: "register" (#screen-register, "Cadastro") was removed from the NAV
// in a prior decision (P1-2), but is NOT dead — it is the only UI in the
// app that manages exercises (add/edit/delete), a real product capability
// with no other entry point today (confirmed by hands-on verification:
// Plano's own unit rows have no exercise-authoring section at all). An
// earlier version of this comment/redirect wrongly assumed it was a
// redundant duplicate of Plano's create-unit flow and redirected #register
// away, which would have made exercise management completely
// unreachable — reverted before landing. Preserving required entry
// behavior (per tasks.md T22) means leaving #register reachable exactly
// as P1-2 left it: nav-hidden, but a direct/bookmarked hash still works.
// A real fix (surfacing exercise management from Plano/Hoje instead of
// this legacy screen) is future UI work, not a T22 redirect decision.

export function showScreen(screenId, { focus = false } = {}) {
  let nextScreen = isKnownScreen(screenId) ? screenId : DEFAULT_SCREEN;

  // Remote mode: a data screen with no authenticated session is a login
  // requirement, not empty data — redirect to Conta rather than attempting
  // (and failing 401 on) a render.
  if (REMOTE_MODE && databaseAvailable && !authenticated && DATA_SCREENS.has(nextScreen)) {
    nextScreen = "account";
  }

  // PV1-01: Materiais is exclusive to LOCAL_DESKTOP_AUTHORITY — a direct/
  // bookmarked #materials hash must not expose the screen under plain
  // REMOTE_AUTHORITY (no local backend), even though the nav item is
  // already hidden for that case (hiding the nav button alone doesn't
  // stop a direct hash navigation).
  if (nextScreen === "materials" && !(REMOTE_MODE && LOCAL_AUTHORITY)) {
    nextScreen = DEFAULT_SCREEN;
  }

  for (const panel of screenPanels) {
    panel.hidden = panel.dataset.screenPanel !== nextScreen;
  }

  // SMARTLEARN_PRODUCT_FIRST_V1 Slice 4/5: found in a real manual journey
  // — the scrollable container (.app-main) kept whatever scroll offset the
  // PREVIOUS screen had, so switching screens after scrolling down landed
  // mid-content on the new screen instead of at its top (observed
  // navigating a scrolled Conta into Materiais — arrived mid-paragraph,
  // not at the "Materiais" heading). showScreen() is the one place every
  // real screen switch goes through; a same-screen re-click scrolling
  // back to top is reasonable, not a regression.
  if (mainContent) mainContent.scrollTop = 0;

  for (const item of navigationItems) {
    const isActive = item.dataset.screen === nextScreen;
    item.classList.toggle("is-active", isActive);
    item.setAttribute("aria-current", isActive ? "page" : "false");
  }

  if (window.location.hash !== `#${nextScreen}`) {
    window.history.replaceState(null, "", `#${nextScreen}`);
  }

  if (focus) {
    mainContent?.focus({ preventScroll: true });
  }

  if (nextScreen === "today" && databaseAvailable) {
    renderToday().catch((error) => console.error("Falha ao atualizar a tela Hoje.", error));
  }

  if (nextScreen === "stats" && databaseAvailable) {
    renderStats().catch((error) => console.error("Falha ao atualizar as estatísticas.", error));
  }
  if (nextScreen === "plan" && databaseAvailable) {
    renderPlan().catch((error) => console.error("Falha ao carregar plano.", error));
  }
  if (nextScreen === "tracking" && databaseAvailable) {
    renderTracking().catch((error) => console.error("Falha ao carregar acompanhamento.", error));
  }
  if (nextScreen === "subjects" && databaseAvailable) {
    renderDisciplinas().catch((error) => console.error("Falha ao carregar disciplinas.", error));
  }
  if (nextScreen === "settings" && databaseAvailable) {
    renderSettings().catch((error) => console.error("Falha ao carregar configurações.", error));
  }
  // T22: "register" (Cadastro, nav-hidden since P1-2) never had its own
  // list populated on plain navigation — renderStudies() only ran after a
  // submission through this same form, leaving units created elsewhere
  // (e.g. Plano) invisible here even though the underlying data is the
  // same. Exercise management lives exclusively on this screen (no other
  // entry point exists), so a unit not appearing here means its
  // exercises are unmanageable — a real, previously-silent gap, fixed by
  // wiring this screen's list to the same on-navigate pattern every
  // other screen already uses.
  if (nextScreen === "register" && databaseAvailable) {
    renderStudies().catch((error) => console.error("Falha ao carregar estudos.", error));
  }
  if (nextScreen === "account") {
    renderAccount().catch((error) => console.error("Falha ao carregar conta.", error));
  }
}

let currentThemePreference = getStoredThemePreference();

function renderThemePicker(preference = currentThemePreference) {
  if (!themePicker) return;

  themePicker.replaceChildren();

  for (const option of THEME_OPTIONS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "theme-option";
    button.setAttribute("role", "radio");
    button.dataset.themeOption = option.id;
    button.setAttribute("aria-checked", "false");

    const label = document.createElement("span");
    label.className = "theme-option-label";
    label.textContent = option.label;

    const description = document.createElement("span");
    description.className = "theme-option-description";
    description.textContent = option.description;

    button.append(label, description);
    themePicker.append(button);
  }

  syncThemePicker(preference);
}

// Destaca o tema ativo na tela de Configurações.
function syncThemePicker(preference) {
  if (!themePicker) return;

  for (const button of themePicker.querySelectorAll("[data-theme-option]")) {
    const isActive = button.dataset.themeOption === preference;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-checked", isActive ? "true" : "false");
  }
}

function setThemePreference(preference) {
  currentThemePreference = preference;
  applyThemePreference(preference, { persist: true });
  syncThemePicker(preference);
  // O gráfico de evolução usa cores do tema; redesenha após a troca.
  if (databaseAvailable) {
    renderStats().catch((error) => console.error("Falha ao redesenhar após troca de tema.", error));
  }
}

renderThemePicker(currentThemePreference);
applyThemePreference(currentThemePreference);

themeToggle.addEventListener("click", () => {
  const effectiveThemeId = resolveThemePreference(currentThemePreference, prefersDarkScheme.matches);
  const next = effectiveThemeId === "night" || effectiveThemeId === "contrast" ? "paper" : "night";
  setThemePreference(next);
});

themePicker?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-theme-option]");
  if (!button) return;
  setThemePreference(button.dataset.themeOption);
});

// No modo automático, acompanha mudanças de tema do sistema em tempo real.
prefersDarkScheme.addEventListener("change", () => {
  if (currentThemePreference === "auto") {
    applyThemePreference("auto");
    if (databaseAvailable) {
      renderStats().catch((error) => console.error("Falha ao redesenhar após troca de tema.", error));
    }
  }
});

syncThemePicker(currentThemePreference);

for (const item of navigationItems) {
  item.addEventListener("click", () => {
    showScreen(item.dataset.screen, { focus: true });
  });
}

window.addEventListener("hashchange", () => {
  showScreen(window.location.hash.slice(1));
});

showSubjectFormButton.addEventListener("click", () => {
  setSubjectFormVisible(newSubjectForm.hidden);
});

newSubjectForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = newSubjectInput.value.trim();
  const nameValidationError = validateNamingField(name, "o nome da disciplina");
  if (nameValidationError) {
    setSubjectMessage(nameValidationError);
    newSubjectInput.focus();
    return;
  }

  // AC-05: preserve draft values before re-render
  const draftDate = studyDateInput.value;
  const draftContent = studyContentInput.value;
  const draftSummary = studySummaryTextarea.value;
  const draftSource = studySourceTextInput ? studySourceTextInput.value : "";

  try {
    const subject = await DB.subjects.create(name);
    await renderSubjects(subject.id);
    newSubjectForm.reset();
    setSubjectFormVisible(false);

    // AC-05: restore draft values after re-render
    studyDateInput.value = draftDate;
    studyContentInput.value = draftContent;
    studySummaryTextarea.value = draftSummary;
    if (studySourceTextInput) studySourceTextInput.value = draftSource;
  } catch (error) {
    const isDuplicate = /unique|duplicate/i.test(String(error));
    setSubjectMessage(
      isDuplicate
        ? "Essa disciplina já está cadastrada."
        : "Não foi possível adicionar a disciplina. Tente novamente.",
    );
    newSubjectInput.focus();
  }
});

subjectList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  const row = event.target.closest(".subject-row");
  if (!button || !row) return;

  const subjectId = Number(row.dataset.subjectId);
  const currentName = button.dataset.subjectName;
  const action = button.dataset.action;

  // Ações do editor inline — tratadas antes do bloco de try comum.
  if (action === "edit-subject") {
    activeSubjectEditId = subjectId;
    await renderSubjects();
    document.getElementById(`subject-edit-input-${subjectId}`)?.focus();
    return;
  }

  if (action === "cancel-subject") {
    activeSubjectEditId = null;
    setSubjectManagerMessage();
    await renderSubjects();
    return;
  }

  if (action === "save-subject") {
    const input = row.querySelector(".inline-edit-input");
    const errorEl = row.querySelector(".inline-edit-error");
    const newName = input?.value?.trim() ?? "";
    if (!newName) {
      if (errorEl) errorEl.textContent = "Informe o nome da disciplina.";
      input?.focus();
      return;
    }
    try {
      await DB.subjects.update(subjectId, { name: newName });
      activeSubjectEditId = null;
      setSubjectMessage();
      setSubjectManagerMessage();
      await Promise.all([renderSubjects(), renderStudies(), renderToday(), renderStats()]);
    } catch (saveError) {
      const isDuplicate = /unique|duplicate/i.test(String(saveError));
      if (errorEl) {
        errorEl.textContent = isDuplicate
          ? "Essa disciplina já está cadastrada."
          : "Não foi possível renomear a disciplina.";
      }
      input?.focus();
    }
    return;
  }

  try {
    if (action === "deactivate-subject") {
      await DB.subjects.deactivate(subjectId);
    }

    if (action === "activate-subject") {
      await DB.subjects.update(subjectId, { isActive: true });
    }

    if (action === "delete-subject") {
      const confirmed = await showConfirm(
        `Confirma a exclusão de "${currentName}"? Esta ação não pode ser desfeita.`,
      );
      if (!confirmed) return;
      await DB.subjects.deleteIfEmpty(subjectId);
    }

    setSubjectMessage();
    setSubjectManagerMessage();
    await withScrollPreserved(() =>
      Promise.all([renderSubjects(), renderStudies(), renderToday(), renderStats()])
    );
  } catch (error) {
    const isDuplicate = /unique|duplicate/i.test(String(error));
    setSubjectManagerMessage(
      isDuplicate
        ? "Essa disciplina já está cadastrada."
        : "Não foi possível alterar a disciplina.",
    );
    console.error("Falha ao alterar disciplina.", error);
  }
});

subjectList.addEventListener("keydown", async (event) => {
  if (!activeSubjectEditId) return;
  if (!event.target.classList.contains("inline-edit-input")) return;
  const row = event.target.closest(".subject-row");
  if (!row) return;
  if (event.key === "Enter") {
    event.preventDefault();
    row.querySelector('[data-action="save-subject"]')?.click();
  }
  if (event.key === "Escape") {
    event.preventDefault();
    activeSubjectEditId = null;
    setSubjectManagerMessage();
    await renderSubjects();
  }
});

studyList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  const row = event.target.closest(".study-row");
  if (!button || !row) return;

  const studyId = Number(row.dataset.studyId);
  const action = button.dataset.action;

  if (action === "toggle-exercises") {
    const section = row.querySelector(`[data-exercises-for="${studyId}"]`);
    if (!section) return;
    section.hidden = !section.hidden;
    if (!section.hidden) {
      await renderExerciseList(studyId);
    }
    return;
  }

  if (action === "add-exercise") {
    const section = row.querySelector(`[data-exercises-for="${studyId}"]`);
    const qInput = section?.querySelector(".exercise-question-input");
    const aInput = section?.querySelector(".exercise-answer-input");
    const hInput = section?.querySelector(".exercise-hint-input");
    const msgEl = section?.querySelector(".exercise-form-message");
    const questionText = qInput?.value.trim() ?? "";
    if (!questionText) {
      if (msgEl) { msgEl.classList.add("is-error"); msgEl.textContent = "Informe o enunciado do exercício."; }
      qInput?.focus();
      return;
    }
    button.disabled = true;
    try {
      await DB.exercises.create(studyId, {
        questionText,
        answerText: aInput?.value.trim() ?? "",
        hintText: hInput?.value.trim() || null,
        provenance: 'MANUAL',
      });
      if (qInput) qInput.value = "";
      if (aInput) aInput.value = "";
      if (hInput) hInput.value = "";
      if (msgEl) { msgEl.classList.remove("is-error"); msgEl.textContent = "Exercício adicionado."; }
      await renderExerciseList(studyId);
    } catch (error) {
      if (msgEl) { msgEl.classList.add("is-error"); msgEl.textContent = "Não foi possível salvar o exercício."; }
      console.error("Falha ao salvar exercício.", error);
    } finally {
      button.disabled = false;
    }
    return;
  }

  if (action === "delete-exercise") {
    const exerciseId = Number(button.dataset.exerciseId);
    if (!exerciseId) return;
    button.disabled = true;
    try {
      await DB.exercises.delete(exerciseId);
      await renderExerciseList(studyId);
    } catch (error) {
      button.disabled = false;
      console.error("Falha ao remover exercício.", error);
    }
    return;
  }

  if (action === "edit-exercise") {
    const exerciseId = Number(button.dataset.exerciseId);
    if (!exerciseId) return;
    const item = button.closest(".exercise-item");
    if (!item) return;
    // Replace item with inline edit form
    const currentQ = item.querySelector(".exercise-question")?.textContent ?? "";
    const currentA = item.querySelector(".exercise-answer")?.textContent ?? "";
    const hintEl = item.querySelector(".exercise-hint");
    const currentH = hintEl ? hintEl.textContent.replace(/^Dica:\s*/, "") : "";

    const editForm = document.createElement("div");
    editForm.className = "exercise-item exercise-item-edit";

    const eq = document.createElement("textarea");
    eq.rows = 2; eq.value = currentQ; eq.className = "exercise-question-input";
    const ea = document.createElement("textarea");
    ea.rows = 2; ea.value = currentA; ea.className = "exercise-answer-input";
    const eh = document.createElement("input");
    eh.type = "text"; eh.value = currentH; eh.placeholder = "Dica (opcional)"; eh.className = "exercise-hint-input";

    const saveEx = document.createElement("button");
    saveEx.type = "button"; saveEx.className = "small-button is-primary";
    saveEx.dataset.action = "save-exercise-edit";
    saveEx.dataset.exerciseId = String(exerciseId);
    saveEx.dataset.studyId = String(studyId);
    saveEx.textContent = "Salvar";

    const cancelEx = document.createElement("button");
    cancelEx.type = "button"; cancelEx.className = "small-button";
    cancelEx.dataset.action = "cancel-exercise-edit";
    cancelEx.dataset.studyId = String(studyId);
    cancelEx.textContent = "Cancelar";

    editForm.append(eq, ea, eh, saveEx, cancelEx);
    item.replaceWith(editForm);
    eq.focus();
    return;
  }

  if (action === "save-exercise-edit") {
    const exerciseId = Number(button.dataset.exerciseId);
    if (!exerciseId) return;
    const item = button.closest(".exercise-item-edit");
    const eq = item?.querySelector(".exercise-question-input");
    const ea = item?.querySelector(".exercise-answer-input");
    const eh = item?.querySelector(".exercise-hint-input");
    const questionText = eq?.value.trim() ?? "";
    if (!questionText) { eq?.focus(); return; }
    button.disabled = true;
    try {
      await DB.exercises.update(exerciseId, {
        questionText,
        answerText: ea?.value.trim() ?? "",
        hintText: eh?.value.trim() || null,
      });
      await renderExerciseList(studyId);
    } catch (error) {
      button.disabled = false;
      console.error("Falha ao salvar exercício.", error);
      const item = button.closest(".exercise-item-edit");
      let errMsg = item?.querySelector(".exercise-edit-error");
      if (!errMsg && item) {
        errMsg = document.createElement("span");
        errMsg.className = "exercise-edit-error form-error";
        item.appendChild(errMsg);
      }
      if (errMsg) errMsg.textContent = "Erro ao salvar. Tente novamente.";
    }
    return;
  }

  if (action === "cancel-exercise-edit") {
    await renderExerciseList(studyId);
    return;
  }

  if (action === "edit-study") {
    activeStudyEditId = studyId;
    setStudyManagerMessage();
    await renderStudies();
    studyList.querySelector(`[data-study-id="${studyId}"] .study-edit-content`)?.focus();
    return;
  }

  if (action === "cancel-study") {
    activeStudyEditId = null;
    setStudyManagerMessage();
    await renderStudies();
    return;
  }

  if (action === "save-study") {
    const sourceInput = row.querySelector(".study-edit-source");
    const dateInput = row.querySelector(".study-edit-date");
    const contentInput = row.querySelector(".study-edit-content");
    const errorEl = row.querySelector(".inline-edit-error");

    const sourceText = String(sourceInput?.value ?? "").trim();
    const studyDate = String(dateInput?.value ?? "").trim();
    const content = String(contentInput?.value ?? "").trim();

    if (!studyDate || !content) {
      if (errorEl) errorEl.textContent = "Data e conteúdo são obrigatórios.";
      if (!studyDate) dateInput?.focus();
      else contentInput?.focus();
      return;
    }

    try {
      await DB.learningUnits.update(studyId, { sourceText, studyDate, title: content });
      activeStudyEditId = null;
      setStudyManagerMessage();
      await Promise.all([renderStudies(), renderToday(), renderStats()]);
    } catch (error) {
      if (errorEl) errorEl.textContent = "Não foi possível salvar o estudo.";
      console.error("Falha ao salvar estudo.", error);
    }
  }
});

todayPrimaryActionBtn?.addEventListener("click", () => {
  const reviewId = todayPrimaryActionBtn.dataset.reviewId;
  if (!reviewId) return;
  const row = reviewDashboard.querySelector(`.review-row[data-review-id="${reviewId}"]`);
  if (!row) return;
  row.scrollIntoView({ behavior: "smooth", block: "start" });
  row.classList.add("is-highlighted");
  setTimeout(() => row.classList.remove("is-highlighted"), 2000);
});

reviewDashboard.addEventListener("click", (event) => {
  const button = event.target.closest('[data-action="toggle-external"]');
  if (!button) return;
  const row = button.closest(".review-row");
  const section = row?.querySelector(".review-external-section");
  if (!section) return;
  const expanded = button.getAttribute("aria-expanded") !== "true";
  button.setAttribute("aria-expanded", String(expanded));
  section.hidden = !expanded;
  if (expanded) section.querySelector(".external-questions-input")?.focus();
});

reviewDashboard.addEventListener("click", async (event) => {
  const button = event.target.closest('[data-action="submit-external"]');
  if (!button) return;
  const row = button.closest(".review-row");
  const unitId = Number(button.dataset.unitId);
  if (!unitId) return;
  const qInput = row?.querySelector(".external-questions-input");
  const aInput = row?.querySelector(".external-correct-input");
  const msgEl = row?.querySelector(".external-form-message");
  const questionsCount = Number(qInput?.value);
  const correctCount = Number(aInput?.value ?? 0);
  if (!questionsCount || questionsCount < 1) {
    if (msgEl) { msgEl.classList.add("is-error"); msgEl.textContent = "Informe o número de questões (mínimo 1)."; }
    qInput?.focus();
    return;
  }
  if (correctCount > questionsCount) {
    if (msgEl) { msgEl.classList.add("is-error"); msgEl.textContent = "Acertos não pode ser maior que questões."; }
    aInput?.focus();
    return;
  }
  button.disabled = true;
  try {
    const today = getLocalDateValue();
    await DB.learningEvidence.create({
      unitId,
      evidenceDate: today,
      context: "EXTERNAL",
      questionsCount,
      correctCount,
    });
    if (qInput) qInput.value = "";
    if (aInput) aInput.value = "";
    if (msgEl) {
      msgEl.classList.remove("is-error");
      const pct = ((correctCount / questionsCount) * 100).toFixed(1).replace(".", ",");
      msgEl.textContent = `Registrado: ${questionsCount} questões, ${correctCount} acertos (${pct}%).`;
    }
  } catch (error) {
    if (msgEl) { msgEl.classList.add("is-error"); msgEl.textContent = "Não foi possível registrar os exercícios."; }
    console.error("Falha ao registrar exercícios externos.", error);
  } finally {
    button.disabled = false;
  }
});

reviewDashboard.addEventListener("click", (event) => {
  const button = event.target.closest('[data-action="expand"]');
  if (!button) return;
  const detail = button.closest(".review-row")?.querySelector(".review-row-detail");
  if (!detail) return;
  const expanded = button.getAttribute("aria-expanded") !== "true";
  button.setAttribute("aria-expanded", String(expanded));
  detail.hidden = !expanded;
});

// T30: lazily starts a server-owned attempt the first time an exercise's
// answer is revealed in this review, then records the reveal itself as an
// attributable action. REMOTE_MODE-only (no local equivalent, same pattern
// as migration-ui.js) and best-effort: a failure here never blocks the
// existing reveal/judge UI or the aggregate evidence this review already
// saves — item-level tracking is additive, not a dependency of the save path.
async function ensureAttemptStarted(exItem) {
  if (!REMOTE_MODE || !DB.attempts || !exItem) return null;
  if (exItem.dataset.attemptId) return exItem.dataset.attemptId;
  const exerciseId = Number(exItem.dataset.exerciseId);
  if (!Number.isInteger(exerciseId)) return null;
  const reviewTaskId = Number(exItem.dataset.reviewTaskId);
  try {
    const attempt = await DB.attempts.start(exerciseId, { reviewTaskId: Number.isInteger(reviewTaskId) ? reviewTaskId : null });
    exItem.dataset.attemptId = String(attempt.id);
    // The hint (when this exercise has one) is already visible in the DOM
    // unconditionally, not gated behind its own action — so the truthful
    // observation is that assistance was available from the start, not a
    // fabricated NONE for a hint the learner could already see.
    if (exItem.querySelector(".review-exercise-hint")) {
      try { await DB.attempts.useHint(attempt.id); }
      catch (hintError) { console.error("Falha ao registrar uso de dica (item-level tracking).", hintError); }
    }
    return exItem.dataset.attemptId;
  } catch (error) {
    console.error("Falha ao iniciar tentativa de exercício (item-level tracking).", error);
    return null;
  }
}

reviewDashboard.addEventListener("click", async (event) => {
  const button = event.target.closest('[data-action="reveal-answer"]');
  if (!button) return;
  const exItem = button.closest(".review-exercise-item");
  const answerEl = button.nextElementSibling;
  if (!answerEl) return;
  const wasHidden = answerEl.hidden;
  answerEl.hidden = !answerEl.hidden;
  button.textContent = answerEl.hidden ? "Ver resposta" : "Ocultar resposta";
  if (!answerEl.hidden && exItem && exItem.dataset.exerciseAnswered !== "true") {
    const judgment = exItem.querySelector(".exercise-judgment");
    if (judgment) judgment.hidden = false;
  }
  if (wasHidden && !answerEl.hidden) {
    const attemptId = await ensureAttemptStarted(exItem);
    if (attemptId) {
      try { await DB.attempts.revealSolution(attemptId); }
      catch (error) { console.error("Falha ao registrar revelação de resposta (item-level tracking).", error); }
    }
  }
});

reviewDashboard.addEventListener("click", async (event) => {
  const button = event.target.closest('[data-action="exercise-acertei"], [data-action="exercise-errei"]');
  if (!button) return;
  const exItem = button.closest(".review-exercise-item");
  if (!exItem || exItem.dataset.exerciseAnswered === "true") return;

  const isCorrect = button.dataset.action === "exercise-acertei";
  exItem.dataset.exerciseAnswered = "true";
  exItem.classList.add(isCorrect ? "is-correct" : "is-wrong");

  if (REMOTE_MODE && DB.attempts && exItem.dataset.attemptId) {
    try {
      await DB.attempts.submit(exItem.dataset.attemptId, { outcome: isCorrect ? "CORRECT" : "INCORRECT", assessmentMethod: "SELF_REPORT" });
    } catch (error) {
      console.error("Falha ao registrar resultado da tentativa (item-level tracking).", error);
    }
  }
  for (const btn of exItem.querySelectorAll(".exercise-judgment button")) {
    btn.disabled = true;
  }
  button.classList.add("is-selected");

  const section = exItem.closest("[data-exercises-total]");
  if (!section) return;
  const answered = Number(section.dataset.exercisesAnswered) + 1;
  const correct = Number(section.dataset.exercisesCorrect) + (isCorrect ? 1 : 0);
  section.dataset.exercisesAnswered = String(answered);
  section.dataset.exercisesCorrect = String(correct);

  // Show running score in review-score-pill when all answered
  const total = Number(section.dataset.exercisesTotal);
  const row = section.closest(".review-row");
  if (answered === total && row) {
    const scorePercent = total > 0 ? (correct / total) * 100 : 0;
    for (const el of row.querySelectorAll("[data-score-for]")) {
      el.textContent = `${scorePercent.toFixed(1).replace(".", ",")}%`;
      el.classList.remove("is-empty");
    }
    section.dataset.allAnswered = "true";
  }
});

reviewDashboard.addEventListener("click", (event) => {
  const button = event.target.closest('[data-action="edit-summary"]');
  if (!button) return;
  const row = button.closest(".review-row");
  if (!row) return;
  const editArea = row.querySelector(".review-summary-edit");
  if (!editArea) return;
  editArea.hidden = !editArea.hidden;
  if (!editArea.hidden) {
    editArea.querySelector("textarea")?.focus();
  }
});

reviewDashboard.addEventListener("click", async (event) => {
  const button = event.target.closest('[data-action="save-summary"]');
  if (!button) return;
  const row = button.closest(".review-row");
  if (!row) return;
  const unitId = Number(row.dataset.unitId);
  if (!unitId) return;

  const textarea = row.querySelector(".review-summary-edit textarea");
  const messageEl = row.querySelector(".review-summary-message");
  const displayEl = row.querySelector(".review-summary-text");
  if (!textarea) return;

  const newSummaryBody = textarea.value.trim() || null;
  button.disabled = true;
  try {
    const updated = await DB.learningUnits.update(unitId, { summaryBody: newSummaryBody });
    if (displayEl && updated) {
      displayEl.textContent = updated.summaryBody ?? updated.title ?? "";
    }
    textarea.value = newSummaryBody ?? "";
    if (messageEl) {
      messageEl.classList.remove("is-error");
      messageEl.textContent = "Resumo salvo.";
      setTimeout(() => { messageEl.textContent = ""; }, 2000);
    }
    row.querySelector(".review-summary-edit").hidden = true;
  } catch (error) {
    if (messageEl) {
      messageEl.classList.add("is-error");
      messageEl.textContent = "Não foi possível salvar o resumo.";
    }
    console.error("Falha ao salvar resumo.", error);
  } finally {
    button.disabled = false;
  }
});

reviewDashboard.addEventListener("change", async (event) => {
  const input = event.target.closest('[data-action="review-done"]');
  if (!input) return;

  input.disabled = true;
  const taskId = Number(input.dataset.reviewId);
  try {
    const row = input.closest(".review-row");
    const exercisesSection = row?.querySelector("[data-exercises-total]");

    if (input.checked && exercisesSection) {
      const total = Number(exercisesSection.dataset.exercisesTotal);
      const answered = Number(exercisesSection.dataset.exercisesAnswered);
      const correct = Number(exercisesSection.dataset.exercisesCorrect);
      if (total > 0 && answered > 0) {
        await DB.completeReviewWithEvidence({ taskId, questionsCount: answered, correctCount: correct });
        setReviewMessage();
        await renderToday();
        return;
      }
    }

    await DB.reviewTasks.update(taskId, {
      reviewDone: input.checked,
      completedAt: input.checked ? new Date().toISOString() : null,
    });
    setReviewMessage();
    await renderToday();
  } catch (error) {
    input.checked = input.dataset.committedChecked === "true";
    input.disabled = false;
    setReviewMessage("Não foi possível salvar a revisão.", true);
    console.error("Falha ao atualizar a revisão.", error);
  }
});

exportBackupButton.addEventListener("click", exportBackup);

resetDatabaseButton.addEventListener("click", async () => {
  const confirmed = await showConfirm(
    "Apagar toda a base local? Exporte um backup antes se quiser guardar os dados atuais.",
  );
  if (!confirmed) return;

  resetDatabaseButton.disabled = true;
  setResetMessage();
  try {
    await DB.clearAll();
    resetRegisterState();
    await Promise.all([
      renderSubjects(),
      renderStudies(),
      renderToday(),
      renderStats(),
      renderSettings(),
    ]);
    setResetMessage("Base local apagada.");
  } catch (error) {
    setResetMessage("Não foi possível apagar a base local.", true);
    console.error("Falha ao apagar a base local.", error);
  } finally {
    resetDatabaseButton.disabled = false;
  }
});

chooseBackupFileButton.addEventListener("click", () => {
  importBackupInput.click();
});

importBackupInput.addEventListener("change", async () => {
  const [file] = importBackupInput.files;
  if (!file) return;
  const confirmed = await showConfirm("Isso substituirá todos os dados atuais. Continuar?");
  if (confirmed) await importBackup(file);
  importBackupInput.value = "";
});

dailySummaryBtn?.addEventListener("click", async () => {
  if (!dailySummaryPanel || !dailySummaryList) return;
  const today = getLocalDateValue();
  const todayStudies = await DB.learningUnits.getByDate(today);
  dailySummaryList.replaceChildren();
  for (const record of todayStudies) {
    const item = document.createElement("div");
    item.className = "daily-summary-item";
    const title = document.createElement("p");
    title.className = "daily-summary-title";
    title.textContent = record.title;
    const body = document.createElement("p");
    body.className = "daily-summary-body";
    body.textContent = record.summaryBody ?? record.title;
    item.append(title, body);
    dailySummaryList.append(item);
  }
  dailySummaryPanel.hidden = false;
  dailySummaryPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
});

dailySummaryClose?.addEventListener("click", () => {
  if (dailySummaryPanel) {
    dailySummaryPanel.hidden = true;
  }
});

reviewDashboard.addEventListener("focusout", async (event) => {
  const input = event.target.closest('[data-action="comment"]');
  if (!input) return;

  const previousValue = input.dataset.committedValue ?? "";
  try {
    const nextValue = input.value.trim();
    await DB.reviewTasks.update(Number(input.dataset.reviewId), {
      comment: nextValue || null,
    });
    input.dataset.committedValue = nextValue;
    setReviewMessage();
  } catch (error) {
    input.value = previousValue;
    setReviewMessage("Não foi possível salvar o comentário.", true);
    console.error("Falha ao salvar comentário.", error);
  }
});

function getScoreControls(card) {
  return {
    questionsInput: card.querySelector('[data-field="questionsCount"]'),
    correctInput: card.querySelector('[data-field="correctCount"]'),
  };
}

function getScoreState(card) {
  const controls = getScoreControls(card);
  const values = getReviewScoreValues(controls.questionsInput.value, controls.correctInput.value);
  controls.correctInput.setCustomValidity(getReviewScoreValidationMessage(values));
  return { ...controls, values };
}

function updateScoreDisplay(card) {
  const { values } = getScoreState(card);
  const text = values.scorePercent == null ? "—" : `${values.scorePercent.toFixed(1)}%`;
  for (const element of card.querySelectorAll("[data-score-for]")) {
    element.textContent = text;
    element.classList.toggle("is-empty", values.scorePercent == null);
  }
  return values;
}

function restoreCommittedScoreInputs(row) {
  const { questionsInput, correctInput } = getScoreControls(row);
  questionsInput.value = questionsInput.dataset.committedValue ?? "";
  correctInput.value = correctInput.dataset.committedValue ?? "";
  updateScoreDisplay(row);
}

function syncCommittedScoreInputs(row, values) {
  const { questionsInput, correctInput } = getScoreControls(row);
  questionsInput.dataset.committedValue = String(values.questionsCount ?? "");
  correctInput.dataset.committedValue = String(values.correctCount ?? "");
}

reviewDashboard.addEventListener("input", (event) => {
  if (!event.target.matches('[data-action="score-input"]')) return;
  const values = updateScoreDisplay(event.target.closest(".review-row"));
  if (!values.isOverflow) {
    setReviewMessage();
  }
});

reviewDashboard.addEventListener("focusout", async (event) => {
  const input = event.target.closest('[data-action="score-input"]');
  if (!input) return;
  const row = input.closest(".review-row");
  const { correctInput, values } = getScoreState(row);
  updateScoreDisplay(row);

  if (values.isOverflow) {
    setReviewMessage("Acertos não pode ser maior que Questões.", true);
    correctInput.reportValidity();
    setTimeout(() => correctInput.focus(), 0);
    return;
  }

  try {
    await DB.reviewTasks.update(Number(input.dataset.reviewId), values);
    syncCommittedScoreInputs(row, values);
    setReviewMessage();
  } catch (error) {
    restoreCommittedScoreInputs(row);
    setReviewMessage("Não foi possível salvar questões e acertos.", true);
    console.error("Falha ao salvar questões e acertos.", error);
  }
});

reviewDashboard.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || !event.target.matches('[data-action="score-input"]')) return;
  event.preventDefault();
  event.target.blur();
});

reviewDashboard.addEventListener("change", async (event) => {
  const input = event.target.closest('[data-action="questions-done"]');
  if (!input) return;

  const previousChecked = input.dataset.committedChecked === "true";
  try {
    await DB.reviewTasks.update(Number(input.dataset.reviewId), {
      questionsDone: input.checked,
    });
    input.dataset.committedChecked = String(input.checked);
    setReviewMessage();
  } catch (error) {
    input.checked = previousChecked;
    setReviewMessage("Não foi possível salvar o status das questões.", true);
    console.error("Falha ao salvar status das questões.", error);
  }
});

studyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  studyMessage.classList.remove("is-error");
  studyMessage.textContent = "";

  const subjectId = Number(subjectSelect.value);
  const sourceText = studySourceTextInput ? studySourceTextInput.value.trim() : "";
  const studyDate = studyDateInput.value;
  const content = studyContentInput.value.trim();
  const summaryBody = studySummaryTextarea.value.trim() || null;

  if (!subjectId || !studyDate || !content) {
    studyMessage.classList.add("is-error");
    if (!subjectId) {
      studyMessage.textContent = "Selecione uma disciplina.";
      subjectSelect.focus();
    } else if (!studyDate) {
      studyMessage.textContent = "Informe a data da aula.";
      studyDateInput.focus();
    } else {
      studyMessage.textContent = "Informe o conteúdo estudado.";
      studyContentInput.focus();
    }
    return;
  }
  const studyTitleError = validateTitleField(content, "o conteúdo estudado");
  if (studyTitleError) {
    studyMessage.classList.add("is-error");
    studyMessage.textContent = studyTitleError;
    studyContentInput.focus();
    return;
  }

  try {
    await generateReviewTasks({
      subjectId,
      sourceText,
      studyDate,
      title: content,
      summaryBody,
      operationKey: studySaveOperation.key,
    });
    studySaveOperation.renew();
    rememberSelection(LAST_SUBJECT_KEY, subjectId);
    await renderStudies();
    studyContentInput.value = "";
    studySummaryTextarea.value = "";
    if (studySourceTextInput) studySourceTextInput.value = "";
    studyMessage.textContent = "Estudo salvo. 16 revisões criadas.";
    studyContentInput.focus();
  } catch (error) {
    if (!(error instanceof NetworkError)) studySaveOperation.renew();
    studyMessage.classList.add("is-error");
    studyMessage.textContent = "Não foi possível salvar o estudo. Tente novamente.";
  }
});

studyDateInput.value = getLocalDateValue();
await dbInit;
if (databaseAvailable && authenticated) {
  await renderSubjects();
  await renderToday();
}

statsSubjectSort?.addEventListener("change", () => {
  if (databaseAvailable) renderStatsBySubject().catch(console.error);
});
statsUnitFilterSubject?.addEventListener("change", () => {
  if (databaseAvailable) renderStatsByUnit().catch(console.error);
});
statsUnitFilterTrend?.addEventListener("change", () => {
  if (databaseAvailable) renderStatsByUnit().catch(console.error);
});
evolutionFilterSubject?.addEventListener("change", async () => {
  if (!databaseAvailable) return;
  const [ev, units, subjs] = await Promise.all([DB.learningEvidence.getAll(), DB.learningUnits.getAll(), DB.subjects.getAll()]);
  const ok = renderEvolutionSvg(ev, units, subjs);
  chartEmpty.hidden = ok;
});
evolutionFilterPeriod?.addEventListener("change", async () => {
  if (!databaseAvailable) return;
  const [ev, units, subjs] = await Promise.all([DB.learningEvidence.getAll(), DB.learningUnits.getAll(), DB.subjects.getAll()]);
  const ok = renderEvolutionSvg(ev, units, subjs);
  chartEmpty.hidden = ok;
});

planFilterSubject?.addEventListener("change", () => {
  if (databaseAvailable) renderPlan().catch(console.error);
});
planFilterState?.addEventListener("change", () => {
  if (databaseAvailable) renderPlan().catch(console.error);
});
planSort?.addEventListener("change", () => {
  if (databaseAvailable) renderPlan().catch(console.error);
});

trackingFilterSubject?.addEventListener("change", () => {
  if (databaseAvailable) renderTracking().catch(console.error);
});
trackingFilterState?.addEventListener("change", () => {
  if (databaseAvailable) renderTracking().catch(console.error);
});
trackingFilterPeriod?.addEventListener("change", () => {
  if (databaseAvailable) renderTracking().catch(console.error);
});

statsUnitFilterPeriod?.addEventListener("change", () => {
  if (databaseAvailable) renderStatsByUnit().catch(console.error);
});
statsUnitSort?.addEventListener("change", () => {
  if (databaseAvailable) renderStatsByUnit().catch(console.error);
});

let newSubjectColor = "DISC-BLUE";

subjectsShowCreateBtn?.addEventListener("click", () => {
  subjectsCreateForm.hidden = false;
  subjectsNewName.value = "";
  subjectsCreateMessage.textContent = "";
  newSubjectColor = "DISC-BLUE";
  buildColorPicker(subjectsNewColorPicker, newSubjectColor, (k) => { newSubjectColor = k; });
  subjectsNewName.focus();
});
subjectsCreateCancelBtn?.addEventListener("click", () => {
  subjectsCreateForm.hidden = true;
  subjectsCreateMessage.textContent = "";
});
subjectsCreateSaveBtn?.addEventListener("click", async () => {
  const name = subjectsNewName?.value.trim() ?? "";
  const nameErr = validateNamingField(name, "o nome da disciplina");
  if (nameErr) { subjectsCreateMessage.textContent = nameErr; subjectsNewName?.focus(); return; }
  try {
    await DB.subjects.create(name, newSubjectColor);
    subjectsCreateForm.hidden = true;
    subjectsCreateMessage.textContent = "";
    await renderDisciplinas();
  } catch (error) {
    subjectsCreateMessage.textContent = String(error?.message ?? '').toLowerCase().includes('unique')
      ? "Já existe uma disciplina com esse nome."
      : "Erro ao criar disciplina.";
  }
});
function setPlanFormVisible(visible) {
  if (!planNewUnitForm) return;
  planNewUnitForm.hidden = !visible;
  planNewUnitBtn.setAttribute("aria-expanded", String(visible));
  if (visible) {
    if (!planStudyDate.value) planStudyDate.value = getLocalDateValue();
    planStudyTitle.focus();
  }
}

function setPlanSubjectSubformVisible(visible) {
  if (!planNewSubjectForm) return;
  planNewSubjectForm.hidden = !visible;
  planShowSubjectForm.setAttribute("aria-expanded", String(visible));
  if (visible) planNewSubjectInput.focus();
}

function setPlanFormMessage(msg = "", isError = false) {
  if (!planUnitFormMessage) return;
  planUnitFormMessage.textContent = msg;
  planUnitFormMessage.classList.toggle("is-error", isError);
}

// T23: one operation key per save INTENT, not per click/request. A
// double-click or a retry after a lost response reuses the same key, so
// the server's idempotency guard (T15) returns the original result
// instead of creating a second unit. Only renew() on an actual new
// intent (a prior save succeeded, or the user explicitly cancels) — never
// on a failed attempt, since a retry of the same typed data IS the same
// intent.
function createOperationKeyTracker() {
  let key = crypto.randomUUID();
  return {
    get key() { return key; },
    renew() { key = crypto.randomUUID(); },
  };
}
const planSaveOperation = createOperationKeyTracker();
const studySaveOperation = createOperationKeyTracker();

planNewUnitBtn?.addEventListener("click", () => {
  setPlanFormVisible(planNewUnitForm.hidden);
});

planUnitCancelBtn?.addEventListener("click", () => {
  setPlanFormVisible(false);
  setPlanSubjectSubformVisible(false);
  setPlanFormMessage();
  if (planNewSubjectInput) planNewSubjectInput.value = "";
  planSaveOperation.renew();
});

planShowSubjectForm?.addEventListener("click", () => {
  setPlanSubjectSubformVisible(planNewSubjectForm.hidden);
});

planNewSubjectForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = planNewSubjectInput.value.trim();
  const nameError = validateNamingField(name, "o nome da disciplina");
  if (nameError) { setPlanFormMessage(nameError, true); planNewSubjectInput.focus(); return; }
  try {
    const newSubject = await DB.subjects.create(name, "DISC-BLUE");
    await renderPlan();
    if (planSubjectSelect) planSubjectSelect.value = String(newSubject.id);
    setPlanSubjectSubformVisible(false);
    planNewSubjectInput.value = "";
    planStudyTitle.focus();
  } catch (error) {
    const msg = String(error?.message ?? '').toLowerCase().includes('unique')
      ? "Já existe uma disciplina com esse nome."
      : "Não foi possível criar a disciplina.";
    setPlanFormMessage(msg, true);
    console.error("Falha ao criar disciplina no plano.", error);
  }
});

planUnitSaveBtn?.addEventListener("click", async () => {
  setPlanFormMessage();

  const title = planStudyTitle?.value.trim() ?? "";
  const studyDate = planStudyDate?.value ?? "";

  // Validate unit fields first — before creating any discipline
  if (!studyDate) { setPlanFormMessage("Informe a data da aula.", true); planStudyDate?.focus(); return; }
  const titleError = validateTitleField(title, "o conteúdo estudado");
  if (titleError) { setPlanFormMessage(titleError, true); planStudyTitle?.focus(); return; }

  // Resolve discipline: capture new name to include in atomic save, or use selected existing ID
  let newSubjectName = null;
  if (planNewSubjectForm && !planNewSubjectForm.hidden) {
    const pendingName = planNewSubjectInput?.value.trim();
    if (pendingName) {
      const nameError = validateNamingField(pendingName, "o nome da disciplina");
      if (nameError) { setPlanFormMessage(nameError, true); planNewSubjectInput?.focus(); return; }
      newSubjectName = pendingName;
    }
  }

  const sourceText = planStudySource?.value.trim() ?? "";
  const summaryBody = planStudySummary?.value.trim() || null;

  let subjectId;
  if (!newSubjectName) {
    subjectId = Number(planSubjectSelect?.value);
    if (!subjectId) { setPlanFormMessage("Selecione uma disciplina.", true); planSubjectSelect?.focus(); return; }
  }

  planUnitSaveBtn.disabled = true;
  try {
    const studyData = newSubjectName
      ? { newSubjectName, newSubjectColor: 'DISC-BLUE', sourceText, studyDate, title, summaryBody, operationKey: planSaveOperation.key }
      : { subjectId, sourceText, studyDate, title, summaryBody, operationKey: planSaveOperation.key };
    const saved = await generateReviewTasks(studyData);
    // Save succeeded (or an idempotent retry returned the original result)
    // — this intent is done, the next save is a genuinely new one.
    planSaveOperation.renew();
    // Clear draft immediately; render failures below must NOT re-submit
    planStudyTitle.value = "";
    planStudySource.value = "";
    planStudySummary.value = "";
    if (planNewSubjectInput) planNewSubjectInput.value = "";
    setPlanSubjectSubformVisible(false);
    setPlanFormMessage("Aula salva. 16 revisões criadas.");
    try {
      await renderPlan();
      if (planSubjectSelect) planSubjectSelect.value = String(saved.subjectId);
      // AC-014: clear subject filter if it would hide the newly saved unit
      if (planFilterSubject && planFilterSubject.value && planFilterSubject.value !== String(saved.subjectId)) {
        planFilterSubject.value = '';
        await renderPlan();
      }
      setPlanFormVisible(false);
      setPlanFormMessage();
      await renderToday();
    } catch {
      setPlanFormMessage("Aula salva. Recarregue para ver o resultado.");
    }
  } catch (error) {
    // Only a NetworkError (we genuinely don't know whether the server
    // committed) keeps the same key, so a retry of the same draft
    // resolves as an idempotent replay rather than a duplicate. A
    // definitive rejection (validation, subject conflict) renews it —
    // the user is expected to change something before retrying, and
    // reusing the key there would misreport an edited resubmission as an
    // idempotency conflict instead of validating it fresh.
    if (!(error instanceof NetworkError)) planSaveOperation.renew();
    setPlanFormMessage("Não foi possível salvar a aula. Tente novamente.", true);
  } finally {
    planUnitSaveBtn.disabled = false;
  }
});

if (import.meta.env?.DEV) {
  const { getUatMedicalDataset } = await import('./fixtures/uat-medical-dataset.js');
  window.__seedUatMedical = async (confirm) => {
    if (confirm !== 'DESTROY_EXISTING_DATA') {
      console.warn('[UAT] Destructive: call __seedUatMedical("DESTROY_EXISTING_DATA") to confirm.');
      return;
    }
    await DB.importAll(getUatMedicalDataset());
    console.log('[UAT] Medical dataset seeded. Reload to refresh UI.');
  };
}

// T11: minimal account experience. Independent of the BrowserStore-backed
// learning screens above — see auth-ui.js header comment. Session expiry
// here never clears any of the learning-form drafts managed elsewhere.
const accountLoggedOutView = document.querySelector("#account-logged-out-view");
const accountLoggedInView = document.querySelector("#account-logged-in-view");
const accountLoginForm = document.querySelector("#account-login-form");
const accountRegisterForm = document.querySelector("#account-register-form");
const accountPasswordForm = document.querySelector("#account-password-form");
const accountLogoutBtn = document.querySelector("#account-logout-btn");
const accountLoggedInAs = document.querySelector("#account-logged-in-as");

function setAccountMessage(formId, text = "", isError = false) {
  const el = document.querySelector(`#${formId}-message`);
  if (!el) return;
  el.textContent = text;
  el.classList.toggle("is-error", isError);
}

async function renderAccount() {
  const user = await AuthUI.bootstrap();
  const loggedIn = !!user;
  if (accountLoggedOutView) accountLoggedOutView.hidden = loggedIn;
  if (accountLoggedInView) accountLoggedInView.hidden = !loggedIn;
  if (loggedIn && accountLoggedInAs) {
    accountLoggedInAs.textContent = `Conectado como ${user.emailDisplay}`;
  }
}

document.querySelector("#account-show-register")?.addEventListener("click", () => {
  accountLoginForm.hidden = true;
  accountRegisterForm.hidden = false;
});
document.querySelector("#account-show-login")?.addEventListener("click", () => {
  accountRegisterForm.hidden = true;
  accountLoginForm.hidden = false;
});

accountLoginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setAccountMessage("account-login");
  const email = accountLoginForm.email.value.trim();
  const password = accountLoginForm.password.value;
  const result = await AuthUI.login(email, password);
  if (!result.ok) {
    setAccountMessage("account-login", result.message, true);
    return; // draft (email/password fields) stays as typed on failure
  }
  accountLoginForm.reset();
  await renderAccount();
  // Stays on Conta (matches the existing T11 login UX: "Conectado como X")
  // rather than auto-navigating — only the auth-gate state changes, so a
  // manual click on any data screen now works instead of bouncing back here.
  if (REMOTE_MODE) {
    authenticated = true;
    const user = AuthUI.getCurrentUser();
    if (user) OfflineStore.syncSnapshot(user.id).catch(() => {});
  }
});

accountRegisterForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setAccountMessage("account-register");
  const email = accountRegisterForm.email.value.trim();
  const password = accountRegisterForm.password.value;
  const result = await AuthUI.register(email, password);
  if (!result.ok) {
    setAccountMessage("account-register", result.message, true);
    return;
  }
  setAccountMessage("account-register", "Conta criada com sucesso. Entre com suas credenciais.");
  accountRegisterForm.reset();
  accountRegisterForm.hidden = true;
  accountLoginForm.hidden = false;
});

accountPasswordForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setAccountMessage("account-password");
  const currentPassword = accountPasswordForm.currentPassword.value;
  const newPassword = accountPasswordForm.newPassword.value;
  const result = await AuthUI.changePassword(currentPassword, newPassword);
  if (!result.ok) {
    setAccountMessage("account-password", result.message, true);
    return;
  }
  setAccountMessage("account-password", "Senha alterada com sucesso.");
  accountPasswordForm.reset();
});

accountLogoutBtn?.addEventListener("click", async () => {
  await AuthUI.logout();
  if (REMOTE_MODE) {
    authenticated = false;
    // AC-23: the next account to log in on this device must never be able
    // to read this account's cached agenda snapshot.
    await OfflineStore.purgeAllAccounts();
  }
  await renderAccount();
});

// T41: a 401 mid-session (server-side expiry/revocation — see
// api-client.js's handleResponse) locks protected operations and clears
// stale identity. NOT a logout: the cached offline snapshot legitimately
// still belongs to this same account, so it is deliberately NOT purged —
// only OfflineStore.purgeAllAccounts() (an explicit logout/account-switch)
// does that. Re-confirms with the server (rather than trusting the
// dispatched event alone) before actually clearing local state.
if (REMOTE_MODE) {
  OfflineUI.onUnauthenticated(async () => {
    const user = await AuthUI.bootstrap();
    if (user) return; // a stray/transient 401 — the session is actually still valid
    authenticated = false;
    await renderAccount();
    if (DATA_SCREENS.has(window.location.hash.slice(1))) showScreen("account");
  });
}

showScreen(window.location.hash.slice(1) || DEFAULT_SCREEN);
