import { DB as LocalDB } from "./db.js";
import { DB as RemoteDB } from "./remote-store.js";
import { NetworkError, apiRequest } from "./api-client.js";
import { createStudyEvidenceQueue } from "./study-evidence-queue.js";
import { Stats, formatAverageScore } from "./stats.js";
import { readLastBackupAt, writeLastBackupAt } from "./backup-date.js";
import { getReviewScoreValidationMessage, getReviewScoreValues } from "./review-score.js";
import { generateInitialTasks, getNextReview, getReviewStatusLabel, getDaysBetween } from "./scheduler.js";
import { pickPrimaryReview } from "./today-priority.js";
import { reviewConclusion } from "./review-completion.js";
import { groupOverdueByUnit, stageRanges, shouldCollapseOverdue, foldedFlags, VISIBLE_LIMIT } from "./overdue-groups.js";
import { weakPracticeReason } from "./priorities-text.js";
import { groupUpcomingReviews } from "./upcoming-reviews.js";
import {
  THEME_OPTIONS,
  THEME_VARIABLES,
  applyThemePreference,
  getStoredThemePreference,
  quickToggleTarget,
  readQuickToggleMemory,
  writeQuickToggleMemory,
} from "./theme.js";
import { colorVarForKey, getState, MIN_SAMPLE_QUESTIONS } from "./performance-thresholds.js";
import { createSubjectCreateForm, buildColorPicker } from "./subject-create-form.js";
import { findLesson } from "./lesson-link.js";
import { Analytics, subtractDays, verdictText, validEvidence, periodSubjectRows, periodSummary, evolutionSeries } from "./analytics.js";
import { formatDate as formatIntlDate, formatDecimal, formatNumber } from "./i18n/format.js";
import { t, tn } from "./i18n/index.js";
import { renderAttention, renderMiniRanks, renderOverview, statsOverviewState } from "./stats-v5.js";
import { buildHistoryRows, setHistory, wireHistory } from "./stats-history.js";
import { buildTableModel, focusSubject, handleTableAction, handleTableControl, setTableModel } from "./stats-table.js";
import { applyStaticTexts } from "./i18n/dom.js";
import { DEFAULT_LOCALE } from "../shared/locales.js";
import { getTrackingState } from "./tracking-state.js";
import { validateNamingField, validateTitleField } from "./naming-validation.js";
import * as AuthUI from "./auth-ui.js";
import * as MigrationUI from "./migration-ui.js";
import { isExperimentOn, setExperiment, renderObligationsPanel } from "./experimental-obligations-ui.js";

import { formatPageList, createSourceDetails, citationDetails, setSourceOpeningRecorder, appendSummarySources as appendSummarySourcesFrom } from "./source-details-ui.js";
import { configureMaterialsUI } from "./materials-ui.js";
import "./build-identity-ui.js";
import "./chrome-ui.js";
import { createTextElement } from "./dom-utils.js";
import { showConfirm } from "./confirm-dialog.js";
import { askPostpone } from "./postpone-dialog.js";
import { renderSummary } from "./summary-render.js";
import { createSummaryAuthoring } from "./summary-toolbar.js";
import * as OfflineStore from "./offline-store.js";
import * as OfflineUI from "./offline-ui.js";
import { enhanceAllSelects, syncSelect } from "./select-ui.js";

// index.html carries the pt-BR text only as first-paint fallback; every [data-i18n*] element is filled from the catalog.
applyStaticTexts(document);

async function withScrollPreserved(fn) {
  const top = mainContent?.scrollTop ?? 0;
  await fn();
  requestAnimationFrame(() => {
    if (mainContent) mainContent.scrollTop = top;
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

const QUESTION_FLAG_REASONS = Object.freeze([
  ["CONFUSING_STATEMENT", t("questionFlag.reason.confusingStatement")],
  ["DOUBTFUL_ANSWER_KEY", t("questionFlag.reason.doubtfulAnswerKey")],
  ["CONTENT_ERROR", t("questionFlag.reason.contentError")],
  ["OTHER", t("questionFlag.reason.other")],
]);
const QUESTION_FLAG_TEXT = Object.freeze({
  action: t("questionFlag.action"),
  marked: t("questionFlag.marked"),
  remove: t("questionFlag.remove"),
  reason: t("questionFlag.reason"),
  comment: t("questionFlag.comment"),
  commentPlaceholder: t("questionFlag.commentPlaceholder"),
  save: t("questionFlag.save"),
  cancel: t("questionFlag.cancel"),
  previous: t("questionFlag.previous"),
  resultTitle: t("questionFlag.resultTitle"),
  saved: t("questionFlag.saved"),
  removed: t("questionFlag.removed"),
  failed: t("questionFlag.failed"),
});
let questionFlagsByExerciseId = new Map();
const judgedQuestionExerciseIds = new Set();
const judgedQuestionAttemptIds = new Map();

async function loadQuestionFlags() {
  if (!DB.questionFlags?.list) return questionFlagsByExerciseId;
  try {
    const flags = await DB.questionFlags.list();
    questionFlagsByExerciseId = new Map((flags ?? []).map((flag) => [Number(flag.exerciseId), flag]));
  } catch (error) {
    console.warn("Falha ao carregar marcas de questões.", error);
  }
  return questionFlagsByExerciseId;
}

function updateQuestionFlagCache(flag, exerciseId) {
  const id = Number(exerciseId ?? flag?.exerciseId);
  if (!Number.isInteger(id)) return;
  if (flag) questionFlagsByExerciseId.set(id, flag);
  else questionFlagsByExerciseId.delete(id);
}

function createQuestionFlagControls(exercise, { flag = null, attemptId = null, visible = false } = {}) {
  const host = document.createElement("div");
  host.className = "question-flag-controls";
  host.dataset.exerciseId = String(exercise.id);
  host.dataset.attemptId = attemptId == null ? "" : String(attemptId);
  host.hidden = !visible;

  const state = createTextElement("span", "question-flag-state", "");
  state.setAttribute("role", "status");
  const action = document.createElement("button");
  action.type = "button";
  action.className = "text-button question-flag-action";

  const editor = document.createElement("div");
  editor.className = "question-flag-editor";
  editor.hidden = true;
  const reasonLabel = document.createElement("label");
  reasonLabel.className = "question-flag-field";
  reasonLabel.append(createTextElement("span", "question-flag-label", QUESTION_FLAG_TEXT.reason));
  const reason = document.createElement("select");
  reason.className = "question-flag-reason";
  reason.required = true;
  for (const [value, label] of QUESTION_FLAG_REASONS) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    reason.append(option);
  }
  reasonLabel.append(reason);
  const commentLabel = document.createElement("label");
  commentLabel.className = "question-flag-field";
  commentLabel.append(createTextElement("span", "question-flag-label", QUESTION_FLAG_TEXT.comment));
  const comment = document.createElement("textarea");
  comment.className = "question-flag-comment";
  comment.rows = 2;
  comment.maxLength = 500;
  comment.placeholder = QUESTION_FLAG_TEXT.commentPlaceholder;
  commentLabel.append(comment);
  const editorActions = document.createElement("div");
  editorActions.className = "question-flag-actions";
  const save = document.createElement("button");
  save.type = "button";
  save.className = "small-button is-primary";
  save.dataset.action = "save-question-flag";
  save.textContent = QUESTION_FLAG_TEXT.save;
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "small-button";
  cancel.dataset.action = "cancel-question-flag";
  cancel.textContent = QUESTION_FLAG_TEXT.cancel;
  const message = createTextElement("p", "question-flag-message", "");
  message.setAttribute("role", "status");
  message.setAttribute("aria-live", "polite");
  editorActions.append(save, cancel);
  editor.append(reasonLabel, commentLabel, editorActions, message);

  let current = flag;
  function render(next = current) {
    current = next;
    updateQuestionFlagCache(current, exercise.id);
    state.hidden = !current;
    state.textContent = current ? QUESTION_FLAG_TEXT.marked : "";
    action.dataset.action = current ? "unflag-question" : "flag-question";
    action.textContent = current ? QUESTION_FLAG_TEXT.remove : QUESTION_FLAG_TEXT.action;
    editor.hidden = true;
    message.textContent = "";
    if (current) {
      reason.value = current.reason;
      comment.value = current.comment ?? "";
    } else {
      reason.value = QUESTION_FLAG_REASONS[0][0];
      comment.value = "";
    }
  }
  render();

  action.addEventListener("click", async () => {
    if (current) {
      action.disabled = true;
      try {
        await DB.questionFlags.clear(exercise.id);
        render(null);
        message.textContent = QUESTION_FLAG_TEXT.removed;
        action.focus();
      } catch (error) {
        message.textContent = QUESTION_FLAG_TEXT.failed;
        console.error("Falha ao remover marca de questão.", error);
      } finally {
        action.disabled = false;
      }
      return;
    }
    action.hidden = true;
    editor.hidden = false;
    reason.focus();
  });
  cancel.addEventListener("click", () => {
    editor.hidden = true;
    action.hidden = false;
    action.focus();
  });
  save.addEventListener("click", async () => {
    const parsedAttemptId = Number(host.dataset.attemptId);
    save.disabled = true;
    message.textContent = "";
    try {
      const saved = await DB.questionFlags.flag(exercise.id, {
        attemptId: Number.isInteger(parsedAttemptId) ? parsedAttemptId : undefined,
        reason: reason.value,
        comment: comment.value,
      });
      render(saved);
      action.hidden = false;
      message.textContent = QUESTION_FLAG_TEXT.saved;
      action.focus();
    } catch (error) {
      message.textContent = QUESTION_FLAG_TEXT.failed;
      console.error("Falha ao salvar marca de questão.", error);
    } finally {
      save.disabled = false;
    }
  });

  host.append(state, action, editor);
  return host;
}

function revealQuestionFlagControls(exItem) {
  const controls = exItem?.querySelector(".question-flag-controls");
  if (!controls) return;
  controls.dataset.attemptId = exItem.dataset.attemptId ?? "";
  controls.hidden = false;
  const action = controls.querySelector(".question-flag-action");
  if (action) action.hidden = false;
}

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
// LOCAL_DESKTOP_AUTHORITY — the Companion (a Web/PWA foundation already
// exists: shell cache + offline agenda snapshot) stays a
// read-only surface, and REMOTE_AUTHORITY-without-local-authority keeps
// the existing server endpoints reachable (nothing removed server-side)
// but never surfaces this as a product screen. This flag is stable for
// the whole session (set once by the window init script before this
// module loads), so it's safe to apply it once here rather than on every
// navigation.
const materialsNavItem = document.querySelector('[data-screen="materials"]');
// Materiais sempre aparece no menu; sem servidor local a tela mostra um aviso em vez de sumir.
if (materialsNavItem) {
  materialsNavItem.hidden = false;
  const materialsAvailable = REMOTE_MODE && LOCAL_AUTHORITY;
  const unavailableCard = document.getElementById("materials-unavailable");
  if (unavailableCard) unavailableCard.hidden = materialsAvailable;
}

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
    banner.className = 'app-banner app-banner--fatal';
    banner.textContent = REMOTE_MODE
      ? t('shell.dbError.server')
      : t('shell.dbError.local');
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
const mobileMoreToggle = document.querySelector("#mobile-more-toggle");
const mobileMoreMenu = document.querySelector("#mobile-more-menu");
const screenPanels = [...document.querySelectorAll("[data-screen-panel]")];
const mainContent = document.querySelector(".app-main");
const subjectSelect = document.querySelector("#subject-select");
const subjectMessage = document.querySelector("#subject-message");
// Disciplinas, Cadastro and Plano all open this same registration (name + colour): see subject-create-form.js
const registerSubjectForm = createSubjectCreateForm({
  slot: document.querySelector("#new-subject-slot"),
  ids: { form: "new-subject-form", input: "new-subject-input" },
  trigger: document.querySelector("#show-subject-form"),
  report: (text) => setSubjectMessage(text),
  submit: createSubjectFromRegister,
});
const subjectList = document.querySelector("#subject-list");
const subjectsEmpty = document.querySelector("#subjects-empty");
const subjectManagerMessage = document.querySelector("#subject-manager-message");
const studyForm = document.querySelector("#study-form");
const studyDateInput = document.querySelector("#study-date");
const studyLessonDateInput = document.querySelector("#study-lesson-date");
const studyContentInput = document.querySelector("#study-content");
const studySummaryTextarea = document.querySelector("#study-summary");
const studySourceTextInput = document.querySelector("#study-source-text");
const studyList = document.querySelector("#study-list");
const studiesEmpty = document.querySelector("#studies-empty");
const studyManagerMessage = document.querySelector("#study-manager-message");
const studyMessage = document.querySelector("#study-message");
const todayDateLabel = document.querySelector("#today-date-label");
const todayEmptyState = document.querySelector("#today-empty-state");
const todayLoadingState = document.querySelector("#today-loading");
const todaySuccessState = document.querySelector("#today-success-state");
const todayTomorrow = document.querySelector("#today-tomorrow");
const todayLoadSummary = document.querySelector("#today-load-summary");
const weakBlock = document.querySelector("#block-weak");
const upcomingBlock = document.querySelector("#block-upcoming");
const weakList = document.querySelector("#weak-list");
const weakCount = document.querySelector("#weak-count");
const reviewDashboard = document.querySelector("#review-dashboard");
const todayPrimaryAction = document.querySelector("#today-primary-action");
const todayPrimaryActionText = document.querySelector("#today-primary-action-text");
const todayPrimaryActionBtn = document.querySelector("#today-primary-action-btn");
const todayFocusReviewBtn = document.querySelector("#today-focus-review-btn");
const dailySummaryBtn = document.querySelector("#daily-summary-btn");
const dailySummaryPanel = document.querySelector("#daily-summary-panel");
const dailySummaryList = document.querySelector("#daily-summary-list");
const dailySummaryClose = document.querySelector("#daily-summary-close");
const postponeBtn = document.querySelector("#postpone-overdue-btn");
let postponeContext = null; // { tasks, today } of the last Hoje render: what "Adiar vencidas" previews
const reviewGroups = {
  overdue: document.querySelector("#block-overdue"),
  today: document.querySelector("#block-today"),
  doneToday: document.querySelector("#block-done-today"),
};
const metricElements = {
  totalQuestions: document.querySelector("#metric-questions"),
  totalCorrect: document.querySelector("#metric-correct"),
  avgScore: document.querySelector("#metric-average"),
  subjects: document.querySelector("#metric-subjects"),
  subjectsWithData: document.querySelector("#metric-subjects-with-data"),
  averageQuestions: document.querySelector("#metric-average-questions"),
  attention: document.querySelector("#metric-attention"),
  reviewsDone: document.querySelector("#metric-reviews-done"),
  reviewsPending: document.querySelector("#metric-reviews-pending"),
};
const studyVerdictEl = document.querySelector("#stats-verdict");
const studyVerdictHeadline = document.querySelector("#stats-verdict-headline");
const studyVerdictDetail = document.querySelector("#stats-verdict-detail");
const studyVerdictAttention = document.querySelector("#stats-verdict-attention");
const studyVerdictAttentionText = document.querySelector("#stats-verdict-attention-text");
const studyVerdictAttentionBtn = document.querySelector("#stats-verdict-attention-btn");
const statsUnitFilterPeriod = document.querySelector("#stats-unit-filter-period");
const evolutionSvg = document.querySelector("#evolution-svg");
const evolutionFilterSubject = document.querySelector("#evolution-filter-subject");
const evolutionDescription = document.querySelector("#evolution-svg-description");
const evolutionCaption = document.querySelector("#evolution-caption");
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
const subjectsCatalog = document.querySelector("#subjects-catalog");
const subjectsCatalogEmpty = document.querySelector("#subjects-catalog-empty");
const subjectsShowCreateBtn = document.querySelector("#subjects-show-create-btn");
createSubjectCreateForm({
  slot: document.querySelector("#subjects-create-slot"),
  ids: { form: "subjects-create-form", input: "subjects-new-name", submit: "subjects-create-save-btn", cancel: "subjects-create-cancel-btn", message: "subjects-create-message" },
  trigger: subjectsShowCreateBtn,
  cancellable: true,
  submit: async (name, color) => {
    await DB.subjects.create(name, color);
    await renderDisciplinas();
  },
});
const planList = document.querySelector("#plan-list");
const planEmpty = document.querySelector("#plan-empty");
const planEmptyNewBtn = document.querySelector("#plan-empty-new");
const planFilterSubject = document.querySelector("#plan-filter-subject");
const planFilterState = document.querySelector("#plan-filter-state");
const planFilterPeriod = document.querySelector("#plan-filter-period");
const planSort = document.querySelector("#plan-sort");
const planSearch = document.querySelector("#plan-search");
const planCount = document.querySelector("#plan-count");
const planPager = document.querySelector("#plan-pager");
const planPrev = document.querySelector("#plan-prev");
const planNext = document.querySelector("#plan-next");
const planTopPager = document.querySelector("#plan-top-pager");
const planTopPrev = document.querySelector("#plan-top-prev");
const planTopNext = document.querySelector("#plan-top-next");
const planPageLabel = document.querySelector("#plan-page-label");
const PLAN_PAGE_SIZE = 20;
let planPage = 1;
const planNewUnitBtn = document.querySelector("#plan-new-unit-btn");
const planManageSubjectsBtn = document.querySelector("#plan-manage-subjects-btn");
const planSubjectsPanel = document.querySelector("#plan-subjects-panel");
const planNewUnitForm = document.querySelector("#plan-new-unit-form");
const planSubjectSelect = document.querySelector("#plan-subject-select");
const planSubjectForm = createSubjectCreateForm({
  slot: document.querySelector("#plan-new-subject-slot"),
  ids: { form: "plan-new-subject-form", input: "plan-new-subject-input" },
  trigger: document.querySelector("#plan-show-subject-form"),
  report: (text, isError) => setPlanFormMessage(text, isError),
  submit: createSubjectFromPlan,
});
const planStudySource = document.querySelector("#plan-study-source");
const planStudyDate = document.querySelector("#plan-study-date");
const planLessonDate = document.querySelector("#plan-lesson-date");
const planStudyTitle = document.querySelector("#plan-study-title");
const planStudySummary = document.querySelector("#plan-study-summary");
const planUnitSaveBtn = document.querySelector("#plan-unit-save-btn");
const planUnitCancelBtn = document.querySelector("#plan-unit-cancel-btn");
const planUnitFormMessage = document.querySelector("#plan-unit-form-message");
const resetCard = document.querySelector("#reset-card");
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
const studyNowSubjectEl = document.querySelector("#study-now-subject");
const studyNowTitleEl = document.querySelector("#title-study-now");
const studyNowSummaryCard = document.querySelector("#study-now-summary-card");
const studyNowSummaryBody = document.querySelector("#study-now-summary-body");
const studyNowProgress = document.querySelector("#study-now-progress");
const studyNowProgressBar = document.querySelector("#study-now-progress-bar");
const studyNowQuestionArea = document.querySelector("#study-now-question-area");
const studyNowQuestionText = document.querySelector("#study-now-question-text");
const studyNowHintText = document.querySelector("#study-now-hint-text");
const studyNowRevealBtn = document.querySelector("#study-now-reveal-btn");
const studyNowAnswerText = document.querySelector("#study-now-answer-text");
const studyNowExplanationText = document.querySelector("#study-now-explanation-text");
// The cited source page(s) for the current question, revealed together with the answer.
const studyNowSourceBox = document.createElement("div");
studyNowSourceBox.className = "study-now-source-box";
studyNowSourceBox.hidden = true;
studyNowExplanationText?.after(studyNowSourceBox);
const studyNowJudgment = document.querySelector("#study-now-judgment");
const studyNowMessage = document.querySelector("#study-now-message");
const studyNowResume = document.querySelector("#study-now-resume");
const studyNowResumeText = document.querySelector("#study-now-resume-text");
const studyNowCorrectBtn = document.querySelector("#study-now-correct-btn");
const studyNowIncorrectBtn = document.querySelector("#study-now-incorrect-btn");
const studyNowNoExercises = document.querySelector("#study-now-no-exercises");
const studyNowResultCard = document.querySelector("#study-now-result-card");
const studyNowResultText = document.querySelector("#study-now-result-text");
const studyNowNextReviewText = document.querySelector("#study-now-next-review-text");
const studyNowResultTitle = document.querySelector("#study-now-result-title");
const studyNowResultNote = document.querySelector("#study-now-result-note");
const studyNowErrorsSection = document.querySelector("#study-now-errors-section");
const studyNowErrorsTitle = document.querySelector("#study-now-errors-title");
const studyNowErrorsList = document.querySelector("#study-now-errors-list");
const studyNowCorrectedSection = document.querySelector("#study-now-corrected-section");
const studyNowCorrectedTitle = document.querySelector("#study-now-corrected-title");
const studyNowCorrectedList = document.querySelector("#study-now-corrected-list");
const studyNowRetestBtn = document.querySelector("#study-now-retest-btn");
const studyNowEvidenceNote = document.querySelector("#study-now-evidence-note");
const studyNowEvidenceRetryBtn = document.querySelector("#study-now-evidence-retry-btn");
const studyNowDoneBtn = document.querySelector("#study-now-done-btn");
const studyNowPracticeCard = document.querySelector("#study-now-practice-card");
const studyNowPracticeTitle = document.querySelector("#study-now-practice-title");
const studyNowQuestionFlagHost = document.createElement("div");
studyNowQuestionFlagHost.className = "study-now-question-flag";
studyNowQuestionFlagHost.hidden = true;
studyNowJudgment?.after(studyNowQuestionFlagHost);
const studyNowFlagsSection = document.createElement("section");
studyNowFlagsSection.className = "study-result-section study-now-flags-section";
studyNowFlagsSection.hidden = true;
const studyNowFlagsTitle = createTextElement("h3", "", QUESTION_FLAG_TEXT.resultTitle);
studyNowFlagsTitle.id = "study-now-flags-title";
studyNowFlagsSection.setAttribute("aria-labelledby", studyNowFlagsTitle.id);
const studyNowFlagsList = document.createElement("ul");
studyNowFlagsList.className = "study-now-flags-list";
studyNowFlagsSection.append(studyNowFlagsTitle, studyNowFlagsList);
studyNowCorrectedSection?.after(studyNowFlagsSection);
let migrationActivePreview = null;
let migrationLastReport = null;
const themeToggle = document.querySelector("#theme-toggle");
const themePicker = document.querySelector("#theme-picker");
const generationLanguageCard = document.querySelector("#generation-language-card");
const generationLanguageSelect = document.querySelector("#generation-language-select");
const generationLanguageSave = document.querySelector("#generation-language-save");
const generationLanguageMessage = document.querySelector("#generation-language-message");
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
  return formatIntlDate(date, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...options,
  });
}

function getTomorrowValue(today) {
  const date = new Date(`${today}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function setReviewMessage(message = "", isError = false) {
  reviewMessage.textContent = message;
  reviewMessage.classList.toggle("is-error", isError);
}

function formatPerformanceScore(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  // same one-decimal policy as the Estatísticas average (formatAverageScore): 2/3 reads 66,7% on both screens
  return `${formatDecimal(number)}%`;
}

const OUTCOME_LABEL = {
  get CORRECT() { return t("statsView.attempt.outcome.correct"); },
  get INCORRECT() { return t("statsView.attempt.outcome.incorrect"); },
  get UNKNOWN() { return t("statsView.attempt.outcome.unknown"); },
};
const ASSISTANCE_LABEL = {
  get NONE() { return t("statsView.attempt.assistance.none"); },
  get HINT() { return t("statsView.attempt.assistance.hint"); },
  get PARTIAL_SOLUTION() { return t("statsView.attempt.assistance.partial"); },
  get SOLUTION() { return t("statsView.attempt.assistance.solution"); },
};

function createAttemptItem(attempt) {
  const li = document.createElement("li");
  const outcomeClass = attempt.outcome === "CORRECT" ? "is-correct" : attempt.outcome === "INCORRECT" ? "is-incorrect" : "is-unknown";
  li.className = `exercise-attempt-item ${outcomeClass}`;

  li.append(createTextElement("p", "exercise-attempt-question", attempt.question ?? "—"));
  // Only attempts born in a Prova carry what the student typed ("studentAnswer" is absent for study/review).
  if ("studentAnswer" in attempt) {
    const mine = createTextElement("p", "exercise-attempt-student", attempt.studentAnswer ? t("statsView.attempt.studentAnswer", { answer: attempt.studentAnswer }) : t("statsView.attempt.studentAnswerEmpty"));
    if (!attempt.studentAnswer) mine.classList.add("is-empty");
    li.append(mine);
  }
  if (attempt.answer) {
    li.append(createTextElement("p", "exercise-attempt-answer", t("statsView.attempt.answerKey", { answer: attempt.answer })));
  }

  const meta = document.createElement("div");
  meta.className = "exercise-attempt-meta";
  const outcomeBadge = document.createElement("span");
  outcomeBadge.className = `exercise-attempt-outcome ${outcomeClass}`;
  outcomeBadge.textContent = OUTCOME_LABEL[attempt.outcome ?? "UNKNOWN"] ?? OUTCOME_LABEL.UNKNOWN;
  meta.append(outcomeBadge);
  const assistance = ASSISTANCE_LABEL[attempt.assistanceUsed];
  if (assistance) meta.append(createTextElement("span", "exercise-attempt-assistance", assistance));
  li.append(meta);

  return li;
}

// Whole-row click (per product request: the natural target of tapping a
// solved-exercise row is opening that attempt, not a small separate
// button) opens this dialog. `exercise` is one completedExercises item
// (src/stats.js) — id is the learning_evidence row id, context is
// REVIEW/INITIAL_PRACTICE/EXTERNAL.
async function openExerciseDetail(exercise) {
  const dialog = document.getElementById("exercise-detail-dialog");
  const eyebrow = document.getElementById("exercise-detail-eyebrow");
  const title = document.getElementById("exercise-detail-title");
  const body = document.getElementById("exercise-detail-body");
  if (!dialog || !body) return;

  eyebrow.textContent = exercise.subjectName ?? "";
  title.textContent = exercise.title ?? "";
  body.replaceChildren();

  // EXTERNAL evidence never has an in-app attempt to link — answered
  // outside the app, by definition — so this is answered locally, honestly,
  // with no network round-trip and no chance of it ever resolving otherwise.
  if (exercise.context === "EXTERNAL") {
    body.append(createTextElement(
      "p",
      "exercise-detail-unavailable",
      t("statsView.attempt.detail.external"),
    ));
    dialog.showModal();
    return;
  }

  body.append(createTextElement("p", "exercise-detail-unavailable", t("statsView.attempt.detail.loading")));
  dialog.showModal();

  let result;
  try {
    result = await DB.learningEvidence.getAttempts(exercise.id);
  } catch (error) {
    console.error("Falha ao buscar detalhe da tentativa.", error);
    body.replaceChildren(createTextElement(
      "p",
      "exercise-detail-unavailable",
      t("statsView.attempt.detail.loadFailed"),
    ));
    return;
  }

  const attempts = result?.attempts ?? [];
  if (attempts.length === 0) {
    body.replaceChildren(createTextElement(
      "p",
      "exercise-detail-unavailable",
      t("statsView.attempt.detail.unavailable"),
    ));
    return;
  }

  const list = document.createElement("ul");
  list.className = "exercise-attempt-list";
  for (const attempt of attempts) list.append(createAttemptItem(attempt));
  body.replaceChildren(list);
}

document.getElementById("exercise-detail-close")?.addEventListener("click", () => {
  document.getElementById("exercise-detail-dialog")?.close();
});
// getDaysBetween/getReviewStatusLabel now live in scheduler.js (pure,
// unit-tested there — see test/scheduler.test.js) since they have no DOM
// dependency.

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
  input.setAttribute("aria-label", t("today.review.scoreInput.aria", { label, number: task.reviewNumber }));
  wrapper.append(input);
  return wrapper;
}

function formatReviewScore(value) {
  return value == null ? "—" : `${formatDecimal(Number(value))}%`;
}

// Several overdue stages of the same unit as ONE card (native <details>, so
// keyboard and screen readers work without extra code). The stage rows inside
// are created by the caller, unchanged.
function createOverdueUnitCard(group, unit, subject, today, collapsed, buildRow) {
  const card = document.createElement("details");
  card.className = "overdue-unit";
  card.dataset.unitId = String(group.unitId);
  card.dataset.stages = String(group.tasks.length);
  card.open = !collapsed;

  const summary = document.createElement("summary");
  summary.className = "overdue-unit-summary";
  const subjectChip = createTextElement("span", "subject-chip", subject?.name ?? t("stats.noSubject"));
  subjectChip.style.setProperty("--subject-color", `var(${colorVarForKey(subject?.color ?? "DISC-BLUE")})`);
  const ranges = stageRanges(group.tasks.map((task) => task.reviewNumber))
    .map(([from, to]) => (from === to
      ? t("today.overdue.unit.single", { number: from })
      : t("today.overdue.unit.range", { from, to })))
    .join(", ");
  const oldestDays = Math.max(1, getDaysBetween(group.tasks[0].dueDate, today));
  const meta = t("today.overdue.unit.meta", {
    stages: tn("today.overdue.unit.stages", group.tasks.length),
    ranges,
    oldest: tn("today.overdue.unit.oldest", oldestDays),
  });
  summary.append(
    subjectChip,
    createTextElement("h3", "review-content", unit?.title ?? t("stats.unavailableContent")),
    createTextElement("p", "review-meta", meta),
  );

  const stages = document.createElement("div");
  stages.className = "overdue-unit-stages";
  for (const task of group.tasks) stages.append(buildRow(task));
  card.append(summary, stages);
  return card;
}

// Hoje lists show their first items and fold the rest behind "Ver mais N" (H-01: 18 overdue + 12 done reached ~7000 px).
// Folded items stay in the DOM with `hidden`, so nothing is dropped; the button is a native <button> with aria-expanded, so
// keyboard and screen readers work. `keep` items (the "Começar agora" target, cards the student opened) are never folded.
const expandedHojeLists = new Set();
function appendFoldedList(list, groupName, items) {
  const folded = foldedFlags(items.map((item) => item.keep), VISIBLE_LIMIT[groupName]);
  const foldedCount = folded.filter(Boolean).length;
  const expanded = expandedHojeLists.has(groupName);
  items.forEach((item, i) => {
    if (folded[i]) {
      item.el.dataset.folded = "true";
      item.el.hidden = !expanded;
    }
    list.append(item.el);
  });
  if (foldedCount === 0) return;
  const showLabel = groupName === "overdue"
    ? tn("today.more.show.contents", foldedCount)
    : tn("today.more.show.reviews", foldedCount);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "secondary-button review-list-more";
  button.dataset.foldToggle = groupName;
  button.setAttribute("aria-expanded", String(expanded));
  button.textContent = expanded ? t("today.more.hide") : showLabel;
  button.addEventListener("click", () => {
    const expand = button.getAttribute("aria-expanded") !== "true";
    for (const el of list.querySelectorAll('[data-folded="true"]')) el.hidden = !expand;
    if (expand) expandedHojeLists.add(groupName); else expandedHojeLists.delete(groupName);
    button.setAttribute("aria-expanded", String(expand));
    button.textContent = expand ? t("today.more.hide") : showLabel;
  });
  list.append(button);
}

// A review that is looked up by id (Começar agora, coming back from a redo) may sit in a folded part of its list: unfold it.
function revealFolded(el) {
  const folded = el?.closest('[data-folded="true"]');
  if (folded?.hidden) folded.closest(".review-list")?.querySelector("[data-fold-toggle]")?.click();
}

// V7.2 writes dates on the cards as 01/11/2026
const V72_DATE = { day: "2-digit", month: "2-digit", year: "numeric" };
// V7.2 card parts, shared by the review rows and the read-only "Próximas revisões" cards.
function createReviewChip(subject) {
  const chip = createTextElement("span", "subject-chip", subject?.name ?? t("stats.noSubject"));
  chip.style.setProperty("--subject-color", `var(${colorVarForKey(subject?.color ?? "DISC-BLUE")})`);
  return chip;
}

/** "source" on one line, "Estudado em dd/mm/aaaa · R4" on the next (V7.2); the R-number stays visible this way. */
function createReviewMeta(unit, task) {
  const meta = document.createElement("p");
  meta.className = "review-meta";
  if (unit?.sourceText) meta.append(unit.sourceText, document.createElement("br"));
  meta.append(t("today.review.studiedOn", { date: formatDate(unit?.studyDate, V72_DATE), number: task.reviewNumber }));
  return meta;
}

function createLessonButton(unit) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "text-button review-open-lesson";
  button.dataset.action = "open-lesson";
  button.dataset.unitId = String(unit?.id ?? "");
  button.textContent = t("today.review.viewLesson");
  button.setAttribute("aria-label", t("today.review.viewLesson.aria", { title: unit?.title ?? t("today.review.done.fallbackTitle") }));
  return button;
}

/** A coming review: read-only (a review is only done from its due date on), with the way to its lesson. */
function createUpcomingCard(task, unit, subject) {
  const row = document.createElement("article");
  row.className = "review-row review-row-upcoming";
  row.dataset.reviewId = String(task.id);
  row.dataset.unitId = String(unit?.id ?? "");
  row.dataset.group = "upcoming";
  const header = document.createElement("div");
  header.className = "sl-review-row";
  const due = createTextElement("span", "review-status sl-status", formatDate(task.dueDate, V72_DATE));
  due.dataset.status = "draft";
  header.append(createReviewChip(subject), due);
  const actions = document.createElement("div");
  actions.className = "review-row-actions";
  actions.append(createLessonButton(unit));
  row.append(header, createTextElement("h3", "review-content", unit?.title ?? t("stats.unavailableContent")), createReviewMeta(unit, task), actions);
  return row;
}

/** V7.2 "Próximas revisões": the next three reviews after today, in date order. */
function renderUpcomingReviews(allTasks, unitsById, subjectsById, today) {
  if (!upcomingBlock) return;
  const next = allTasks
    .filter((task) => !task.reviewDone && task.dueDate > today && unitsById.has(task.unitId))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id - b.id)
    .slice(0, 3);
  const count = upcomingBlock.querySelector("#upcoming-count");
  count.textContent = "";
  count.hidden = true;
  upcomingBlock.querySelector("#upcoming-note").hidden = true;
  upcomingBlock.querySelector("#upcoming-more").hidden = true;
  const list = document.createElement("div");
  list.className = "review-list";
  list.dataset.reviewList = "upcoming";
  for (const task of next) {
    const unit = unitsById.get(task.unitId);
    list.append(createUpcomingCard(task, unit, subjectsById.get(unit?.subjectId)));
  }
  upcomingBlock.querySelector("#upcoming-groups").replaceChildren(list);
  upcomingBlock.hidden = next.length === 0;
}

function createReviewRow(task, unit, subject, groupName, today, exercises = [], judgments = [], priorWrong = new Set(), questionFlags = new Map()) {
  const row = document.createElement("article");
  row.className = "review-row";
  row.dataset.reviewId = String(task.id);
  row.dataset.unitId = String(unit?.id ?? "");
  row.dataset.group = groupName;

  // V7.2 card: [subject chip + status] / title / source + "Estudado em" / actions. The R-number marker and the score pill stay in the
  // DOM (handlers write to them) but are not drawn; the R-number moves to the "Estudado em" line.
  const header = document.createElement("div");
  header.className = "sl-review-row";

  const marker = createTextElement("span", "review-marker", `R${task.reviewNumber}`);
  marker.classList.add(`is-${groupName === "doneToday" ? "done" : groupName}`);
  marker.setAttribute("aria-label", t("today.review.marker.aria", { number: task.reviewNumber }));
  marker.hidden = true;

  const subjectChip = createReviewChip(subject);

  const tags = document.createElement("div");
  tags.className = "review-row-tags";
  const statusBadge = createTextElement("span", "review-status sl-status", getReviewStatusLabel(groupName, task, today));
  statusBadge.classList.add(`is-${groupName === "doneToday" ? "done" : groupName}`);
  statusBadge.dataset.status = groupName === "doneToday" ? "ready" : groupName === "today" ? "pending" : "overdue";
  const initialScoreValues = getReviewScoreValues(task.questionsCount, task.correctCount);
  const scorePill = createTextElement("span", "review-score-pill", formatReviewScore(initialScoreValues.scorePercent));
  scorePill.classList.toggle("is-empty", initialScoreValues.scorePercent == null);
  scorePill.dataset.scoreFor = String(task.id);
  scorePill.setAttribute("aria-hidden", "true");
  tags.append(statusBadge, scorePill);
  // At-a-glance retention cue (visible while the row is still collapsed): how
  // many of this review's items were wrong last time and not yet judged here.
  {
    const judgedIds = new Set(judgments.filter((j) => j.outcome === "CORRECT" || j.outcome === "INCORRECT").map((j) => j.exerciseId));
    const toReinforce = [...priorWrong].filter((id) => !judgedIds.has(id)).length;
    if (toReinforce > 0) {
      const reinforce = createTextElement("span", "study-now-chip review-reinforce-chip", t("shell.toReinforce", { count: toReinforce }));
      reinforce.title = t("today.review.toReinforce.title");
      tags.append(reinforce);
    }
  }


  header.append(marker, subjectChip, tags);
  const titleEl = createTextElement("h3", "review-content", unit?.title ?? t("stats.unavailableContent"));
  const metaEl = createReviewMeta(unit, task);

  // Primary action row: mark review done + expand toggle
  const primary = document.createElement("div");
  primary.className = "review-row-primary review-row-actions";

  const reviewDoneLabel = document.createElement("label");
  reviewDoneLabel.className = "check-control review-toggle";
  const reviewDoneInput = document.createElement("input");
  reviewDoneInput.type = "checkbox";
  reviewDoneInput.checked = task.reviewDone;
  reviewDoneInput.dataset.action = "review-done";
  // Several rows say "Revisão feita": the name must tell a screen reader WHICH review (it still starts with the visible label).
  reviewDoneInput.setAttribute("aria-label", t("today.review.done.aria", { title: unit?.title ?? t("today.review.done.fallbackTitle"), number: task.reviewNumber }));
  reviewDoneInput.dataset.reviewId = String(task.id);
  reviewDoneInput.dataset.committedChecked = String(task.reviewDone);
  reviewDoneLabel.append(reviewDoneInput, document.createTextNode(t("today.review.done.label")));

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
    expandButton.textContent = t("today.review.viewPerformance");
    detail.hidden = !hasScoreData;

    const questionsDoneLabel = document.createElement("label");
    questionsDoneLabel.className = "check-control review-toggle";
    const questionsDoneInput = document.createElement("input");
    questionsDoneInput.type = "checkbox";
    questionsDoneInput.checked = task.questionsDone;
    questionsDoneInput.dataset.action = "questions-done";
    questionsDoneInput.dataset.reviewId = String(task.id);
    questionsDoneInput.dataset.committedChecked = String(task.questionsDone);
    questionsDoneLabel.append(questionsDoneInput, document.createTextNode(t("today.review.questionsDone")));

    const scoreInputs = document.createElement("div");
    scoreInputs.className = "review-score-inputs";
    const live = document.createElement("div");
    live.className = "review-score-live";
    live.append(createTextElement("span", "review-field-label", t("today.review.performance")));
    const score = createTextElement("span", "score-value review-score-value", formatReviewScore(initialScoreValues.scorePercent));
    score.dataset.scoreFor = String(task.id);
    score.setAttribute("aria-label", t("today.review.performance.aria"));
    live.append(score);
    scoreInputs.append(
      createScoreInput(task, "questionsCount", t("today.review.questions")),
      createScoreInput(task, "correctCount", t("today.review.correct")),
      live,
    );

    const commentLabel = document.createElement("label");
    commentLabel.className = "comment-control review-note";
    commentLabel.append(createTextElement("span", "review-field-label", t("today.review.comment")));
    const commentInput = document.createElement("textarea");
    commentInput.rows = 2;
    commentInput.maxLength = 500;
    commentInput.value = task.comment ?? "";
    commentInput.placeholder = t("today.review.comment.placeholder");
    commentInput.dataset.action = "comment";
    commentInput.dataset.reviewId = String(task.id);
    commentInput.dataset.committedValue = task.comment ?? "";
    commentInput.setAttribute("aria-label", t("today.review.comment.aria", { number: task.reviewNumber }));
    commentLabel.append(commentInput);

    detail.append(questionsDoneLabel, scoreInputs, commentLabel);
  }

  const externalBtn = document.createElement("button");
  externalBtn.type = "button";
  externalBtn.className = "review-expand";
  externalBtn.dataset.action = "toggle-external";
  externalBtn.setAttribute("aria-expanded", "false");
  externalBtn.textContent = t("today.review.external");

  // Progressive disclosure (Hoje = ação, não dashboard — master build plan
  // §21): a collapsed row shows only what's needed to decide/act (identity,
  // status, score-at-a-glance, mark-done). Resumo/exercícios/detalhe/
  // externos open on demand instead of every card rendering fully expanded.
  const toggleRowBtn = document.createElement("button");
  toggleRowBtn.type = "button";
  toggleRowBtn.className = "small-button review-row-toggle";
  toggleRowBtn.dataset.action = "toggle-row";
  toggleRowBtn.setAttribute("aria-expanded", "false");
  toggleRowBtn.textContent = t("today.review.open");
  const lessonBtn = createLessonButton(unit);

  primary.append(toggleRowBtn, lessonBtn, reviewDoneLabel);
  if (task.reviewDone) {
    // J02: a review marked by mistake can be taken back with a button that says so (the same audited reopen as clearing the box)
    const undoBtn = document.createElement("button");
    undoBtn.type = "button";
    undoBtn.className = "small-button review-undo";
    undoBtn.textContent = t("today.review.undo");
    undoBtn.setAttribute("aria-label", t("today.review.undo.aria", { title: unit?.title ?? t("today.review.done.fallbackTitle"), number: task.reviewNumber }));
    undoBtn.addEventListener("click", () => {
      reviewDoneInput.checked = false;
      reviewDoneInput.dispatchEvent(new Event("change", { bubbles: true }));
    });
    primary.append(undoBtn);
  }

  const secondaryControls = document.createElement("div");
  secondaryControls.className = "review-row-secondary-controls";
  secondaryControls.append(...(expandButton ? [expandButton] : []), externalBtn);

  const body = document.createElement("div");
  body.className = "review-row-body";
  body.hidden = true;

  // External exercises section
  const externalSection = document.createElement("div");
  externalSection.className = "review-external-section";
  externalSection.hidden = true;

  const extForm = document.createElement("div");
  extForm.className = "external-exercise-form";

  const extQLabel = document.createElement("label");
  extQLabel.className = "number-control review-number-control";
  extQLabel.append(createTextElement("span", "review-field-label", t("today.review.questionsDone")));
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
  extALabel.append(createTextElement("span", "review-field-label", t("today.review.correct")));
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
  extSubmitBtn.textContent = t("shell.action.register");

  const extMsg = createTextElement("p", "field-message external-form-message", "");
  extMsg.setAttribute("role", "status");
  extMsg.setAttribute("aria-live", "polite");

  extForm.append(extQLabel, extALabel, extSubmitBtn, extMsg);
  externalSection.append(
    createTextElement("p", "review-field-label", t("today.review.external.register")),
    extForm,
  );

  // Resumo Mestre section
  const summarySection = document.createElement("div");
  summarySection.className = "review-row-summary";

  const summaryHasBody = Boolean(unit?.summaryBody);
  const summaryDisplay = renderSummary(createTextElement("div", "review-summary-text", ""), unit?.summaryBody ?? "");
  summaryDisplay.dataset.summaryDisplay = String(task.id);
  summaryDisplay.hidden = !summaryHasBody;

  const summaryPlaceholder = createTextElement(
    "p",
    "review-summary-placeholder",
    t("today.review.summary.empty"),
  );
  summaryPlaceholder.hidden = summaryHasBody;

  const editSummaryButton = document.createElement("button");
  editSummaryButton.type = "button";
  editSummaryButton.className = "text-button review-edit-summary";
  editSummaryButton.dataset.action = "edit-summary";
  editSummaryButton.setAttribute("aria-expanded", "false"); // the editor below opens and closes: expose its state
  editSummaryButton.textContent = t("today.review.summary.edit");

  const summaryEditArea = document.createElement("div");
  summaryEditArea.className = "review-summary-edit";
  summaryEditArea.hidden = true;

  const summaryTextarea = document.createElement("textarea");
  summaryTextarea.rows = 6;
  summaryTextarea.value = unit?.summaryBody ?? "";
  summaryTextarea.placeholder = t("today.review.summary.placeholder");
  summaryTextarea.dataset.summaryEdit = String(task.id);
  summaryTextarea.setAttribute("aria-label", t("shell.summaryMaster"));

  const saveSummaryButton = document.createElement("button");
  saveSummaryButton.type = "button";
  saveSummaryButton.className = "primary-button review-save-summary";
  saveSummaryButton.dataset.action = "save-summary";
  saveSummaryButton.textContent = t("shell.action.save");

  const summaryMessage = createTextElement("p", "field-message review-summary-message", "");
  summaryMessage.setAttribute("role", "status");
  summaryMessage.setAttribute("aria-live", "polite");

  const hojeAuthoring = createSummaryAuthoring(summaryTextarea);
  summaryEditArea.append(hojeAuthoring.bar, summaryTextarea, hojeAuthoring.preview, saveSummaryButton, summaryMessage);
  summarySection.append(summaryDisplay, summaryPlaceholder, editSummaryButton, summaryEditArea);

  // Exercises section (Q→reveal-A→Acertei/Errei in the review context)
  if (exercises.length > 0) {
    const exercisesReviewSection = document.createElement("div");
    exercisesReviewSection.className = "review-row-exercises";
    exercisesReviewSection.dataset.exercisesTotal = String(exercises.length);
    exercisesReviewSection.dataset.exercisesAnswered = "0";
    exercisesReviewSection.dataset.exercisesCorrect = "0";

    const exercisesTitle = createTextElement("p", "review-exercises-title", t("shell.exercises.title", { count: exercises.length }));
    exercisesReviewSection.append(exercisesTitle);

    const judgmentByExercise = new Map(
      judgments.filter((j) => j.outcome === "CORRECT" || j.outcome === "INCORRECT").map((j) => [j.exerciseId, j]),
    );
    let restoredAnswered = 0;
    let restoredCorrect = 0;

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
      revealBtn.textContent = t("shell.action.viewAnswer");

      const answerEl = createTextElement("p", "review-exercise-answer", exercise.answerText);
      // The WHY (AI-generated exercises): revealed together with the answer it explains; absent otherwise.
      if (exercise.explanationText) {
        answerEl.append(createTextElement("span", "review-exercise-explanation", t("shell.exercise.why", { text: exercise.explanationText })));
      }
      answerEl.hidden = true;

      const judgmentRow = document.createElement("div");
      judgmentRow.className = "exercise-judgment";
      judgmentRow.hidden = true;

      const acerteiBtn = document.createElement("button");
      acerteiBtn.type = "button";
      acerteiBtn.className = "small-button exercise-correct-btn";
      acerteiBtn.dataset.action = "exercise-acertei";
      acerteiBtn.dataset.reviewId = String(task.id);
      acerteiBtn.textContent = t("today.review.exercise.correct");

      const erreiBtn = document.createElement("button");
      erreiBtn.type = "button";
      erreiBtn.className = "small-button exercise-wrong-btn";
      erreiBtn.dataset.action = "exercise-errei";
      erreiBtn.dataset.reviewId = String(task.id);
      erreiBtn.textContent = t("today.review.exercise.wrong");

      judgmentRow.append(acerteiBtn, erreiBtn);

      if (exercise.hintText) {
        const hintEl = createTextElement("p", "review-exercise-hint", t("shell.exercise.hint", { text: exercise.hintText }));
        exItem.append(qEl, hintEl, revealBtn, answerEl, judgmentRow);
      } else {
        exItem.append(qEl, revealBtn, answerEl, judgmentRow);
      }
      // Back to the material: the cited source page, shown with the answer (CSS hides it while the answer is hidden).
      const sourceBlocks = citationDetails(exercise.citations);
      if (sourceBlocks.length) {
        const sourceBox = document.createElement("div");
        sourceBox.className = "review-exercise-source";
        sourceBox.append(...sourceBlocks);
        answerEl.after(sourceBox);
      }
      // Retention cue from the longitudinal ledger: the last time this item was
      // answered it was wrong and no correct answer has followed.
      if (priorWrong.has(exercise.id) && !judgmentByExercise.has(exercise.id)) {
        exItem.prepend(createTextElement("span", "study-now-chip review-exercise-prior", t("shell.exercise.priorWrong")));
      }
      const restored = judgmentByExercise.get(exercise.id);
      if (restored) {
        const wasCorrect = restored.outcome === "CORRECT";
        exItem.dataset.exerciseAnswered = "true";
        exItem.dataset.attemptId = String(restored.attemptId);
        exItem.classList.add(wasCorrect ? "is-correct" : "is-wrong");
        answerEl.hidden = false;
        revealBtn.textContent = t("shell.action.hideAnswer");
        judgmentRow.hidden = false;
        acerteiBtn.disabled = true;
        erreiBtn.disabled = true;
        (wasCorrect ? acerteiBtn : erreiBtn).classList.add("is-selected");
        (wasCorrect ? acerteiBtn : erreiBtn).setAttribute("aria-pressed", "true");
        if (restored.retest) {
          const redoCorrect = restored.retest.outcome === "CORRECT";
          exItem.dataset.retest = restored.retest.outcome;
          exItem.append(createTextElement("span", `study-now-chip${redoCorrect ? " is-corrected" : ""}`, redoCorrect ? t("today.review.retest.fixed") : t("today.review.retest.stillWrong")));
        }
        restoredAnswered += 1;
        if (wasCorrect) restoredCorrect += 1;
      }
      exItem.append(createQuestionFlagControls(exercise, {
        flag: questionFlags.get(exercise.id) ?? null,
        attemptId: restored?.attemptId ?? judgedQuestionAttemptIds.get(exercise.id) ?? null,
        visible: Boolean(restored) || judgedQuestionExerciseIds.has(exercise.id),
      }));
      exercisesReviewSection.append(exItem);
    }
    exercisesReviewSection.dataset.exercisesAnswered = String(restoredAnswered);
    exercisesReviewSection.dataset.exercisesCorrect = String(restoredCorrect);

    const blockResult = document.createElement("div");
    blockResult.className = "review-block-result";
    blockResult.setAttribute("role", "status");
    blockResult.hidden = true;
    exercisesReviewSection.append(blockResult);
    reviewBlockExercises.set(exercisesReviewSection, exercises);

    // Retrieval first (product intent I.4): the questions come BEFORE the Resumo
    // Mestre, so the student tries to recall, then consults the summary to see
    // what was missing -- not the other way round.
    body.append(exercisesReviewSection, summarySection, secondaryControls, detail, externalSection);
  } else {
    body.append(summarySection, secondaryControls, detail, externalSection);
  }
  row.append(header, titleEl, metaEl, primary, body);
  const restoredSection = row.querySelector("[data-exercises-total]");
  if (restoredSection && Number(restoredSection.dataset.exercisesAnswered) > 0) {
    const total = Number(restoredSection.dataset.exercisesTotal);
    const answered = Number(restoredSection.dataset.exercisesAnswered);
    if (answered === total) {
      const scorePercent = (Number(restoredSection.dataset.exercisesCorrect) / total) * 100;
      for (const el of row.querySelectorAll("[data-score-for]")) {
        el.textContent = `${formatDecimal(scorePercent)}%`;
        el.classList.remove("is-empty");
      }
      restoredSection.dataset.allAnswered = "true";
    }
    updateReviewBlockResult(restoredSection);
    // The student already worked this block: come back to it open, with the
    // result and "Refazer erros" in view, not folded behind "Ver conteúdo".
    body.hidden = false;
    row.classList.add("is-open");
    toggleRowBtn.setAttribute("aria-expanded", "true");
    toggleRowBtn.textContent = t("shell.action.collapse");
  }
  syncReviewProgress(row);
  return row;
}

/** A stage with questions part answered shows "x de y respondidas" on its card (visible while collapsed): it stays pending until all are answered. */
function syncReviewProgress(row) {
  const section = row.querySelector("[data-exercises-total]");
  if (!section) return;
  const total = Number(section.dataset.exercisesTotal);
  const answered = Number(section.dataset.exercisesAnswered);
  const concluded = row.querySelector('[data-action="review-done"]')?.checked;
  let chip = row.querySelector(".review-progress-chip");
  if (concluded || answered === 0 || answered >= total) { chip?.remove(); return; }
  if (!chip) {
    chip = createTextElement("span", "study-now-chip review-progress-chip", "");
    row.querySelector(".review-row-tags")?.append(chip);
  }
  chip.textContent = t("appReview.progress", { answered, total });
}

let pendingTodayReturnReviewId = null;

// Exercises of a Hoje review block, kept out of the DOM so "Refazer erros"
// can hand the exact wrong items to the shared retest flow.
const reviewBlockExercises = new WeakMap();

function updateReviewBlockResult(section) {
  const result = section.querySelector(".review-block-result");
  if (!result) return;
  const total = Number(section.dataset.exercisesTotal);
  const answered = Number(section.dataset.exercisesAnswered);
  if (answered < total) {
    result.hidden = true;
    result.replaceChildren();
    return;
  }
  const correct = Number(section.dataset.exercisesCorrect);
  const wrong = total - correct;
  const redone = section.querySelectorAll(".review-exercise-item.is-wrong[data-retest]").length;
  const fixed = section.querySelectorAll('.review-exercise-item.is-wrong[data-retest="CORRECT"]').length;
  const pending = wrong - fixed;
  const summary = document.createElement("div");
  summary.className = "review-block-summary";
  summary.append(createTextElement("p", "review-block-score", t("today.review.block.score", { correct, total })));
  if (redone > 0) summary.append(createTextElement("p", "review-block-note", wrong === 1 ? t("today.review.block.retest.one", { fixed, wrong }) : t("today.review.block.retest.other", { fixed, wrong })));
  if (wrong > 0 && pending === 0) summary.append(createTextElement("p", "review-block-note", t("today.review.block.allFixed")));
  result.replaceChildren(summary);
  if (pending > 0) {
    const retest = document.createElement("button");
    retest.type = "button";
    retest.className = "primary-button review-block-retest";
    retest.dataset.action = "retest-block";
    retest.textContent = redone > 0 ? t("shell.retest.remaining", { count: pending }) : t("shell.retest.all", { count: pending });
    result.append(retest);
  }
  result.hidden = false;
}

// T40: read-only fallback for "cold offline reopen after prior sync
// displays the app/agenda". Deliberately renders plain text rows, not
// createReviewRow's interactive complete/reveal actions — those require a
// live server round-trip that offline-by-definition cannot make (T41
// disables mutation UI explicitly; this predates that, so it just never
// offers the action at all rather than offering one that would silently
// fail). Only overdue/today buckets are shown: T39's snapshot excludes
// already-completed tasks, so "done today" has no offline equivalent.
// T-F4-08 adds the read-only "Próximas revisões" block (dueDate > today).
function renderOfflineUpcoming(upcoming, nothingDueToday) {
  const groupsHost = upcomingBlock.querySelector("#upcoming-groups");
  const note = upcomingBlock.querySelector("#upcoming-note");
  const more = upcomingBlock.querySelector("#upcoming-more");
  groupsHost.replaceChildren();
  upcomingBlock.hidden = upcoming.total === 0;
  upcomingBlock.querySelector("#upcoming-count").textContent = String(upcoming.total);
  note.hidden = !nothingDueToday;
  more.hidden = upcoming.remaining === 0;
  more.textContent = upcoming.remaining === 1
    ? t("today.upcoming.more.one", { count: upcoming.remaining })
    : t("today.upcoming.more.other", { count: upcoming.remaining });
  for (const group of upcoming.groups) {
    const day = document.createElement("div");
    day.className = "upcoming-day";
    const heading = document.createElement("h3");
    heading.textContent = formatDate(group.date, { weekday: "long", day: "2-digit", month: "long", year: undefined });
    const list = document.createElement("ul");
    for (const item of group.items) {
      const row = document.createElement("li");
      row.className = "review-row review-row-offline";
      row.dataset.reviewTaskId = String(item.reviewTaskId);
      row.textContent = `${item.unitTitle} — ${item.subjectName}`;
      list.append(row);
    }
    day.append(heading, list);
    groupsHost.append(day);
  }
}

async function renderOfflineToday(accountId) {
  if (todayLoadingState) todayLoadingState.hidden = true;
  postponeContext = null; // the read-only snapshot cannot move dates
  if (postponeBtn) postponeBtn.hidden = true;
  const snapshot = await OfflineStore.loadSnapshot(accountId);
  const today = getLocalDateValue();

  let banner = document.querySelector("#offline-banner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "offline-banner";
    banner.setAttribute("role", "status");
    banner.className = "app-banner";
    mainContent?.prepend(banner);
  }
  banner.hidden = false;
  banner.textContent = snapshot
    ? t("today.offline.synced", { date: formatIntlDate(snapshot.syncedAt, { dateStyle: "short", timeStyle: "short" }) })
    : t("today.offline.noSnapshot");

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

  // Suggestions come from the live server; never show stale ones from the last online render.
  weakRenderSeq += 1; // also cancels an online render still in flight
  if (weakBlock) weakBlock.hidden = true;
  todayEmptyState.hidden = true;
  const upcoming = groupUpcomingReviews(snapshot?.items, today);
  renderOfflineUpcoming(upcoming, overdue.length === 0 && dueToday.length === 0);
  // "Tudo em dia" only when nothing is due AND nothing is coming up: with future items the upcoming list is the content.
  todaySuccessState.hidden = !(overdue.length === 0 && dueToday.length === 0 && upcoming.total === 0);
  todayTomorrow.hidden = true;
  if (todayLoadSummary) {
    const parts = [];
    if (overdue.length > 0) parts.push(tn("today.load.overdue", overdue.length));
    if (dueToday.length > 0) parts.push(t("today.load.today", { count: dueToday.length }));
    if (upcoming.total > 0) parts.push(tn("today.load.upcoming", upcoming.total));
    todayLoadSummary.hidden = parts.length === 0;
    todayLoadSummary.textContent = parts.join(" · ");
  }
  todayDateLabel.textContent = formatIntlDate(new Date(), { weekday: "long", day: "2-digit", month: "long" });
}

// "Vale reforçar": optional suggestions from the server's explainable priorities
// (units NOT already due, weak by observed recent evidence and/or with items still
// wrong). Extra signal only — a failure or local mode just hides the block.
let weakRenderSeq = 0;
async function renderWeakPractice(today) {
  if (!weakBlock) return;
  const seq = ++weakRenderSeq;
  let suggestions = [];
  if (REMOTE_MODE && DB.priorities?.get) {
    try {
      suggestions = (await DB.priorities.get(today)).weakPractice ?? [];
    } catch (error) {
      console.warn("Falha ao carregar sugestões de reforço.", error);
    }
  }
  if (seq !== weakRenderSeq) return; // a newer render already owns the block
  weakList.replaceChildren();
  weakCount.textContent = String(suggestions.length);
  weakBlock.hidden = suggestions.length === 0;
  for (const item of suggestions) {
    const row = document.createElement("article");
    row.className = "weak-practice-row";
    row.dataset.unitId = String(item.unitId);
    const text = document.createElement("div");
    text.className = "weak-practice-text";
    text.append(
      createTextElement("span", "weak-practice-title", item.unitTitle),
      createTextElement("span", "weak-practice-meta", `${item.subjectName} · ${weakPracticeReason(item)}`),
    );
    const open = createTextElement("button", "small-button", t("shell.action.viewInPlan"));
    open.type = "button";
    open.addEventListener("click", () => {
      pendingPlanFocusUnitId = item.unitId;
      showScreen("plan");
    });
    row.append(text, open);
    weakList.append(row);
  }
}

// Hoje renders are async and can overlap (login, saving a unit, the nav click). Only the NEWEST render may write to the screen: a render
// that started earlier but finishes later used to overwrite fresh data with stale data (CI_STABLE, e2e/priorities-hoje.spec.js).
let todayRenderSeq = 0;
// EXPERIMENTAL return-to-source record: the app tells the server only that the original was opened (remote mode; best effort).
if (REMOTE_MODE) setSourceOpeningRecorder((opening) => apiRequest("/v1/source-openings", { method: "POST", body: opening }));

// EXPERIMENTAL panel on Hoje (see experimental-obligations-ui.js): only when the student turned the switch on in Configurações.
function refreshExperimentPanel() {
  const host = document.querySelector("#experiment-host");
  if (!host) return;
  if (isExperimentOn()) void renderObligationsPanel(host, { onPractice: practiceObligation });
  else host.replaceChildren();
}
const experimentSwitch = document.querySelector("#experiment-switch");
if (experimentSwitch) {
  experimentSwitch.checked = isExperimentOn();
  experimentSwitch.addEventListener("change", () => { setExperiment(experimentSwitch.checked); refreshExperimentPanel(); });
}

export async function renderToday() {
  const renderId = ++todayRenderSeq;
  refreshExperimentPanel();
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
  let pendingToday, overdueReviews, completedToday, tomorrowReviews, learningUnits, subjects, allTasks;
  try {
    [pendingToday, overdueReviews, completedToday, tomorrowReviews, learningUnits, subjects, allTasks] =
      await Promise.all([
        DB.reviewTasks.getForToday(today),
        DB.reviewTasks.getOverdue(today),
        DB.reviewTasks.getCompletedToday(today),
        DB.reviewTasks.getTomorrow(tomorrow),
        DB.learningUnits.getAll(),
        DB.subjects.getAll(),
        DB.reviewTasks.getAll(),
      ]);
    if (todayLoadingState) todayLoadingState.hidden = true;
  } catch (error) {
    if (todayLoadingState) todayLoadingState.hidden = true; // a failure speaks through the error banner, not through "loading" or "empty"
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
  if (renderId !== todayRenderSeq) return; // a newer render started: its data wins
  if (existingOfflineBanner) existingOfflineBanner.hidden = true;
  const questionFlags = await loadQuestionFlags();
  if (renderId !== todayRenderSeq) return;
  const unitsById = new Map(learningUnits.map((unit) => [unit.id, unit]));
  const subjectsById = new Map(subjects.map((subject) => [subject.id, subject]));
  const groups = {
    overdue: overdueReviews,
    today: pendingToday,
    doneToday: completedToday,
  };
  // "Adiar vencidas" (HG-09): offered whenever something is overdue; the dialog previews the plan from exactly this list.
  postponeContext = { tasks: overdueReviews, today };
  if (postponeBtn) postponeBtn.hidden = overdueReviews.length === 0;

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

  if (renderId !== todayRenderSeq) return;
  // Judgments already given in still-open reviews live on the server (each
  // Acertei/Errei submits a real attempt). Restore them so leaving Hoje or
  // reloading never silently drops a block the student already answered.
  const judgmentsByTaskId = new Map();
  const priorWrongByTaskId = new Map();
  if (REMOTE_MODE && DB.attempts?.listForReviews) {
    // Completed-today reviews too: marking a review done must not wipe its
    // errors (and "Refazer erros") from view by re-rendering fresh exercises.
    const openWithExercises = [...overdueReviews, ...pendingToday, ...completedToday]
      .filter((t) => (exercisesByUnitId.get(t.unitId) ?? []).length > 0)
      .map((t) => t.id);
    try {
      const { attemptsByReviewTask, priorWrongByReviewTask } = await DB.attempts.listForReviews(openWithExercises);
      for (const [taskId, judgments] of Object.entries(attemptsByReviewTask)) judgmentsByTaskId.set(Number(taskId), judgments);
      for (const [taskId, ids] of Object.entries(priorWrongByReviewTask ?? {})) priorWrongByTaskId.set(Number(taskId), new Set(ids));
    } catch (error) {
      console.error("Falha ao restaurar julgamentos das revisões.", error);
    }
  }
  if (renderId !== todayRenderSeq) return;

  // Overdue before today (protocol kept), but never a review with nothing to
  // retrieve while another one has exercises / items to reinforce. Picked before
  // the lists are built because the card that holds it must start open.
  const contextOf = (task) => ({
    exerciseIds: (exercisesByUnitId.get(task.unitId) ?? []).map((e) => e.id),
    judgedIds: new Set((judgmentsByTaskId.get(task.id) ?? []).filter((j) => j.outcome === "CORRECT" || j.outcome === "INCORRECT").map((j) => j.exerciseId)),
    priorWrongIds: priorWrongByTaskId.get(task.id) ?? new Set(),
  });
  const pick = pickPrimaryReview(overdueReviews, pendingToday, contextOf);

  for (const [groupName, tasks] of Object.entries(groups)) {
    const block = reviewGroups[groupName];
    const list = block.querySelector(`[data-review-list="${groupName}"]`);
    const count = block.querySelector(`[data-count-for="${groupName}"]`);
    // Re-renders (e.g. after "Revisão feita") must not fold a unit card the student had open.
    const openUnitIds = new Set([...list.querySelectorAll("details.overdue-unit[open]")].map((d) => d.dataset.unitId));
    // The unit of the "Começar agora" review is where the student goes next: it never starts folded.
    if (groupName === "overdue" && pick?.group === "overdue") openUnitIds.add(String(pick.task.unitId));
    list.replaceChildren();
    count.textContent = String(tasks.length);
    block.hidden = tasks.length === 0;

    const buildRow = (task) => {
      const unit = unitsById.get(task.unitId);
      const subject = subjectsById.get(unit?.subjectId);
      const exercises = exercisesByUnitId.get(task.unitId) ?? [];
      return createReviewRow(task, unit, subject, groupName, today, exercises, judgmentsByTaskId.get(task.id) ?? [], priorWrongByTaskId.get(task.id) ?? new Set(), questionFlags);
    };

    // What the list shows, in order; `keep` = must stay visible when the list is folded (see appendFoldedList).
    const items = [];
    if (groupName !== "overdue") {
      for (const task of tasks) items.push({ el: buildRow(task), keep: false });
    } else {
      // Vencidas: one card per unit. A unit with a single overdue stage keeps
      // its plain row; a unit with several becomes an expandable card whose
      // stages are the very same rows (each keeps its own "Revisão feita").
      const unitGroups = groupOverdueByUnit(tasks);
      const collapse = shouldCollapseOverdue(tasks.length);
      if (unitGroups.length < tasks.length) {
        count.textContent = t("today.overdue.count", {
          stages: tn("today.overdue.count.stages", tasks.length),
          units: tn("today.overdue.count.units", unitGroups.length),
        });
      }
      for (const group of unitGroups) {
        const keep = openUnitIds.has(String(group.unitId));
        if (group.tasks.length === 1) {
          items.push({ el: buildRow(group.tasks[0]), keep });
          continue;
        }
        const unit = unitsById.get(group.unitId);
        items.push({ el: createOverdueUnitCard(group, unit, subjectsById.get(unit?.subjectId), today, collapse && !keep, buildRow), keep });
      }
    }
    appendFoldedList(list, groupName, items);
  }

  renderUpcomingReviews(allTasks ?? [], unitsById, subjectsById, today);
  renderWeakPractice(today).catch(console.error); // not awaited: suggestions must never delay Hoje

  // Slice 3 (SMARTLEARN_PRODUCT_FIRST_V1): "o que eu faço agora?" answered
  // with data already fetched above — no new scheduler, no change to the
  // 16-review schedule. Priority: overdue (oldest first, already the
  // server's own sort order) > today > (tomorrow/none handled by the
  // existing todayTomorrow/todaySuccessState elements below, which
  // already communicate those two cases adequately).
  if (todayPrimaryAction && todayPrimaryActionText && todayPrimaryActionBtn) {
    const primaryTask = pick?.task ?? null;
    if (primaryTask) {
      const lead = overdueReviews.length > 0
        ? (overdueReviews.length === 1 ? t("today.primary.overdue.one", { count: overdueReviews.length }) : t("today.primary.overdue.other", { count: overdueReviews.length }))
        : (pendingToday.length === 1 ? t("today.primary.today.one", { count: pendingToday.length }) : t("today.primary.today.other", { count: pendingToday.length }));
      todayPrimaryActionText.textContent = unitsById.get(primaryTask.unitId)?.title ?? lead;
      todayPrimaryActionBtn.dataset.reviewId = String(primaryTask.id);
      // "Revisar uma por vez" opens the questions of this review one at a time; only offered while some are still unanswered.
      if (todayFocusReviewBtn) {
        const { exerciseIds, judgedIds } = contextOf(primaryTask);
        todayFocusReviewBtn.dataset.reviewId = String(primaryTask.id);
        todayFocusReviewBtn.hidden = !exerciseIds.some((id) => !judgedIds.has(id));
      }
      todayPrimaryAction.hidden = false;
    } else {
      todayPrimaryAction.hidden = true;
      if (todayFocusReviewBtn) todayFocusReviewBtn.hidden = true;
    }
  }

  // V7.2 summary line: "3 vencidas · 3 para hoje · 0 concluídas"; yesterday's and tomorrow's figures (the old Ontem/Amanhã tiles) follow it when there are any
  if (todayLoadSummary) {
    let yesterdayDone = 0;
    if (learningUnits.length > 0) {
      try { yesterdayDone = (await DB.reviewTasks.getCompletedToday(subtractDays(today, 1))).length; } catch { /* the figure is left out */ }
    }
    if (renderId !== todayRenderSeq) return;
    const parts = [
      tn("today.summary.overdue", overdueReviews.length),
      t("today.summary.today", { count: pendingToday.length }),
      tn("today.summary.done", completedToday.length),
    ];
    if (yesterdayDone > 0) parts.push(tn("today.summary.yesterday", yesterdayDone));
    if (tomorrowReviews.length > 0) parts.push(tn("today.summary.tomorrow", tomorrowReviews.length));
    todayLoadSummary.textContent = parts.join(" · ");
    todayLoadSummary.hidden = learningUnits.length === 0;
  }

  const pendingCount = overdueReviews.length + pendingToday.length;
  const hasData = learningUnits.length > 0;
  todayEmptyState.hidden = hasData;
  todaySuccessState.hidden = !(hasData && pendingCount === 0);

  // tomorrow now lives in the day strip; the old sentence would only repeat it
  todayTomorrow.textContent = "";
  todayTomorrow.hidden = true;

  const dateText = formatIntlDate(new Date(), { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  todayDateLabel.textContent = dateText.charAt(0).toLocaleUpperCase() + dateText.slice(1);

  // Show/hide daily summary button based on studies with study_date === today
  const todayStudies = learningUnits.filter((u) => u.studyDate === today);
  if (dailySummaryBtn) {
    dailySummaryBtn.hidden = todayStudies.length === 0;
  }
  // Close the panel whenever renderToday re-runs (e.g. after completing a review)
  if (dailySummaryPanel) {
    dailySummaryPanel.hidden = true;
  }

  // Coming back from a redo started inside a review block: land on that block,
  // not at the top of Hoje. Only consumed once Hoje is actually the visible
  // screen (the redo's own finish also re-renders while still on Estudar).
  if (pendingTodayReturnReviewId != null && document.querySelector("#screen-today")?.hidden === false) {
    const target = reviewDashboard.querySelector(`.review-row[data-review-id="${pendingTodayReturnReviewId}"]`);
    pendingTodayReturnReviewId = null;
    revealFolded(target);
    const anchor = target?.querySelector(".review-block-result:not([hidden])") ?? target;
    anchor?.scrollIntoView({ block: "center" });
  }
}


export async function renderStats() {
  const [reviewTasks, evidence, learningUnits, subjects] = await Promise.all([
    DB.reviewTasks.getAll(),
    DB.learningEvidence.getAll(),
    DB.learningUnits.getAll(),
    DB.subjects.getAll(),
  ]);
  // The exercise list below is a ledger of finished exercises, not a period-bound indicator.
  const stats = Stats.calculate(reviewTasks, evidence, learningUnits, subjects);

  setHistory(buildHistoryRows(stats.completedExercises, learningUnits, subjects), openExerciseDetail);

  // Header, table, distribution and chart all derive from the same period evidence (renderStatsBySubject).
  await renderStatsBySubject();
  if (evolutionFilterSubject && evolutionFilterSubject.options.length <= 1) {
    for (const s of subjects.filter((s) => s.isActive)) {
      const opt = document.createElement("option");
      opt.value = String(s.id);
      opt.textContent = s.name;
      evolutionFilterSubject.append(opt);
    }
    syncSelect(evolutionFilterSubject);
  }
  renderEvolutionSvg(evidence, learningUnits, subjects);
}
const TRACKING_STATE_LABELS = {
  get ATRASADO() { return t("plan.state.overdue"); },
  get SEM_EVIDENCIA() { return t("plan.state.noEvidence"); },
  get EM_REVISAO() { return t("plan.state.reviewToday"); },
  get EM_ESTUDO() { return t("plan.state.studying"); },
  get EM_DIA() { return t("plan.state.onTrack"); },
};

function getPlanStateBadge(state) {
  const span = document.createElement("span");
  span.className = "plan-state-badge";
  span.dataset.state = state;
  span.textContent = TRACKING_STATE_LABELS[state] ?? state;
  return span;
}

// getNextReview itself now lives in scheduler.js (pure, unit-tested there —
// see test/scheduler.test.js) since it has no DOM dependency.

function getPlanPerfBadge(evidence) {
  const total = evidence.reduce((s, e) => s + e.questionsCount, 0);
  if (total === 0) return null;
  const correct = evidence.reduce((s, e) => s + e.correctCount, 0);
  const pct = (correct / total) * 100;
  const span = document.createElement("span");
  span.className = "performance-badge";
  // getState's states (STRONG/ADEQUATE/ATTENTION/CRITICAL) match dataset.perf's
  // own lowercase vocabulary exactly — see getPerformanceBandClass above for
  // why this delegates to getState instead of an independent threshold chain.
  span.dataset.perf = getState(pct, total).toLowerCase();
  span.textContent = formatPerformanceScore(pct);
  return span;
}


// "Para reforçar": exercises still wrong at their last attempt, by unit. Only the server
// keeps item-level attempts; without it (or if it fails) the callers just show no cue —
// it is an extra signal, never a reason to fail a whole screen.
async function loadReinforcementByUnit() {
  if (!REMOTE_MODE || !DB.attempts?.reinforcement) return {};
  try {
    return await DB.attempts.reinforcement();
  } catch (error) {
    console.warn("Falha ao carregar itens para reforçar.", error);
    return {};
  }
}

// Set by Estatísticas ("Ver no Plano"); consumed once by the next renderPlan, which opens that unit.
let pendingPlanFocusUnitId = null;
// set by Plano's "Editar questões": the Cadastro screen opens that unit's question list once it has drawn
let pendingRegisterFocusUnitId = null;

/**
 * Plano with one lesson open (its Resumo and "Estudar agora"): the one way every shortcut to a lesson gets there. It goes only where the lesson
 * still exists; otherwise it opens nothing and answers false, so the caller says so instead of leaving a dead button.
 */
async function openLessonInPlan(unitId) {
  const units = await DB.learningUnits.getAll().catch(() => []);
  const lesson = findLesson(units, unitId);
  if (!lesson) return false;
  pendingPlanFocusUnitId = lesson.id;
  showScreen("plan", { focus: true });
  return true;
}

// Plano can be refreshed from several independent actions (navigation, exam finalization,
// study completion, subject edits). Only the newest async render may publish DOM.
let planRenderSeq = 0;

export async function renderPlan() {
  if (!planList) return;
  const renderId = ++planRenderSeq;
  const today = getLocalDateValue();
  const [learningUnits, subjects, allTasks, allEvidence, reinforcementByUnit] = await Promise.all([
    DB.learningUnits.getAll(),
    DB.subjects.getAll(),
    DB.reviewTasks.getAll(),
    DB.learningEvidence.getAll(),
    loadReinforcementByUnit(),
  ]);
  if (renderId !== planRenderSeq) return;
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
  if (renderId !== planRenderSeq) return;

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
    syncSelect(select);
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
  } else if (planSortValue === "content") {
    sorted = [...learningUnits].sort((a, b) => a.title.localeCompare(b.title, "pt-BR", { sensitivity: "base", numeric: true }) || b.studyDate.localeCompare(a.studyDate));
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

  // A requested unit ("Ver no Plano") must be on screen: a subject/state filter left over from an
  // earlier visit would hide its row and nothing would open, so such a filter is cleared first.
  if (pendingPlanFocusUnitId != null) {
    const focusUnit = learningUnits.find((unit) => unit.id === pendingPlanFocusUnitId);
    if (focusUnit) {
      const hiddenBySubject = Boolean(planFilterSubject?.value) && planFilterSubject.value !== String(focusUnit.subjectId);
      const hiddenByState = Boolean(planFilterState?.value)
        && getTrackingState(focusUnit.id, allTasks, allEvidence, today) !== planFilterState.value;
      if (hiddenBySubject && planFilterSubject) {
        planFilterSubject.value = "";
        syncSelect(planFilterSubject);
      }
      if (hiddenByState && planFilterState) {
        planFilterState.value = "";
        syncSelect(planFilterState);
      }
    }
  }

  // Apply filters
  const subjectFilter = planFilterSubject?.value ?? "";
  const stateFilter = planFilterState?.value ?? "";
  const periodFilter = planFilterPeriod?.value ?? "";
  const planQuery = (planSearch?.value ?? "").trim().toLocaleLowerCase("pt-BR");
  const periodCutoff = periodFilter ? subtractDays(today, periodFilter === "last-30" ? 30 : periodFilter === "last-90" ? 90 : 365) : null;
  const filtered = sorted.filter((unit) => {
    if (subjectFilter && String(unit.subjectId) !== subjectFilter) return false;
    if (stateFilter && getTrackingState(unit.id, allTasks, allEvidence, today) !== stateFilter) return false;
    if (periodCutoff && unit.studyDate < periodCutoff) return false;
    if (planQuery) {
      const hay = `${unit.title} ${subjectsById.get(unit.subjectId)?.name ?? ""} ${unit.sourceText ?? ""}`.toLocaleLowerCase("pt-BR");
      if (!hay.includes(planQuery)) return false;
    }
    return true;
  });
  const planPages = Math.max(1, Math.ceil(filtered.length / PLAN_PAGE_SIZE));
  // a row requested by "Ver no Plano" must be on the page shown
  if (pendingPlanFocusUnitId != null) {
    const at = filtered.findIndex((unit) => unit.id === pendingPlanFocusUnitId);
    if (at >= 0) planPage = Math.floor(at / PLAN_PAGE_SIZE) + 1;
  }
  planPage = Math.min(Math.max(1, planPage), planPages);
  const planFrom = (planPage - 1) * PLAN_PAGE_SIZE;
  const pageUnits = filtered.slice(planFrom, planFrom + PLAN_PAGE_SIZE);
  if (planCount) {
    planCount.hidden = learningUnits.length === 0;
    planCount.textContent = filtered.length === 0 ? "" : t("screens.plan.count", { matched: filtered.length, from: planFrom + 1, to: planFrom + pageUnits.length });
  }
  if (planPager) {
    planPager.hidden = planPages === 1;
    planPageLabel.textContent = t("screens.plan.page", { page: planPage, count: planPages });
    planPrev.disabled = planPage <= 1;
    planNext.disabled = planPage >= planPages;
    if (planTopPager) {
      planTopPager.hidden = planPages === 1;
      planTopPrev.disabled = planPrev.disabled;
      planTopNext.disabled = planNext.disabled;
    }
  }

  planEmpty.hidden = filtered.length > 0;
  // no lessons at all: the way to start sits in the body too, not only in the heading
  if (planEmptyNewBtn) planEmptyNewBtn.hidden = filtered.length > 0 || learningUnits.length > 0;
  // an empty Plano (no lessons at all) says how to start; a filter that matches nothing keeps the plain text
  planEmpty.textContent = learningUnits.length === 0 && REMOTE_MODE && LOCAL_AUTHORITY
    ? t("plan.empty.withMaterials")
    : t("plan.empty");
  planList.replaceChildren();

  for (const unit of pageUnits) {
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
    compact.className = "plan-row-compact sl-compact-normalized";

    const subjectChip = document.createElement("span");
    subjectChip.className = "subject-chip sl-plan-identity";
    subjectChip.textContent = subject?.name ?? t("stats.noSubject");
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
    if (unit.lessonDate) parts.push(t("plan.row.lessonDate", { date: formatDate(unit.lessonDate) }));
    if (unit.sourceText) parts.push(unit.sourceText);
    if (exerciseCount > 0) parts.push(t("plan.row.exercises", { count: exerciseCount }));
    parts.push(unit.summaryBody ? t("plan.row.summary.yes") : t("plan.row.summary.no"));
    const unitTasks = allTasks.filter((task) => task.unitId === unit.id);
    if (unitTasks.length > 0) parts.push(t("tracking.card.reviews", { done: unitTasks.filter((task) => task.reviewDone).length, total: unitTasks.length }));
    if (nextReview) parts.push(t("plan.row.next", { date: formatDate(nextReview) }));
    meta.textContent = parts.join(" · ");

    const badges = document.createElement("span");
    badges.className = "plan-row-badges sl-plan-state";
    badges.append(getPlanStateBadge(state));
    const perfBadge = getPlanPerfBadge(evidence);
    if (perfBadge) badges.append(perfBadge);
    const reinforceIds = new Set(reinforcementByUnit[unit.id] ?? []);
    if (reinforceIds.size > 0) {
      badges.append(createTextElement("span", "study-now-chip plan-reinforce-chip", t("shell.toReinforce", { count: reinforceIds.size })));
    }

    const expandBtn = document.createElement("button");
    expandBtn.className = "plan-expand-btn";
    expandBtn.type = "button";
    expandBtn.setAttribute("aria-expanded", "false");
    expandBtn.setAttribute("aria-label", t("plan.row.expand", { title: titleSpan.textContent }));

    // V6 row: identity | name (title + meta) | state | chevron
    const nameBlock = document.createElement("div");
    nameBlock.className = "sl-plan-name";
    nameBlock.append(titleSpan, meta);
    compact.append(subjectChip, nameBlock, badges, expandBtn);

    // Expansion panel (lazy rendered)
    const detail = document.createElement("div");
    detail.className = "plan-row-detail";
    detail.hidden = true;

    expandBtn.addEventListener("click", async () => {
      const isExpanded = expandBtn.getAttribute("aria-expanded") === "true";
      expandBtn.setAttribute("aria-expanded", String(!isExpanded));
      expandBtn.setAttribute("aria-label", isExpanded ? t("plan.row.expand", { title: titleSpan.textContent }) : t("plan.row.collapse", { title: titleSpan.textContent }));
      detail.hidden = isExpanded;

      if (!isExpanded && !detail.dataset.loaded) {
        detail.dataset.loaded = "1";
        detail.replaceChildren();

        // The shortcut Acompanhar used to give: a review due today (or overdue) is done on Hoje, where it is waiting.
        const dueReview = unitTasks.filter((task) => !task.reviewDone && task.dueDate <= today).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
        if (dueReview) {
          const goToReviewBtn = createTextElement("button", "small-button plan-go-to-review", t("tracking.card.goToReview"));
          goToReviewBtn.type = "button";
          goToReviewBtn.dataset.action = "plan-go-to-review";
          goToReviewBtn.addEventListener("click", () => {
            showScreen("today");
            renderToday().then(() => {
              setTimeout(() => document.querySelector(`[data-review-id="${dueReview.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 300);
            }).catch(console.error);
          });
          detail.append(goToReviewBtn);
        }

        // Summary Mestre — always editable in Plan detail
        const summarySection = document.createElement("div");
        summarySection.className = "plan-detail-section plan-summary-section";
        summarySection.dataset.unitId = unit.id;
        const summaryHeading = document.createElement("h3");
        summaryHeading.textContent = t("shell.summaryMaster");
        summarySection.append(summaryHeading);
        appendSummarySources(summarySection, unit.id);

        let currentSummary = unit.summaryBody ?? "";

        const summaryDisplayWrap = document.createElement("div");
        summaryDisplayWrap.className = "plan-summary-display-wrap";

        const summaryText = renderSummary(createTextElement("div", "plan-summary-body", ""), currentSummary);
        summaryText.hidden = !currentSummary;

        const summaryPlaceholder = document.createElement("p");
        summaryPlaceholder.className = "plan-summary-placeholder";
        summaryPlaceholder.textContent = t("plan.detail.summary.empty");
        summaryPlaceholder.hidden = !!currentSummary;

        const editSummaryBtn = document.createElement("button");
        editSummaryBtn.type = "button";
        editSummaryBtn.className = "text-button plan-edit-summary-btn";
        editSummaryBtn.textContent = currentSummary ? t("plan.detail.summary.edit") : t("plan.detail.summary.add");

        const summaryEditArea = document.createElement("div");
        summaryEditArea.className = "plan-summary-edit-area";
        summaryEditArea.hidden = true;
        const summaryTextarea = document.createElement("textarea");
        summaryTextarea.className = "plan-summary-textarea";
        summaryTextarea.rows = 6;
        summaryTextarea.setAttribute("aria-label", t("shell.summaryMaster"));
        summaryTextarea.value = currentSummary;
        const summaryActions = document.createElement("div");
        summaryActions.className = "plan-summary-edit-actions";
        const saveSummaryBtn = document.createElement("button");
        saveSummaryBtn.type = "button";
        saveSummaryBtn.className = "primary-button";
        saveSummaryBtn.textContent = t("shell.action.save");
        const cancelSummaryBtn = document.createElement("button");
        cancelSummaryBtn.type = "button";
        cancelSummaryBtn.className = "text-button";
        cancelSummaryBtn.textContent = t("shell.action.cancel");
        const summaryMsg = document.createElement("p");
        summaryMsg.className = "form-message";
        summaryMsg.setAttribute("role", "status");
        summaryMsg.setAttribute("aria-live", "polite");
        summaryActions.append(saveSummaryBtn, cancelSummaryBtn, summaryMsg);
        summaryEditArea.append(summaryTextarea, summaryActions);

        editSummaryBtn.addEventListener("click", () => {
          summaryTextarea.value = currentSummary;
          planAuthoring.reloadVisual?.();
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
          planAuthoring.flushVisual?.();
          const newBody = summaryTextarea.value.trim() || null;
          summaryMsg.textContent = t("shell.saving");
          try {
            await DB.learningUnits.update(unit.id, { summaryBody: newBody });
            currentSummary = newBody ?? "";
            renderSummary(summaryText, currentSummary);
            summaryText.hidden = !currentSummary;
            summaryPlaceholder.hidden = !!currentSummary;
            editSummaryBtn.textContent = currentSummary ? t("plan.detail.summary.edit") : t("plan.detail.summary.add");
            summaryDisplayWrap.hidden = false;
            editSummaryBtn.hidden = false;
            summaryEditArea.hidden = true;
            summaryMsg.textContent = "";
            unit.summaryBody = newBody;
          } catch (err) {
            summaryMsg.textContent = t("plan.detail.summary.saveError", { message: err.message });
          }
        });

        summaryDisplayWrap.append(summaryText, summaryPlaceholder);
        const planAuthoring = createSummaryAuthoring(summaryTextarea, { visual: true });
        summaryEditArea.prepend(planAuthoring.modeSwitch);
        summaryEditArea.prepend(planAuthoring.bar);
        summaryTextarea.after(planAuthoring.preview);
        summaryTextarea.after(planAuthoring.visualHost);
        summarySection.append(summaryDisplayWrap, editSummaryBtn, summaryEditArea);
        detail.append(summarySection);

        // Exercises
        const exs = await DB.exercises.getAll(unit.id);
        if (exs.length > 0) {
          const exSection = document.createElement("div");
          exSection.className = "plan-detail-section";
          const exHeading = document.createElement("h3");
          exHeading.textContent = t("shell.exercises.title", { count: exs.length });
          exSection.append(exHeading);
          for (const ex of exs) {
            const item = document.createElement("div");
            item.className = "plan-exercise-item";
            if (reinforceIds.has(ex.id)) {
              item.classList.add("is-reinforce");
              item.append(
                createTextElement("span", "plan-exercise-text", ex.questionText),
                createTextElement("span", "study-now-chip plan-exercise-prior", t("shell.exercise.priorWrong")),
              );
            } else {
              item.textContent = ex.questionText;
            }
            exSection.append(item);
          }
          const actions = document.createElement("div");
          actions.className = "plan-exercise-actions";
          exSection.append(actions);
          // First active-recall pass on demand. Offered only until the unit has
          // its INITIAL_PRACTICE evidence: that is exactly what this flow
          // records, so a second on-demand pass would be mislabeled (later
          // retrieval belongs to the scheduled reviews, not to massed repeats).
          // An exam's evidence has the same type but is NOT a study pass: it must not hide "Estudar agora".
          if (!evidence.some((ev) => ev.context === "INITIAL_PRACTICE" && ev.origin !== "EXAM")) {
            const startBtn = document.createElement("button");
            startBtn.type = "button";
            startBtn.className = "primary-button plan-study-now";
            startBtn.dataset.action = "plan-study-now";
            startBtn.textContent = t("plan.detail.studyNow");
            startBtn.addEventListener("click", () => startStudyNow(unit, subject?.name));
            actions.append(startBtn);
          }
          // B03: question authoring lives on the Cadastro screen (nav-hidden); this is the entry from the unit the student is looking at.
          const editQuestionsBtn = document.createElement("button");
          editQuestionsBtn.type = "button";
          editQuestionsBtn.className = "secondary-button plan-edit-questions";
          editQuestionsBtn.dataset.action = "plan-edit-questions";
          editQuestionsBtn.textContent = t("plan.detail.editQuestions");
          editQuestionsBtn.addEventListener("click", () => {
            pendingRegisterFocusUnitId = unit.id;
            showScreen("register", { focus: true });
          });
          actions.append(editQuestionsBtn);
          // Modo Prova: measure first, teach after (nothing is revealed until the student submits).
          if (REMOTE_MODE && DB.exams) {
            const examBtn = document.createElement("button");
            examBtn.type = "button";
            examBtn.className = "secondary-button plan-exam";
            examBtn.dataset.action = "plan-exam";
            examBtn.textContent = t("plan.detail.takeExam");
            examBtn.addEventListener("click", () => startExam(unit, subject?.name));
            actions.append(examBtn);
            if (subject && DB.exams.startSubject) {
              const subjectExamBtn = document.createElement("button");
              subjectExamBtn.type = "button";
              subjectExamBtn.className = "secondary-button plan-subject-exam";
              subjectExamBtn.dataset.action = "plan-subject-exam";
              subjectExamBtn.textContent = t("shell.exam.subject");
              subjectExamBtn.title = t("plan.detail.subjectExam.title", { subject: subject.name });
              subjectExamBtn.addEventListener("click", () => startSubjectExam(subject));
              actions.append(subjectExamBtn);
            }
          }
          detail.append(exSection);
        }

        // Evidence history
        if (evidence.length > 0) {
          const evSection = document.createElement("div");
          evSection.className = "plan-detail-section";
          const evHeading = document.createElement("h3");
          evHeading.textContent = t("plan.detail.history");
          evSection.append(evHeading);
          const evList = document.createElement("ul");
          evList.className = "plan-evidence-list";
          for (const ev of [...evidence].sort((a, b) => b.evidenceDate.localeCompare(a.evidenceDate))) {
            const li = document.createElement("li");
            const ctx = { INITIAL_PRACTICE: t("plan.detail.history.initialPractice"), REVIEW: t("plan.detail.history.review"), EXTERNAL: t("plan.detail.history.external") };
            const label = ev.origin === "EXAM" ? t("plan.detail.history.exam") : (ctx[ev.context] ?? ev.context);
            li.textContent = t("plan.detail.history.entry", { date: formatDate(ev.evidenceDate), label, correct: ev.correctCount, questions: ev.questionsCount, percent: formatDecimal(ev.scorePercent) });
            evList.append(li);
          }
          evSection.append(evList);
          detail.append(evSection);
        }

        if (!detail.children.length) {
          const empty = document.createElement("p");
          empty.className = "plan-detail-empty";
          empty.textContent = t("plan.detail.empty");
          detail.append(empty);
        }
      }
    });

    row.append(compact, detail);
    planList.append(row);
  }

  if (pendingPlanFocusUnitId != null) {
    const target = planList.querySelector(`.plan-row[data-unit-id="${pendingPlanFocusUnitId}"]`);
    pendingPlanFocusUnitId = null;
    if (target) {
      target.querySelector(".plan-expand-btn")?.click();
      target.scrollIntoView({ block: "center" });
    }
  }
}

// "Meu estudo está funcionando?" — plain text from observable evidence (see studyVerdict).
// It ignores the period filter on purpose: a trend is a comparison over time, not a slice.
async function renderStudyVerdict(subjectRows, unitRows) {
  if (!studyVerdictEl) return;
  const verdict = Analytics.studyVerdict(subjectRows, unitRows, await loadReinforcementByUnit());
  const text = verdictText(verdict);
  studyVerdictEl.dataset.state = verdict.state;
  studyVerdictHeadline.textContent = text.headline;
  studyVerdictDetail.textContent = text.detail;
  studyVerdictEl.hidden = false;

  const a = verdict.attention;
  studyVerdictAttention.hidden = a == null;
  if (a == null) return;
  const pct = (n) => `${Math.round(n)}%`;
  const items = a.reinforceCount > 0 ? tn("statsView.attention.reinforce", a.reinforceCount) : "";
  studyVerdictAttentionText.textContent = a.reason === "DECLINING"
    ? `${t("statsView.attention.declining", { title: a.unitTitle, subject: a.subjectName, from: pct(a.olderAccuracy), to: pct(a.recentAccuracy) })}${items ? ` ${items}` : ""}`
    : (a.reinforceCount > 0
      ? tn("statsView.attention.has", a.reinforceCount, { title: a.unitTitle, subject: a.subjectName })
      : t("statsView.attention.hasItems", { title: a.unitTitle, subject: a.subjectName }));
  studyVerdictAttentionBtn.onclick = () => {
    pendingPlanFocusUnitId = a.unitId;
    showScreen("plan");
  };
}

// Indicators line: the same rows the table shows, so questions and subjects always reconcile.
function renderStatsHeader(summary, rows = [], reviewTasks = []) {
  metricElements.avgScore.textContent = formatAverageScore(summary.average);
  metricElements.avgScore.dataset.state = getState(summary.average, summary.totalQuestions);
  metricElements.totalQuestions.textContent = formatNumber(summary.totalQuestions);
  metricElements.totalCorrect.textContent = formatNumber(summary.totalCorrect);
  metricElements.subjects.textContent = formatNumber(summary.subjectCount);
  metricElements.subjectsWithData.textContent = formatNumber(summary.withEvidence);
  metricElements.averageQuestions.textContent = formatNumber(summary.totalQuestions);
  // "Em atenção" = disciplines the table itself colours critical or attention, with enough questions to judge (MIN_SAMPLE_QUESTIONS).
  metricElements.attention.textContent = formatNumber(rows.filter((r) => r.totalQuestions >= MIN_SAMPLE_QUESTIONS && (r.state === "CRITICAL" || r.state === "ATTENTION")).length);
  const done = reviewTasks.filter((task) => task.reviewDone).length;
  metricElements.reviewsDone.textContent = formatNumber(done);
  metricElements.reviewsPending.textContent = formatNumber(reviewTasks.length - done);
}

// Panorama + "Onde preciso melhorar" (V7.2 composition) over the same period rows the matrix shows.
let statsV5Rows = [];
function renderStatsTop() {
  const overview = document.querySelector("#stats-overview");
  const attention = document.querySelector("#stats-attention");
  if (overview) overview.innerHTML = renderOverview(statsV5Rows);
  if (attention) attention.innerHTML = renderAttention(statsV5Rows);
  const mini = document.querySelector("#stats-v5-left");
  if (mini) mini.innerHTML = renderMiniRanks(statsV5Rows);
}

function wireStatsTop() {
  const top = document.querySelector("#screen-stats");
  if (!top) return;
  top.addEventListener("click", (event) => {
    const button = event.target.closest("[data-v5]");
    if (!button || !top.contains(button)) return;
    switch (button.dataset.v5) {
      case "focus-subject": openSubjectContents(Number(button.dataset.id)); break;
      case "overview-prev": statsOverviewState.page -= 1; renderStatsTop(); break;
      case "overview-next": statsOverviewState.page += 1; renderStatsTop(); break;
      default: handleTableAction(button, { openUnit: (unitId) => openLessonInPlan(unitId) }); break;
    }
  });
  top.addEventListener("change", (event) => {
    if (event.target.id === "v5-ranking-order") {
      statsOverviewState.order = event.target.value === "worst" ? "worst" : "best";
      statsOverviewState.page = 1;
      renderStatsTop();
      return;
    }
    handleTableControl(event.target);
  });
  top.addEventListener("input", (event) => {
    if (event.target.matches("input[type=search]")) handleTableControl(event.target);
  });
  // Roving tabindex needs arrow keys, otherwise the two inactive tabs could never be reached from the keyboard.
  top.addEventListener("keydown", (event) => {
    const tab = event.target.closest('#screen-stats [role="tab"][data-v5="tab"]');
    if (!tab || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const tabs = [...tab.parentElement.querySelectorAll('[role="tab"]')];
    const index = tabs.indexOf(tab);
    const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    event.preventDefault();
    tabs[next].click();
    document.querySelector(`#${tabs[next].id}`)?.focus();
  });
}
wireStatsTop();
wireHistory();
document.querySelector("#evolution-mode")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-mode]");
  if (!button) return;
  evolutionMode = button.dataset.mode === "volume" ? "volume" : "accuracy";
  for (const b of document.querySelectorAll("#evolution-mode [data-mode]")) b.setAttribute("aria-pressed", String(b === button));
  Promise.all([DB.learningEvidence.getAll(), DB.learningUnits.getAll(), DB.subjects.getAll()])
    .then(([evidence, units, subjects]) => renderEvolutionSvg(evidence, units, subjects))
    .catch(console.error);
});

// Estatísticas can be refreshed by navigation, period changes and row activation at
// the same time. Only the newest async snapshot may publish DOM; otherwise an older
// response can detach the detail action while the student is clicking it.
let statsSubjectRenderSeq = 0;

export async function renderStatsBySubject() {
  if (!document.querySelector("#stats-body")) return;
  const renderId = ++statsSubjectRenderSeq;
  const today = getLocalDateValue();
  const [evidence, units, subjects, reviewTasks] = await Promise.all([
    DB.learningEvidence.getAll(),
    DB.learningUnits.getAll(),
    DB.subjects.getAll(),
    DB.reviewTasks.getAll(),
  ]);
  if (renderId !== statsSubjectRenderSeq) return;
  const periodValue = statsUnitFilterPeriod?.value ?? "";
  // "Is my study working?" compares periods over time, so it uses all valid history, not the period slice.
  const history = validEvidence(evidence);
  await renderStudyVerdict(Analytics.bySubject(history, units, subjects, today), Analytics.byUnit(history, units, subjects));
  let results = periodSubjectRows(evidence, units, subjects, { periodValue, today });
  renderStatsHeader(periodSummary(results), results, reviewTasks);
  statsV5Rows = results;
  renderStatsTop();
  setTableModel(buildTableModel({ subjectRows: results, evidence, units, subjects, periodValue, today }));
}

function selectSubjectForEvolution(subjectId) {
  if (evolutionFilterSubject) {
    evolutionFilterSubject.value = String(subjectId);
    syncSelect(evolutionFilterSubject);
    evolutionFilterSubject.dispatchEvent(new Event("change"));
  }
}

// One action for "open this discipline's contents": the evolution chart follows the discipline and the
// analysis table switches to Por conteúdo for it.
function openSubjectContents(subjectId) {
  selectSubjectForEvolution(subjectId);
  focusSubject(subjectId);
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
    const acc = totalQ > 0 ? formatPerformanceScore((totalC / totalQ) * 100) : null;

    const card = document.createElement("article");
    card.className = `subject-catalog-card${subj.isActive ? "" : " is-archived"}`;
    card.dataset.subjectId = String(subj.id);
    card.style.setProperty("--subject-color", `var(${colorVarForKey(subj.color ?? "DISC-BLUE")})`);

    const chipRow = document.createElement("div");
    chipRow.className = "subject-catalog-chip-row";

    const chip = document.createElement("span");
    chip.className = "subject-chip";
    chip.textContent = subj.name;
    chip.style.setProperty("--subject-color", `var(${colorVarForKey(subj.color ?? "DISC-BLUE")})`);

    const archiveLabel = document.createElement("span");
    archiveLabel.className = "subject-archive-label";
    archiveLabel.textContent = subj.isActive ? "" : t("subjects.card.archived");
    archiveLabel.hidden = subj.isActive;

    chipRow.append(chip, archiveLabel);

    const metaEl = document.createElement("div");
    metaEl.className = "subject-catalog-meta";
    const metaParts = [units.length === 1 ? t("subjects.card.lessons.one", { count: units.length }) : t("subjects.card.lessons.other", { count: units.length })];
    if (acc) metaParts.push(t("subjects.card.average", { accuracy: acc }));
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
    nameInput.setAttribute("aria-label", t("screens.subjects.form.name"));

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
    saveEditBtn.textContent = t("shell.action.save");

    const cancelEditBtn = document.createElement("button");
    cancelEditBtn.className = "small-button";
    cancelEditBtn.type = "button";
    cancelEditBtn.textContent = t("shell.action.cancel");

    const editActions = document.createElement("div");
    editActions.className = "form-actions";
    editActions.append(saveEditBtn, cancelEditBtn, editMessage);
    editForm.append(nameInput, colorPickerEl, editActions);

    saveEditBtn.addEventListener("click", async () => {
      const newName = nameInput.value.trim();
      const editNameErr = validateNamingField(newName, t("shell.field.subjectName"));
      if (editNameErr) { editMessage.textContent = editNameErr; nameInput.focus(); return; }
      try {
        await DB.subjects.update(subj.id, { name: newName, color: editColor });
        await renderDisciplinas();
        // refresh other screens that show chips
        if (document.querySelector('#screen-today:not([hidden])') || document.querySelector('#review-dashboard')) {
          renderToday().catch(console.error);
        }
        renderPlan().catch(console.error);
      } catch { editMessage.textContent = t("subjects.card.saveError"); }
    });
    cancelEditBtn.addEventListener("click", () => { editForm.hidden = true; });
    // Same keyboard contract as the other inline editors: Enter saves, Esc cancels (found by the native UI test: only the buttons worked).
    nameInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") { event.preventDefault(); saveEditBtn.click(); }
      else if (event.key === "Escape") { event.preventDefault(); cancelEditBtn.click(); }
    });

    // Action buttons
    const actions = document.createElement("div");
    actions.className = "subject-catalog-actions";

    const editBtn = document.createElement("button");
    editBtn.className = "small-button";
    editBtn.type = "button";
    editBtn.textContent = t("shell.action.edit");
    editBtn.addEventListener("click", () => {
      editForm.hidden = false;
      nameInput.focus();
    });

    const archiveBtn = document.createElement("button");
    archiveBtn.className = "small-button";
    archiveBtn.type = "button";
    archiveBtn.textContent = subj.isActive ? t("subjects.card.archive") : t("subjects.card.reactivate");
    archiveBtn.addEventListener("click", async () => {
      const msg = card.querySelector(".subject-catalog-delete-msg");
      try {
        await DB.subjects.update(subj.id, { isActive: !subj.isActive });
        await renderDisciplinas();
      } catch (error) {
        console.error("Falha ao arquivar/reativar disciplina.", error);
        if (msg) msg.textContent = t("subjects.card.archiveError");
      }
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "small-button is-danger";
    deleteBtn.type = "button";
    deleteBtn.textContent = t("shell.action.delete");
    deleteBtn.addEventListener("click", async () => {
      // AC-DISC-04: hard delete only when no learning_units
      if (units.length > 0) {
        const msg = card.querySelector(".subject-catalog-delete-msg");
        if (msg) msg.textContent = t("subjects.card.deleteBlocked");
        return;
      }
      const confirmed = await showConfirm(t("subjects.card.deleteConfirm", { name: subj.name }));
      if (!confirmed) return;
      const msg = card.querySelector(".subject-catalog-delete-msg");
      try {
        await DB.subjects.delete(subj.id);
        await renderDisciplinas();
      } catch (error) {
        console.error("Falha ao excluir disciplina.", error);
        if (msg) msg.textContent = t("subjects.card.deleteError");
      }
    });

    const deleteMsg = document.createElement("p");
    deleteMsg.className = "subject-catalog-delete-msg field-message";
    deleteMsg.setAttribute("role", "alert");

    actions.append(editBtn, archiveBtn, deleteBtn);
    card.append(chipRow, metaEl, editForm, actions, deleteMsg);
    subjectsCatalog.append(card);
  }
}

const SVG_NS = "http://www.w3.org/2000/svg";

function svgElement(name, attributes = {}) {
  const el = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) el.setAttribute(key, String(value));
  return el;
}

const shortDate = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

// General evolution of the CURRENT period and subject filter, from the same evidence as the header and
// table. X is proportional to calendar time; an interval without questions is not a point and breaks the
// line, so a silent stretch is never drawn as a steady trend.
let evolutionMode = "accuracy";
function renderEvolutionValues(points) {
  const body = document.querySelector("#evolution-values-body");
  if (!body) return;
  body.replaceChildren();
  for (const p of points) {
    const row = document.createElement("tr");
    for (const text of [`${shortDate(p.from)} – ${shortDate(p.to)}`, formatNumber(p.questions), formatNumber(p.correct), `${formatDecimal(p.accuracy)}%`]) {
      const cell = document.createElement("td");
      cell.textContent = text;
      row.append(cell);
    }
    body.append(row);
  }
}

function renderEvolutionSvg(evidence, units, subjects) {
  if (!evolutionSvg) return false;
  const today = getLocalDateValue();
  const periodValue = statsUnitFilterPeriod?.value ?? "";
  const filter = evolutionFilterSubject?.value ?? "";
  const rows = periodSubjectRows(evidence, units, subjects, { periodValue, today });
  const subjectIds = new Set(rows.filter((r) => !filter || String(r.subjectId) === filter).map((r) => r.subjectId));
  const series = evolutionSeries(evidence, units, { periodValue, today, subjectIds });
  chartEmpty.hidden = series.points.length > 0;
  // SVGElement has no `hidden` property (only the attribute), unlike the HTML elements around it.
  evolutionSvg.toggleAttribute("hidden", series.points.length === 0);
  if (evolutionCaption) evolutionCaption.hidden = series.points.length === 0;
  if (series.points.length === 0) {
    chartEmpty.textContent = t("screens.stats.evolution.empty");
    if (evolutionDescription) evolutionDescription.textContent = "";
    return false;
  }

  // V7.2 chart geometry (viewBox 610x245, plot x 46..570, y 28..190); points keep the real, date-proportional offsets of evolutionSeries.
  const W = 610, H = 245, padL = 46, padR = 40, padT = 28, padB = 55;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const volume = evolutionMode === "volume";
  const volumeRange = Math.max(10, Math.ceil(Math.max(...series.points.map((p) => p.questions)) / 10) * 10);
  const valueOf = (p) => (volume ? (100 * p.questions) / volumeRange : p.accuracy);
  const xOf = (offset) => padL + (series.spanDays > 1 ? (offset / (series.spanDays - 1)) * chartW : chartW / 2);
  const yOf = (pct) => padT + chartH * (1 - pct / 100);
  const axisText = (pct) => (volume ? formatNumber((volumeRange * pct) / 100) : `${pct}%`);

  evolutionSvg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  evolutionSvg.replaceChildren();
  const defs = svgElement("defs");
  const gradient = svgElement("linearGradient", { id: "v5-chart-fill", x1: 0, y1: 0, x2: 0, y2: 1 });
  gradient.append(svgElement("stop", { offset: "0%", "stop-color": "var(--sl-accent)", "stop-opacity": ".24" }), svgElement("stop", { offset: "100%", "stop-color": "var(--sl-accent)", "stop-opacity": ".01" }));
  defs.append(gradient);
  evolutionSvg.append(defs);

  for (const pct of [0, 50, 100]) {
    evolutionSvg.append(svgElement("line", { class: "v5-gridline", x1: padL, x2: W - padR, y1: yOf(pct), y2: yOf(pct) }));
    const label = svgElement("text", { class: "v5-axis", x: padL - 11, y: yOf(pct) + 5, "text-anchor": "end" });
    label.textContent = axisText(pct);
    evolutionSvg.append(label);
  }
  const last = series.spanDays - 1;
  [0, last / 2, last].forEach((offset) => {
    const label = svgElement("text", { class: "v5-axis v5-date-axis", x: xOf(offset), y: 222, "text-anchor": "middle" });
    label.textContent = shortDate(subtractDays(series.from, -Math.round(offset)));
    evolutionSvg.append(label);
  });

  // The axis runs to today; when the last question is older than one bucket, say so on the chart instead of leaving an unexplained blank.
  const lastPoint = series.points[series.points.length - 1];
  const gapStart = Math.round(lastPoint.offset) + series.bucketDays;
  if (gapStart < last) {
    const x0 = xOf(gapStart);
    evolutionSvg.append(svgElement("rect", { class: "evo-gap", x: x0, y: padT, width: W - padR - x0, height: chartH }));
    if (W - padR - x0 > 60) {
      const note = svgElement("text", { class: "v5-axis evo-gap-label", x: (x0 + W - padR) / 2, y: padT + chartH / 2, "text-anchor": "middle" });
      note.textContent = t("statsView.evolution.gap", { date: shortDate(lastPoint.to) });
      evolutionSvg.append(note);
    }
  }

  // Segments stay separate on purpose: a week without questions is a blank, never an interpolated line.
  for (const segment of series.segments) {
    if (segment.length < 2) continue;
    const coords = segment.map((p) => `${xOf(p.offset).toFixed(2)} ${yOf(valueOf(p)).toFixed(2)}`);
    evolutionSvg.append(svgElement("path", { class: "v5-chart-area", d: `M ${coords.join(" L ")} L ${xOf(segment.at(-1).offset).toFixed(2)} ${padT + chartH} L ${xOf(segment[0].offset).toFixed(2)} ${padT + chartH} Z` }));
    evolutionSvg.append(svgElement("path", { class: "v5-chart-line", d: `M ${coords.join(" L ")}` }));
  }
  for (const p of series.points) {
    const dot = svgElement("circle", { class: "v5-chart-point", cx: xOf(p.offset).toFixed(2), cy: yOf(valueOf(p)).toFixed(2), r: 3.5 });
    const title = svgElement("title");
    title.textContent = t("statsView.evolution.point", { from: shortDate(p.from), to: shortDate(p.to), percent: Math.round(p.accuracy), questions: tn("statsView.evidence.questions", p.questions, { count: formatNumber(p.questions) }) });
    dot.append(title);
    evolutionSvg.append(dot);
  }

  if (evolutionCaption) evolutionCaption.textContent = t("screens.stats.evolution.note", { count: series.points.length, days: series.bucketDays });
  renderEvolutionValues(series.points);
  if (evolutionDescription) {
    evolutionDescription.textContent = series.points
      .map((p) => t("statsView.evolution.point", { from: shortDate(p.from), to: shortDate(p.to), percent: Math.round(p.accuracy), questions: tn("statsView.evidence.questions", p.questions) }))
      .join("; ");
  }
  return true;
}

export async function renderSettings() {
  const settings = await DB.settings.get();
  // Language preference has real server authority only. Never present an inert selector in legacy local mode.
  if (generationLanguageCard) generationLanguageCard.hidden = !REMOTE_MODE;
  if (REMOTE_MODE && generationLanguageSelect) {
    generationLanguageSelect.value = settings?.generationLocale ?? settings?.effectiveGenerationLocale ?? DEFAULT_LOCALE;
    syncSelect(generationLanguageSelect);
  }
  const lastBackupAt = readLastBackupAt(AuthUI.getCurrentUser()?.id) ?? settings?.lastBackupAt ?? null;
  lastBackupLabel.textContent = lastBackupAt
    ? t("appBackup.last", { date: formatIntlDate(lastBackupAt, { dateStyle: "medium", timeStyle: "short" }) })
    : t("appBackup.none");

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
  // The whole "Apagar base local" card is offered only where it works (this device's own database); against the server it is not shown at all.
  if (resetCard) resetCard.hidden = REMOTE_MODE;
  if (REMOTE_MODE) {
    setResetMessage(t("appBackup.resetUnsupported"));
  }
  // T28: legacy-import migration only exists against the real server
  // (T25-T27) — no local-only equivalent, so it's REMOTE_MODE-only,
  // mirroring how import/reset are REMOTE_MODE-only in the opposite
  // direction above.
  if (migrationCard) migrationCard.hidden = !REMOTE_MODE;
  // The card's own sentence promises the removal; with the button gone only the reason below it stays.
  const resetBody = document.querySelector("#reset-body");
  if (resetBody) resetBody.hidden = REMOTE_MODE;
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
    // and was saved, so a failure here must never turn an already-successful
    // export into a reported failure. The date belongs to THIS device's file
    // export: it is kept client-side per account (the server settings contract
    // has no lastBackupAt field), and also in the legacy local database.
    const exportedAt = new Date().toISOString();
    writeLastBackupAt(AuthUI.getCurrentUser()?.id, exportedAt);
    if (!REMOTE_MODE) {
      try {
        await DB.settings.update({ lastBackupAt: exportedAt });
      } catch (metaError) {
        console.warn("Não foi possível registrar a data do último backup.", metaError);
      }
    }
    await renderSettings();
    backupMessage.textContent = t("appBackup.exported");
  } catch (error) {
    backupMessage.classList.add("is-error");
    backupMessage.textContent = t("appBackup.exportFailed");
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
      li.textContent = MigrationUI.warningText(warning);
      migrationWarnings.append(li);
    }
  }
  const hasConflicts = (preview.conflicts ?? []).length > 0;
  if (migrationConflicts) {
    migrationConflicts.replaceChildren();
    for (const conflict of preview.conflicts ?? []) {
      const li = document.createElement("li");
      li.textContent = t(conflict.reason === 'ARCHIVED_HOMONYM' ? "appBackup.conflict.archived" : "appBackup.conflict.exists", { name: conflict.name });
      migrationConflicts.append(li);
    }
  }
  if (migrationConfirmBtn) migrationConfirmBtn.disabled = hasConflicts;
  if (migrationPreviewPanel) migrationPreviewPanel.hidden = false;
  if (migrationResultPanel) migrationResultPanel.hidden = true;
  setMigrationMessage(t(hasConflicts ? "appBackup.preview.hasConflicts" : "appBackup.preview.review"));
}

migrationChooseFileButton?.addEventListener("click", () => {
  migrationFileInput?.click();
});

migrationFileInput?.addEventListener("change", async () => {
  const [file] = migrationFileInput.files ?? [];
  if (!file) return;
  resetMigrationPanels();
  setMigrationMessage(t("appBackup.reading"));
  try {
    const rawSource = JSON.parse(await readFileText(file));
    const result = await MigrationUI.previewImport(rawSource);
    if (!result.ok) {
      setMigrationMessage(result.message || t("appBackup.previewFailed"), true);
      return;
    }
    renderMigrationPreview(result.preview);
  } catch (error) {
    setMigrationMessage(
      t(error instanceof SyntaxError ? "appBackup.invalidJson" : "appBackup.unreadable"),
      true,
    );
    console.error("Falha ao gerar prévia de migração.", error);
  } finally {
    migrationFileInput.value = "";
  }
});

migrationCancelBtn?.addEventListener("click", () => {
  resetMigrationPanels();
  setMigrationMessage(t("appBackup.cancelled"));
});

migrationConfirmBtn?.addEventListener("click", async () => {
  if (!migrationActivePreview) return;
  const confirmed = await showConfirm(t("appBackup.confirmPrompt"));
  if (!confirmed) return;

  migrationConfirmBtn.disabled = true;
  setMigrationMessage(t("appBackup.committing"));
  try {
    const result = await MigrationUI.commitImportPreview(migrationActivePreview.id);
    if (!result.ok) {
      setMigrationMessage(result.message || t("appBackup.commitFailed"), true);
      migrationConfirmBtn.disabled = false; // still on the preview panel — must stay clickable to retry
      return;
    }
    migrationLastReport = MigrationUI.buildMigrationReport({ preview: migrationActivePreview, commit: result.commit });
    if (migrationPreviewPanel) migrationPreviewPanel.hidden = true;
    if (migrationResultPanel) migrationResultPanel.hidden = false;
    if (migrationResultSummary) {
      const parts = Object.entries(result.commit.counts ?? {})
        .map(([key, value]) => `${MigrationUI.entityLabel(key)}: ${value}`);
      migrationResultSummary.textContent = t(result.commit.kind === "LOGICAL_RESTORE" ? "appBackup.done.restore" : "appBackup.done.import", { parts: parts.join(", ") });
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
    setMigrationMessage(t("appBackup.commitFailed"), true);
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

// Where an AI-generated unit's Resumo Mestre came from: the presentation lives in source-details-ui.js; only the remote
// learning-units API (none in the offline store) is wired in here.
function appendSummarySources(container, unitId) {
  return appendSummarySourcesFrom(container, unitId, REMOTE_MODE ? DB.learningUnits : null);
}

configureMaterialsUI({
  listActiveSubjects: () => DB.subjects.getActive(),
  getLocalDateValue,
  startStudyNow,
  openSummary: openLessonInPlan,
  refreshAfterAccept: () => Promise.all([renderSubjects(), renderStudies(), renderToday()]),
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
let studyNowLastBlock = null;
// The INITIAL_PRACTICE evidence of the block just finished, kept until the server has it: the answers are already on the
// server (each judgment was accepted first), but the aggregate row that feeds Estatisticas is a separate request that can fail.
let evidenceRejectedByServer = false;
const pendingStudyEvidence = createStudyEvidenceQueue({
  getScope: () => REMOTE_MODE
    ? (AuthUI.getCurrentUser()?.id == null ? null : JSON.stringify([window.__SMARTLEARN_API_BASE__ || location.origin, AuthUI.getCurrentUser().id]))
    : "local",
  storage: {
    get length() { return localStorage.length; },
    key: (index) => localStorage.key(index),
    getItem: (key) => localStorage.getItem(key),
    setItem: (key, value) => localStorage.setItem(key, value),
    removeItem: (key) => localStorage.removeItem(key),
  },
  shouldPersist: (evidence) => evidence.context === "INITIAL_PRACTICE",
  // the server holds a different conclusion of that stage: this result can never be applied, so it leaves the queue and the student is told
  isRejected: (error) => error?.status === 409 && error?.code === "IDEMPOTENCY_CONFLICT",
  onRejected: (evidence, error) => {
    console.warn("Resultado de revisão não aplicado: o servidor já tem outra conclusão desta etapa.", { reviewTaskId: evidence.reviewTaskId, questionsCount: evidence.questionsCount, correctCount: evidence.correctCount }, error);
    evidenceRejectedByServer = true;
  },
  send: async (evidence) => {
    try {
      if (evidence.obligationUnitId != null) await apiRequest(`/v1/review-obligations/${evidence.obligationUnitId}/complete`, { method: "POST", body: { profile: "DECIDED", expectedReviewTaskId: evidence.reviewTaskId, questionsCount: evidence.questionsCount, correctCount: evidence.correctCount } });
      else if (evidence.reviewTaskId != null) await DB.completeReviewWithEvidence({ taskId: evidence.reviewTaskId, questionsCount: evidence.questionsCount, correctCount: evidence.correctCount });
      else await DB.learningEvidence.create(evidence);
    } catch (error) {
      if (error?.msgCode !== "ATTEMPT_IN_OTHER_EVIDENCE" && error?.code !== "ALREADY_COMPLETED") throw error;
    }
  },
});

// "initial" = the block the student just practiced (writes the aggregate
// INITIAL_PRACTICE evidence row, as before). "retest" = a redo of only the
// questions that block got wrong: each redo is a NEW server attempt (the
// original attempts stay untouched), but deliberately writes NO aggregate
// learning_evidence row -- a correct answer given right after reading the
// gabarito shows recovery, not performance, and must not inflate the
// unit's accuracy or volume in Estatisticas.
function newStudyNowState(mode, unitId, exercises) {
  return {
    mode,
    unitId,
    exercises,
    index: 0,
    attemptId: null,
    attemptIds: [],
    correctCount: 0,
    answeredCount: 0,
    wrongExercises: [],
    correctedExercises: [],
    judgedExercises: [],
    lastJudged: null,
  };
}

function resetStudyNowResult() {
  studyNowResultCard.hidden = true;
  studyNowResultTitle.textContent = t("appStudyNow.result");
  studyNowResultText.textContent = "";
  studyNowResultNote.hidden = true;
  studyNowResultNote.textContent = "";
  studyNowEvidenceNote.hidden = true;
  studyNowEvidenceNote.textContent = "";
  studyNowEvidenceRetryBtn.hidden = true;
  studyNowNextReviewText.textContent = "";
  studyNowErrorsSection.hidden = true;
  studyNowErrorsList.replaceChildren();
  studyNowCorrectedSection.hidden = true;
  studyNowCorrectedList.replaceChildren();
  studyNowFlagsSection.hidden = true;
  studyNowFlagsList.replaceChildren();
  studyNowQuestionFlagHost.hidden = true;
  studyNowQuestionFlagHost.replaceChildren();
  studyNowRetestBtn.hidden = true;
  studyNowPracticeCard.hidden = false;
}

const STUDY_PROVENANCE_KEY = {
  MANUAL: "appStudyNow.origin.manual",
  SOURCE: "appStudyNow.origin.source",
  AI_GENERATED: "appStudyNow.origin.ai",
};

// The summary contains the very answers being retrieved: while questions are on the screen it stays out of sight, and returns with the result.
// (Set to false to show it above the questions again, as before.)
const STUDY_NOW_HIDES_SUMMARY_WHILE_PRACTISING = true;

async function startStudyNow(unit, subjectName) {
  if (!unit) return;
  recordStudyEvidence().catch((error) => console.error("Falha ao reenviar evidência pendente.", error));
  studyNowSubjectEl.textContent = subjectName ?? "";
  studyNowTitleEl.textContent = unit.title ?? "";
  if (unit.summaryBody) {
    studyNowSummaryCard.hidden = STUDY_NOW_HIDES_SUMMARY_WHILE_PRACTISING;
    renderSummary(studyNowSummaryBody, unit.summaryBody);
    studyNowSummaryCard.querySelector(":scope > .summary-source")?.remove();
    appendSummarySources(studyNowSummaryCard, unit.id);
  } else {
    studyNowSummaryCard.hidden = true;
    studyNowSummaryBody.textContent = "";
  }
  resetStudyNowResult();
  studyNowState = newStudyNowState("initial", unit.id, []);
  // Nothing of a previous lesson's question (or an empty one) is shown while this lesson's questions are on their way.
  studyNowQuestionArea.hidden = true;
  studyNowResume.hidden = true;
  setStudyNowNotice("screens.studyNow.noExercises");
  studyNowNoExercises.hidden = true;
  showScreen("study-now", { focus: true });

  try {
    studyNowState.exercises = await DB.exercises.getAll(unit.id);
    await loadQuestionFlags();
  } catch (error) {
    // "Could not load" is not "this lesson has no exercises": say which one it is, and leave nothing to tap.
    console.error("Falha ao carregar exercícios da unidade.", error);
    studyNowState = null;
    setStudyNowNotice("appStudyNow.loadFailed");
    studyNowNoExercises.hidden = false;
    return;
  }
  // a lesson with no questions has nothing to hide the summary from: reading is all this screen can do for it
  if (studyNowState.exercises.length === 0 && unit.summaryBody) studyNowSummaryCard.hidden = false;
  const snapshot = readStudySnapshot(unit.id, studyNowState.exercises);
  if (snapshot) {
    // Interrupted earlier: offer to continue instead of silently repeating what was already answered.
    studyNowQuestionArea.hidden = true;
    studyNowNoExercises.hidden = true;
    studyNowProgress.textContent = "";
    studyNowResumeText.textContent = t(snapshot.correctCount === 1 ? "appStudyNow.resume.one" : "appStudyNow.resume.other", {
      answered: snapshot.answeredCount,
      total: snapshot.exerciseIds.length,
      correct: snapshot.correctCount,
    });
    studyNowResume.hidden = false;
    studyNowResumeSnapshot = snapshot;
    studyNowResume.querySelector("#study-now-resume-continue").focus();
    return;
  }
  studyNowResume.hidden = true;
  renderStudyNowQuestion();
  focusStudyNowQuestion();
}

/** The one notice of the study screen that stands in for the question: no exercises, or the exercises could not be loaded. */
function setStudyNowNotice(key) {
  studyNowNoExercises.dataset.i18n = key;
  studyNowNoExercises.textContent = t(key);
}

/** Keyboard/screen-reader users start on the first action of the question ("Ver resposta"), not on the page container. */
function focusStudyNowQuestion() {
  if (studyNowState && studyNowState.exercises.length > 0 && !studyNowQuestionArea.hidden) studyNowRevealBtn.focus();
}

// -- Estudar agora: resume an interrupted pass ----------------------------------------------------------------
// The minimal state of an "initial" pass is mirrored on the device after every judgment the server accepted, so
// closing/reloading the tab does not restart from question 1. Every access is guarded (storage may be blocked) and
// the snapshot is discarded when the pass ends, when the exercises changed, or after a week.
let studyNowResumeSnapshot = null;
const STUDY_SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const studySnapshotKey = (unitId) => `smartlearn.studynow.${unitId}`;

function persistStudySnapshot(state) {
  if (!state || state.mode !== "initial") return;
  try {
    if (state.index <= 0 || state.index >= state.exercises.length) { localStorage.removeItem(studySnapshotKey(state.unitId)); return; }
    localStorage.setItem(studySnapshotKey(state.unitId), JSON.stringify({
      savedAt: Date.now(),
      exerciseIds: state.exercises.map((e) => e.id),
      index: state.index,
      attemptIds: state.attemptIds,
      answeredCount: state.answeredCount,
      correctCount: state.correctCount,
      wrongIds: state.wrongExercises.map((e) => e.id),
      correctedIds: state.correctedExercises.map((e) => e.id),
    }));
  } catch { /* storage unavailable: the pass just cannot be resumed */ }
}

function clearStudySnapshot(unitId) {
  try { localStorage.removeItem(studySnapshotKey(unitId)); } catch { /* ignore */ }
}

function readStudySnapshot(unitId, exercises) {
  try {
    const raw = JSON.parse(localStorage.getItem(studySnapshotKey(unitId)) ?? "null");
    if (!raw || Date.now() - raw.savedAt > STUDY_SNAPSHOT_MAX_AGE_MS) return null;
    const same = Array.isArray(raw.exerciseIds) && raw.exerciseIds.length === exercises.length && raw.exerciseIds.every((id, i) => id === exercises[i].id);
    if (!same || !(raw.index > 0 && raw.index < exercises.length)) return null;
    return raw;
  } catch { return null; }
}

studyNowResume?.querySelector("#study-now-resume-continue")?.addEventListener("click", () => {
  const state = studyNowState;
  const snap = studyNowResumeSnapshot;
  if (!state || !snap) return;
  const byId = new Map(state.exercises.map((e) => [e.id, e]));
  state.index = snap.index;
  state.attemptIds = snap.attemptIds.slice();
  state.answeredCount = snap.answeredCount;
  state.correctCount = snap.correctCount;
  state.wrongExercises = snap.wrongIds.map((id) => byId.get(id)).filter(Boolean);
  state.correctedExercises = snap.correctedIds.map((id) => byId.get(id)).filter(Boolean);
  studyNowResume.hidden = true;
  studyNowResumeSnapshot = null;
  renderStudyNowQuestion();
  focusStudyNowQuestion(); // the button that was just pressed disappeared
});

studyNowResume?.querySelector("#study-now-resume-restart")?.addEventListener("click", () => {
  if (studyNowState) clearStudySnapshot(studyNowState.unitId);
  studyNowResume.hidden = true;
  studyNowResumeSnapshot = null;
  renderStudyNowQuestion();
  focusStudyNowQuestion(); // the button that was just pressed disappeared
});

function renderStudyNowQuestion() {
  if (studyNowResume) studyNowResume.hidden = true;
  const state = studyNowState;
  if (!state) return;
  if (studyNowMessage) studyNowMessage.textContent = "";

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
  studyNowQuestionFlagHost.replaceChildren();
  if (state.lastJudged) {
    studyNowQuestionFlagHost.append(
      createTextElement("p", "question-flag-previous", QUESTION_FLAG_TEXT.previous),
      createQuestionFlagControls(state.lastJudged.exercise, {
        flag: questionFlagsByExerciseId.get(state.lastJudged.exercise.id) ?? null,
        attemptId: state.lastJudged.attemptId,
        visible: true,
      }),
    );
    studyNowQuestionFlagHost.hidden = false;
  } else {
    studyNowQuestionFlagHost.hidden = true;
  }
  studyNowQuestionText.textContent = exercise.questionText;
  studyNowAnswerText.textContent = exercise.answerText;
  studyNowAnswerText.hidden = true;
  studyNowExplanationText.textContent = exercise.explanationText ? t("appStudyNow.why", { text: exercise.explanationText }) : "";
  studyNowExplanationText.hidden = true;
  studyNowSourceBox.replaceChildren(...citationDetails(exercise.citations));
  studyNowSourceBox.hidden = true;
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
  studyNowRevealBtn.textContent = t("appStudyNow.reveal");
  const progressKey = { retest: "appStudyNow.progress.retest", review: "appStudyNow.progress.review" }[state.mode] ?? "appStudyNow.progress.question";
  const titleKey = { retest: "appStudyNow.practiceTitle.retest", review: "appStudyNow.practiceTitle.review" }[state.mode] ?? "appStudyNow.practiceTitle";
  studyNowProgress.textContent = t(progressKey, { current: state.index + 1, total: state.exercises.length });
  studyNowProgress.style.setProperty("--p", String((state.index + 1) / state.exercises.length));
  studyNowProgressBar.style.width = `${((state.index + 1) / state.exercises.length) * 100}%`;
  studyNowPracticeTitle.textContent = t(titleKey);
  // The Resumo Mestre contains the very answers being retrieved: showing it
  // above a redo question would turn retrieval practice into reading.
  if (state.mode === "retest" || state.mode === "review") studyNowSummaryCard.hidden = true;
  state.attemptId = null;
  state.pendingReveal = null;
  delete studyNowQuestionArea.dataset.attemptId;
}

async function finishStudyNowSession() {
  const state = studyNowState;
  if (!state) return;
  const isRetest = state.mode === "retest";
  studyNowQuestionArea.hidden = true;
  studyNowProgress.textContent = "";

  const { unitId, answeredCount, correctCount, attemptIds } = state;
  const isReview = state.mode === "review";
  // A review that was partly judged inside its Hoje row counts those answers too: the review closes with the whole block.
  const totalAnswered = answeredCount + (isReview ? state.restored.answered : 0);
  const totalCorrect = correctCount + (isReview ? state.restored.correct : 0);
  if (answeredCount > 0 && !isRetest) {
    pendingStudyEvidence.enqueue(isReview
      ? { reviewTaskId: state.reviewTaskId, obligationUnitId: state.obligationUnitId ?? null, questionsCount: totalAnswered, correctCount: totalCorrect }
      : {
        unitId,
        context: "INITIAL_PRACTICE",
        questionsCount: answeredCount,
        correctCount,
        evidenceDate: getLocalDateValue(),
        attemptIds,
        // one key per block of practice: every resend of this pending evidence is the same intent (E-021 class)
        operationKey: crypto.randomUUID(),
      });
    await recordStudyEvidence();
  }

  if (isRetest) {
    studyNowResultTitle.textContent = t("appStudyNow.result.retest");
    studyNowResultText.textContent = t("appStudyNow.score.retest", { correct: correctCount, answered: answeredCount });
    studyNowResultNote.hidden = false;
    studyNowResultNote.textContent = t(state.wrongExercises.length === 0 ? "appStudyNow.note.allFixed" : "appStudyNow.note.someWrong");
  } else if (isReview) {
    const pct = totalAnswered > 0 ? formatDecimal((totalCorrect / totalAnswered) * 100) : formatDecimal(0);
    studyNowResultTitle.textContent = t("appStudyNow.result.review");
    studyNowResultText.textContent = t("appStudyNow.score.review", { correct: totalCorrect, answered: totalAnswered, percent: pct });
  } else {
    const pct = answeredCount > 0 ? formatDecimal((correctCount / answeredCount) * 100) : formatDecimal(0);
    studyNowResultTitle.textContent = t("appStudyNow.result");
    studyNowResultText.textContent = t("appStudyNow.score.initial", { correct: correctCount, answered: answeredCount, percent: pct });
  }

  try {
    const tasks = await DB.reviewTasks.getByUnit(unitId);
    const next = getNextReview(unitId, tasks);
    // An earliest pending review dated before today is overdue, not "next": say so instead of printing a past date as the next review (J04).
    const nextIsOverdue = next && next < getLocalDateValue();
    studyNowNextReviewText.textContent = next
      ? t(nextIsOverdue ? "appStudyNow.nextReview.overdue" : "appStudyNow.nextReview", { date: formatDate(next) })
      : t("appStudyNow.nextReview.none");
  } catch (error) {
    console.error("Falha ao buscar próxima revisão.", error);
    studyNowNextReviewText.textContent = "";
  }

  // The block never ends on a bare score: every wrong item is shown with
  // its gabarito (feedback is per BLOCK, never per question mid-session),
  // and the one obvious next action is redoing exactly those items. The
  // product is self-report (no typed answer exists), so what is shown is
  // "you marked wrong" + the correct answer -- never an invented reason.
  studyNowErrorsList.replaceChildren();
  if (state.wrongExercises.length > 0) {
    studyNowErrorsTitle.textContent = t(isRetest ? "appStudyNow.errors.retest" : "appStudyNow.errors.initial", { count: state.wrongExercises.length });
    for (const wrong of state.wrongExercises) studyNowErrorsList.append(createStudyErrorItem(wrong));
    studyNowErrorsSection.hidden = false;
    studyNowRetestBtn.hidden = false;
    studyNowRetestBtn.textContent = t(isRetest ? "appStudyNow.redo.retest" : "appStudyNow.redo.initial", { count: state.wrongExercises.length });
  } else {
    studyNowErrorsSection.hidden = true;
    studyNowRetestBtn.hidden = true;
  }

  studyNowCorrectedList.replaceChildren();
  if (isRetest && state.correctedExercises.length > 0) {
    studyNowCorrectedTitle.textContent = t("appStudyNow.corrected.title", { count: state.correctedExercises.length });
    for (const fixed of state.correctedExercises) {
      const li = document.createElement("li");
      li.className = "study-now-corrected-item";
      li.append(
        createTextElement("span", "study-now-chip is-corrected", t("appStudyNow.corrected.chip")),
        createTextElement("span", "study-now-corrected-question", fixed.questionText),
      );
      studyNowCorrectedList.append(li);
    }
    studyNowCorrectedSection.hidden = false;
  } else {
    studyNowCorrectedSection.hidden = true;
  }

  studyNowLastBlock = { unitId, wrong: state.wrongExercises.slice() };
  renderStudyNowFlagResults(state.judgedExercises);
  studyNowQuestionFlagHost.hidden = true;
  studyNowQuestionFlagHost.replaceChildren();
  studyNowSummaryCard.hidden = studyNowSummaryBody.textContent === "";
  studyNowPracticeCard.hidden = true;
  studyNowResultCard.hidden = false;
  studyNowResultTitle.focus();
  studyNowState = null;
  renderPlan().catch((error) => console.error("Falha ao atualizar plano.", error));
  renderToday().catch((error) => console.error("Falha ao atualizar Hoje.", error));
}

/** Sends the pending evidence; on failure tells the student and offers to send it again. An earlier try that did reach the server counts as recorded. */
async function recordStudyEvidence() {
  if (!pendingStudyEvidence.pendingCount()) return;
  evidenceRejectedByServer = false;
  try {
    await pendingStudyEvidence.flush();
  } catch (error) {
    if (pendingStudyEvidence.pendingCount()) {
      console.error("Falha ao registrar evidência de prática inicial.", error);
      studyNowEvidenceNote.classList.add("is-error");
      studyNowEvidenceNote.textContent = t("appStudyNow.evidenceFailed");
      studyNowEvidenceNote.hidden = false;
      studyNowEvidenceRetryBtn.hidden = false;
    }
    return;
  }
  if (pendingStudyEvidence.pendingCount()) return;
  if (evidenceRejectedByServer) {
    // not an error to retry: the result cannot be applied, and saying so is what keeps it from being dropped silently
    studyNowEvidenceRetryBtn.hidden = true;
    studyNowEvidenceNote.classList.remove("is-error");
    studyNowEvidenceNote.textContent = t("appStudyNow.evidenceRejected");
    studyNowEvidenceNote.hidden = false;
    renderPlan().catch((error) => console.error("Falha ao atualizar plano.", error));
    renderToday().catch((error) => console.error("Falha ao atualizar Hoje.", error));
    return;
  }
  const wasRetry = !studyNowEvidenceNote.hidden;
  studyNowEvidenceRetryBtn.hidden = true;
  studyNowEvidenceNote.classList.remove("is-error");
  studyNowEvidenceNote.textContent = wasRetry ? t("appStudyNow.evidenceSaved") : "";
  studyNowEvidenceNote.hidden = !wasRetry;
  if (wasRetry) {
    renderPlan().catch((error) => console.error("Falha ao atualizar plano.", error));
    renderToday().catch((error) => console.error("Falha ao atualizar Hoje.", error));
  }
}

studyNowEvidenceRetryBtn?.addEventListener("click", async () => {
  studyNowEvidenceRetryBtn.disabled = true;
  try { await recordStudyEvidence(); } finally { studyNowEvidenceRetryBtn.disabled = false; }
  (studyNowEvidenceRetryBtn.hidden ? studyNowDoneBtn : studyNowEvidenceRetryBtn).focus();
});

window.addEventListener("online", () => {
  recordStudyEvidence().catch((error) => console.error("Falha ao reenviar evidência pendente.", error));
});

function createStudyErrorItem(exercise) {
  const li = document.createElement("li");
  li.className = "study-now-error-item";
  li.append(
    createTextElement("p", "study-now-error-question", exercise.questionText),
    createTextElement("span", "study-now-chip", t("appStudyNow.error.markedWrong")),
  );
  const answer = document.createElement("div");
  answer.className = "study-now-error-answer-block";
  answer.append(
    createTextElement("p", "study-now-error-label", t("appStudyNow.error.correctAnswer")),
    createTextElement("p", "study-now-error-answer", exercise.answerText),
  );
  li.append(answer);
  if (exercise.explanationText) {
    li.append(createTextElement("p", "study-now-error-label", t("appStudyNow.whyLabel")), createTextElement("p", "study-now-error-why", exercise.explanationText));
  }
  if (exercise.hintText) li.append(createTextElement("p", "study-now-error-meta", t("appStudyNow.hint", { text: exercise.hintText })));
  const originKey = STUDY_PROVENANCE_KEY[exercise.provenance];
  if (originKey) li.append(createTextElement("p", "study-now-error-meta", t(originKey)));
  // The only explanation the product really holds: the exact source page the
  // question was drafted from (frozen at acceptance). Shown as evidence, not
  // paraphrased -- and absent (nothing invented) for manual exercises.
  li.append(...citationDetails(exercise.citations));
  return li;
}

function renderStudyNowFlagResults(items = []) {
  studyNowFlagsList.replaceChildren();
  studyNowFlagsSection.hidden = items.length === 0;
  for (const item of items) {
    const li = document.createElement("li");
    li.className = "study-now-flag-item";
    li.append(
      createTextElement("p", "study-now-flag-question", item.exercise.questionText),
      createTextElement("span", "study-now-chip", item.outcome === "CORRECT" ? t("screens.studyNow.correct") : t("screens.studyNow.incorrect")),
      createQuestionFlagControls(item.exercise, {
        flag: questionFlagsByExerciseId.get(item.exercise.id) ?? null,
        attemptId: item.attemptId,
        visible: true,
      }),
    );
    studyNowFlagsList.append(li);
  }
}

studyNowRetestBtn?.addEventListener("click", () => {
  const block = studyNowLastBlock;
  if (!block || block.wrong.length === 0) return;
  resetStudyNowResult();
  studyNowState = newStudyNowState("retest", block.unitId, block.wrong.slice());
  renderStudyNowQuestion();
  studyNowRevealBtn.focus();
});

studyNowDoneBtn?.addEventListener("click", () => showScreen("today", { focus: true }));

// ── Modo Prova (EXAM-1) ─────────────────────────────────────────────────────────────────────────
// The server returns ONLY the questions and the student's own answers while the exam is in progress;
// nothing here can show a gabarito, explanation, hint or score because none is ever received.
const examEls = {
  unit: document.querySelector("#exam-unit"),
  title: document.querySelector("#title-exam"),
  message: document.querySelector("#exam-message"),
  taking: document.querySelector("#exam-taking"),
  progress: document.querySelector("#exam-progress"),
  question: document.querySelector("#exam-question-text"),
  answer: document.querySelector("#exam-answer-input"),
  prev: document.querySelector("#exam-prev-btn"),
  next: document.querySelector("#exam-next-btn"),
  nav: document.querySelector("#exam-nav"),
  submit: document.querySelector("#exam-submit-btn"),
  confirm: document.querySelector("#exam-submit-confirm-btn"),
  cancel: document.querySelector("#exam-submit-cancel-btn"),
  warning: document.querySelector("#exam-submit-warning"),
  submitted: document.querySelector("#exam-submitted"),
  submittedTitle: document.querySelector("#exam-submitted-title"),
  submittedText: document.querySelector("#exam-submitted-text"),
  resultScore: document.querySelector("#exam-result-score"),
  counts: document.querySelector("#exam-counts"),
  reviewList: document.querySelector("#exam-review-list"),
  finalNote: document.querySelector("#exam-final-note"),
  finalize: document.querySelector("#exam-finalize-btn"),
  retest: document.querySelector("#exam-retest-btn"),
  today: document.querySelector("#exam-today-btn"),
  back: document.querySelector("#exam-back-btn"),
};
let examState = null; // { exam, index, dirty }

async function startSubjectExam(subject) {
  if (!subject) return;
  await openExam(() => DB.exams.startSubject(subject.id), { subjectName: subject.name, fallbackTitle: subject.name });
}

async function startExam(unit, subjectName) {
  if (!unit) return;
  await openExam(() => DB.exams.start(unit.id), { subjectName, fallbackTitle: unit.title });
}

async function openExam(begin, { subjectName, fallbackTitle }) {
  try {
    const { exam } = await begin();
    const title = exam.title ?? fallbackTitle ?? "";
    examState = { exam, index: 0, dirty: false, unitTitle: title, subjectName, unsaved: new Map() };
    restoreExamPending(examState);
    examEls.unit.textContent = t("appExam.eyebrow", { context: exam.scope === "SUBJECT" ? t("appExam.scope.subject") : (subjectName ?? ""), title }).replace(/^ · | · $/g, "");
    examEls.title.textContent = t("appExam.title");
    examEls.message.textContent = "";
    showScreen("exam", { focus: true });
    if (exam.status === "IN_PROGRESS") {
      examEls.submitted.hidden = true;
      examEls.taking.hidden = false;
      renderExamQuestion();
    } else {
      // already submitted and waiting for its correction: continue where the student stopped
      renderExamSubmitted();
    }
  } catch (error) {
    console.error("Falha ao iniciar a prova.", error);
    setPlanFormMessage?.(t("appExam.startFailed") + " " + (error?.message ?? ""), true);
  }
}

function currentExamItem() {
  return examState?.exam.items[examState.index] ?? null;
}

function renderExamQuestion() {
  if (!examState) return;
  const { exam, index } = examState;
  const item = exam.items[index];
  examEls.progress.textContent = t("appExam.progress", { current: index + 1, total: exam.items.length });
  examEls.question.textContent = item.question;
  examEls.answer.value = item.studentAnswer ?? "";
  examEls.prev.disabled = index === 0;
  examEls.next.disabled = index === exam.items.length - 1;
  examEls.nav.replaceChildren();
  exam.items.forEach((it, i) => {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = String(i + 1);
    b.dataset.index = String(i);
    b.setAttribute("aria-label", t(it.studentAnswer ? "appExam.goTo.answered" : "appExam.goTo", { n: i + 1 }));
    if (it.studentAnswer && it.studentAnswer.trim()) b.classList.add("is-answered");
    if (i === index) b.setAttribute("aria-current", "true");
    li.append(b);
    examEls.nav.append(li);
  });
  resetExamSubmitConfirm();
}

// Pending (unsaved) answers are mirrored in the browser so they survive closing/reloading the tab while the
// connection is down. Only what the student typed (never anything from the server); every access is guarded, so
// the exam works exactly as before when storage is unavailable.
const examPendingKey = (examId) => `smartlearn.exam.pending.${examId}`;

function persistExamPending() {
  if (!examState) return;
  try {
    const key = examPendingKey(examState.exam.id);
    if (examState.unsaved.size === 0) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(Object.fromEntries(examState.unsaved)));
  } catch { /* storage unavailable: memory-only, as before */ }
}

/** Merges pending answers typed in an earlier tab over what the server returned, and retries sending them. */
function restoreExamPending(state) {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(examPendingKey(state.exam.id)) ?? "null"); } catch { saved = null; }
  if (!saved || state.exam.status !== "IN_PROGRESS") return;
  for (const [itemId, text] of Object.entries(saved)) {
    const item = state.exam.items.find((it) => String(it.id) === itemId);
    if (!item || typeof text !== "string") continue;
    item.studentAnswer = text.trim() === "" ? null : text;
    state.unsaved.set(item.id, text);
  }
  if (state.unsaved.size > 0) {
    examEls.message.textContent = t("appExam.recovered");
    flushExamAnswers().then((ok) => { if (ok && examState === state) examEls.message.textContent = ""; });
  }
}

// An answer that failed to reach the server stays in `examState.unsaved` (itemId -> text) and is retried on the
// next save / navigation / submit: it is never dropped, and submitting is blocked until nothing is pending.
async function pushExamAnswer(itemId, text) {
  try {
    await DB.exams.saveAnswer(examState.exam.id, itemId, text);
    examState.unsaved.delete(itemId);
    persistExamPending();
    return true;
  } catch (error) {
    console.error("Falha ao guardar a resposta.", error);
    examState.unsaved.set(itemId, text);
    persistExamPending();
    examEls.message.textContent = t("appExam.saveFailed");
    return false;
  }
}

async function saveExamAnswer() {
  const item = currentExamItem();
  if (!examState || !item) return true;
  examState.unsaved ??= new Map();
  const typed = examEls.answer.value;
  if ((item.studentAnswer ?? "") !== typed) item.studentAnswer = typed.trim() === "" ? null : typed;
  else if (!examState.unsaved.has(item.id)) return true;
  const ok = await pushExamAnswer(item.id, typed);
  return ok;
}

/** Retries every answer still pending; true only when the server has them all. */
async function flushExamAnswers() {
  if (!examState?.unsaved) return true;
  for (const [itemId, text] of [...examState.unsaved]) await pushExamAnswer(itemId, text);
  return examState.unsaved.size === 0;
}

async function goToExamQuestion(index) {
  if (!examState || index < 0 || index >= examState.exam.items.length) return;
  await saveExamAnswer();
  examState.index = index;
  renderExamQuestion();
  examEls.answer.focus();
}

function resetExamSubmitConfirm() {
  examEls.submit.hidden = false;
  examEls.confirm.hidden = true;
  examEls.cancel.hidden = true;
  examEls.warning.hidden = true;
  examEls.warning.textContent = "";
}

examEls.answer?.addEventListener("blur", () => { saveExamAnswer(); });
// Typing is mirrored on the device as it happens (closing the tab before the box loses focus must not lose it);
// a successful save clears it again.
examEls.answer?.addEventListener("input", () => {
  const item = currentExamItem();
  if (!examState || !item) return;
  examState.unsaved ??= new Map();
  examState.unsaved.set(item.id, examEls.answer.value);
  persistExamPending();
});
examEls.prev?.addEventListener("click", () => goToExamQuestion(examState.index - 1));
examEls.next?.addEventListener("click", () => goToExamQuestion(examState.index + 1));
examEls.nav?.addEventListener("click", (event) => {
  const b = event.target.closest("button[data-index]");
  if (b) goToExamQuestion(Number(b.dataset.index));
});
examEls.submit?.addEventListener("click", async () => {
  await saveExamAnswer();
  if (!(await flushExamAnswers())) {
    const n = examState.unsaved.size;
    examEls.warning.hidden = false;
    examEls.warning.textContent = t(n === 1 ? "appExam.unsaved.one" : "appExam.unsaved.other", { count: n });
    return;
  }
  const unanswered = examState.exam.items.filter((it) => !it.studentAnswer || !it.studentAnswer.trim()).length;
  examEls.warning.hidden = false;
  examEls.warning.textContent = unanswered > 0
    ? t(unanswered === 1 ? "appExam.unanswered.one" : "appExam.unanswered.other", { count: unanswered })
    : t("appExam.submitWarning");
  examEls.submit.hidden = true;
  examEls.confirm.hidden = false;
  examEls.cancel.hidden = false;
  examEls.confirm.focus();
});
examEls.cancel?.addEventListener("click", () => { resetExamSubmitConfirm(); examEls.answer.focus(); });
examEls.confirm?.addEventListener("click", async () => {
  examEls.confirm.disabled = true;
  try {
    if (!(await flushExamAnswers())) {
      examEls.message.textContent = t("appExam.stillUnsaved");
      return;
    }
    const submitted = await DB.exams.submit(examState.exam.id);
    examState.exam = submitted;
    renderExamSubmitted();
  } catch (error) {
    console.error("Falha ao submeter a prova.", error);
    examEls.message.textContent = t("appExam.submitFailed");
  } finally {
    examEls.confirm.disabled = false;
  }
});
examEls.back?.addEventListener("click", () => { examState = null; showScreen("plan", { focus: true }); });

// After submitting: the correction. Everything the student needs to learn from the exam is here — their
// answer next to the gabarito, the WHY, the source — and only now. Right and wrong are judged by the
// student (open-response questions), item by item; the score exists once every item is judged.
function renderExamSubmitted({ focusHeading = true } = {}) {
  const { exam } = examState;
  examEls.taking.hidden = true;
  examEls.submitted.hidden = false;
  const answered = exam.items.filter((it) => it.studentAnswer && it.studentAnswer.trim()).length;
  const judged = exam.items.filter((it) => it.outcome).length;
  examEls.submittedText.textContent = t(judged < exam.items.length ? "appExam.submitted.pending" : "appExam.submitted.complete", { answered, total: exam.items.length, judged });

  if (exam.score) {
    const pct = formatDecimal(exam.score.percent);
    examEls.resultScore.textContent = t("appExam.score", { correct: exam.score.correct, total: exam.score.total, percent: pct });
    examEls.resultScore.hidden = false;
    examEls.counts.textContent = t("appExam.counts", { correct: exam.score.correct, wrong: exam.score.total - exam.score.correct });
    examEls.counts.hidden = false;
  } else {
    examEls.resultScore.hidden = true;
    examEls.counts.hidden = true;
  }

  examEls.reviewList.replaceChildren();
  const OUTCOME_LABEL = { CORRECT: t("appExam.outcome.correct"), INCORRECT: t("appExam.outcome.incorrect") };
  for (const it of exam.items) {
    const li = document.createElement("li");
    li.className = "exam-review-item";
    li.dataset.itemId = String(it.id);
    li.dataset.outcome = it.outcome ?? "";
    li.append(createTextElement("p", "exam-review-q", `${it.position + 1}. ${it.question}`));
    if (exam.scope === "SUBJECT" && it.unitTitle) li.append(createTextElement("p", "exam-review-unit", t("appExam.unit", { title: it.unitTitle })));
    li.append(createTextElement("span", "study-now-chip exam-review-chip", it.outcome ? OUTCOME_LABEL[it.outcome] : t("appExam.outcome.pending")));
    li.append(createTextElement("p", "exam-review-label", t("appExam.yourAnswer")));
    const mine = createTextElement("p", "exam-review-text exam-review-student", it.studentAnswer && it.studentAnswer.trim() ? it.studentAnswer : t("appExam.noAnswer"));
    if (!it.studentAnswer || !it.studentAnswer.trim()) mine.classList.add("is-empty");
    li.append(mine);
    li.append(createTextElement("p", "exam-review-label", t("appExam.correctAnswer")), createTextElement("p", "exam-review-text exam-review-correct", it.answer ?? ""));
    if (it.explanation) li.append(createTextElement("p", "exam-review-label", t("appExam.why")), createTextElement("p", "exam-review-text exam-review-why", it.explanation));
    const sources = (it.citations ?? []).filter((c) => c.pageText);
    if (sources.length > 0) {
      li.append(createSourceDetails(
        t(sources.length > 1 ? "appExam.citation.other" : "appExam.citation.one", { source: sources[0].sourceName, pages: formatPageList(sources.map((c) => c.pageIndex)) }),
        sources.map((c) => ({ pageIndex: c.pageIndex, text: c.pageText })),
      ));
    }
    const judge = document.createElement("div");
    judge.className = "exam-judge";
    for (const [outcome, label, cls] of [["CORRECT", t("appExam.judge.correct"), "exam-correct-btn"], ["INCORRECT", t("appExam.judge.incorrect"), "exam-wrong-btn"]]) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `secondary-button ${cls}`;
      b.dataset.action = "exam-judge";
      b.dataset.itemId = String(it.id);
      b.dataset.outcome = outcome;
      b.setAttribute("aria-pressed", String(it.outcome === outcome));
      // "Acertei" x N tells a screen reader nothing: name the question each button refers to
      b.setAttribute("aria-label", t("appExam.judge.aria", { label, n: it.position + 1 }));
      b.textContent = label;
      judge.append(b);
    }
    li.append(judge);
    examEls.reviewList.append(li);
  }
  // Closing the loop: once every item is judged the student registers the result (one evidence row); after
  // that the result is FINAL and leads on — the wrong items go straight into the existing redo flow.
  const corrected = exam.status === "CORRECTED";
  const allJudged = judged === exam.items.length;
  examEls.finalize.hidden = corrected || !allJudged;
  for (const b of examEls.reviewList.querySelectorAll('[data-action="exam-judge"]')) b.disabled = corrected;
  for (const j of examEls.reviewList.querySelectorAll(".exam-judge")) j.hidden = corrected;
  const wrong = exam.items.filter((it) => it.outcome === "INCORRECT");
  examEls.retest.hidden = !corrected || wrong.length === 0;
  examEls.retest.textContent = t("appExam.redo", { count: wrong.length });
  examEls.finalNote.hidden = !corrected;
  examEls.finalNote.textContent = corrected
    ? [
      exam.scope === "SUBJECT"
        ? t("appExam.final.byUnit", { correct: exam.score.correct, total: exam.score.total, units: (exam.evidenceIds ?? []).length })
        : t("appExam.final", { correct: exam.score.correct, total: exam.score.total }),
      wrong.length > 0 ? t("appExam.final.reinforce") : "",
    ].filter(Boolean).join(" ")
    : "";
  if (focusHeading) examEls.submittedTitle.focus();
}

examEls.finalize?.addEventListener("click", async () => {
  if (!examState) return;
  examEls.finalize.disabled = true;
  try {
    examState.exam = await DB.exams.finalize(examState.exam.id, getLocalDateValue());
    renderExamSubmitted({ focusHeading: false });
    (examEls.retest.hidden ? examEls.back : examEls.retest).focus();
    // the result is now part of the history: refresh what reads it
    renderPlan().catch((error) => console.error("Falha ao atualizar plano.", error));
    renderToday().catch((error) => console.error("Falha ao atualizar Hoje.", error));
  } catch (error) {
    console.error("Falha ao concluir a correção.", error);
    examEls.message.textContent = t("appExam.finalizeFailed");
  } finally {
    examEls.finalize.disabled = false;
  }
});

examEls.retest?.addEventListener("click", async () => {
  if (!examState) return;
  const wrongIds = new Set(examState.exam.items.filter((it) => it.outcome === "INCORRECT").map((it) => it.exerciseId));
  try {
    // a discipline exam's wrong items live in several units: load each unit that has one
    const unitIds = [...new Set(examState.exam.items.filter((it) => it.outcome === "INCORRECT").map((it) => it.unitId ?? examState.exam.unitId))];
    const all = (await Promise.all(unitIds.map((id) => DB.exercises.getAll(id)))).flat();
    const wrong = all.filter((e) => wrongIds.has(e.id));
    if (wrong.length === 0) return;
    startRetestBlock({
      returnReviewId: null,
      unitId: unitIds[0] ?? examState.exam.unitId,
      subjectName: examState.subjectName ?? "",
      unitTitle: examState.unitTitle ?? examState.exam.unitTitle ?? "",
      exercises: wrong,
    });
  } catch (error) {
    console.error("Falha ao abrir o reteste dos erros da prova.", error);
    examEls.message.textContent = t("appExam.retestFailed");
  }
});

examEls.today?.addEventListener("click", () => { examState = null; showScreen("today", { focus: true }); });

examEls.reviewList?.addEventListener("click", async (event) => {
  const b = event.target.closest('[data-action="exam-judge"]');
  if (!b || !examState) return;
  const itemId = Number(b.dataset.itemId);
  const outcome = b.dataset.outcome;
  b.disabled = true;
  try {
    examState.exam = await DB.exams.judge(examState.exam.id, itemId, outcome);
    renderExamSubmitted({ focusHeading: false });
    examEls.reviewList.querySelector(`[data-action="exam-judge"][data-item-id="${itemId}"][data-outcome="${outcome}"]`)?.focus();
  } catch (error) {
    console.error("Falha ao registrar a correção.", error);
    examEls.message.textContent = t("appExam.judgeFailed");
    b.disabled = false;
  }
});

// Entry used by a Hoje review block: same retest engine as "Estudar agora",
// just started from the wrong items of the block the student already judged.
function startRetestBlock({ returnReviewId, unitId, subjectName, unitTitle, exercises }) {
  pendingTodayReturnReviewId = returnReviewId;
  resetStudyNowResult();
  studyNowSubjectEl.textContent = subjectName;
  studyNowTitleEl.textContent = unitTitle;
  studyNowState = newStudyNowState("retest", unitId, exercises.slice());
  showScreen("study-now", { focus: true });
  renderStudyNowQuestion();
  studyNowRevealBtn.focus();
}

/**
 * "Revisar uma por vez": the unanswered questions of a Hoje review, one at a time in the study screen. Each answer is accepted by the
 * server (as an attempt of that review) before the next one; the review closes with the whole block, answers already given inside the
 * row included. The row itself is untouched, so nothing is lost if the student goes back.
 */
async function startFocusedReview(reviewId, { obligationUnitId = null } = {}) {
  const row = reviewDashboard.querySelector(`.review-row[data-review-id="${reviewId}"]`);
  const section = row?.querySelector("[data-exercises-total]");
  if (!row || !section) return false;
  const unsent = REMOTE_MODE && DB.attempts ? await flushPendingAttempts(section) : 0;
  const answeredIds = new Set([...section.querySelectorAll('.review-exercise-item[data-exercise-answered="true"]')].map((el) => Number(el.dataset.exerciseId)));
  const pending = (reviewBlockExercises.get(section) ?? []).filter((exercise) => !answeredIds.has(exercise.id));
  if (pending.length === 0) return false;
  pendingTodayReturnReviewId = Number(reviewId);
  resetStudyNowResult();
  studyNowSubjectEl.textContent = row.querySelector(".subject-chip")?.textContent ?? "";
  studyNowTitleEl.textContent = row.querySelector(".review-content")?.textContent ?? "";
  studyNowSummaryCard.hidden = true;
  studyNowSummaryBody.textContent = "";
  studyNowState = newStudyNowState("review", Number(row.dataset.unitId), pending);
  studyNowState.reviewTaskId = Number(reviewId);
  studyNowState.obligationUnitId = obligationUnitId; // set when the experimental panel started it: the stage is then concluded through the experimental route
  studyNowState.restored = { answered: Number(section.dataset.exercisesAnswered), correct: Number(section.dataset.exercisesCorrect) };
  // What was already marked wrong inside the row belongs to the same block: it is listed with its answer and can be redone with the rest.
  const wrongInRow = new Set([...section.querySelectorAll('.review-exercise-item.is-wrong:not([data-retest="CORRECT"])')].map((el) => Number(el.dataset.exerciseId)));
  studyNowState.wrongExercises = (reviewBlockExercises.get(section) ?? []).filter((exercise) => wrongInRow.has(exercise.id));
  showScreen("study-now", { focus: true });
  renderStudyNowQuestion();
  studyNowRevealBtn.focus();
  if (unsent > 0) studyNowMessage.textContent = t(unsent === 1 ? "appReview.unsentRetest.one" : "appReview.unsentRetest.other", { count: unsent });
  return true;
}

/** The experimental panel's "Fazer a revisão" on a unit with questions: opens the practice of the stage it requires. False = nothing to open. */
async function practiceObligation(unit) {
  try { return await startFocusedReview(unit.required.id, { obligationUnitId: unit.unitId }); }
  catch (error) { console.error("Falha ao abrir a revisão.", error); return false; }
}

// "Adiar vencidas" (HG-09): confirm (how many, to when, how many per day), then the store moves the overdue reviews to future days. They stay
// pending: nothing is completed, no evidence is created. Failing leaves every date as it was.
postponeBtn?.addEventListener("click", async () => {
  if (!postponeContext || postponeContext.tasks.length === 0) return;
  const { tasks, today } = postponeContext;
  const perDay = await askPostpone({ tasks, today, formatDay: (day) => formatDate(day) });
  if (perDay === null) { postponeBtn.focus(); return; }
  postponeBtn.disabled = true;
  try {
    const result = await DB.reviewTasks.postponeOverdue(today, { perDay });
    setReviewMessage();
    await renderToday();
    setReviewMessage(result.postponed === 0 ? t("today.postpone.none") : tn("today.postpone.done", result.postponed));
    if (todayPrimaryAction && !todayPrimaryAction.hidden) todayPrimaryActionBtn.focus({ preventScroll: true });
  } catch (error) {
    setReviewMessage(t("today.postpone.failed"), true);
    console.error("Falha ao adiar as revisões vencidas.", error);
    postponeBtn.focus();
  } finally {
    postponeBtn.disabled = false;
  }
});

todayFocusReviewBtn?.addEventListener("click", () => {
  const reviewId = todayFocusReviewBtn.dataset.reviewId;
  if (reviewId) startFocusedReview(reviewId).catch((error) => console.error("Falha ao abrir a revisão.", error));
});

studyNowRevealBtn?.addEventListener("click", async () => {
  const state = studyNowState;
  if (!state || state.index >= state.exercises.length) return;
  const exercise = state.exercises[state.index];

  studyNowAnswerText.hidden = false;
  studyNowExplanationText.hidden = !studyNowExplanationText.textContent;
  studyNowSourceBox.hidden = studyNowSourceBox.children.length === 0;
  studyNowJudgment.hidden = false;
  studyNowRevealBtn.hidden = true;
  // The focused button just disappeared: keep keyboard users in the flow.
  studyNowCorrectBtn.focus();

  if (REMOTE_MODE && DB.attempts) {
    // Kept on the state so a judgment tapped right away waits for it (see judgeStudyNow): an attempt that is already SUBMITTED
    // refuses the reveal, and the ledger would then say the solution was seen with no help.
    state.pendingReveal = recordStudyNowReveal(state, exercise);
    await state.pendingReveal;
  }
});

/**
 * Start options for one question of one study-now session. The key is per (session, question): the reveal and a later
 * judgment fallback share it, so a start the server already received but whose reply was lost is not created twice.
 * A new session (e.g. the redo of the wrong answers) gets new keys, so a genuine retest is still a new attempt.
 */
function studyNowStartOptions(state, exerciseId) {
  state.startKeys ??= new Map();
  if (!state.startKeys.has(exerciseId)) state.startKeys.set(exerciseId, crypto.randomUUID());
  return { operationKey: state.startKeys.get(exerciseId), ...(state.mode === "review" ? { reviewTaskId: state.reviewTaskId } : {}) };
}

/** Starts the server attempt for this question and records the hint and the reveal on it. Never rejects: failures are logged. */
async function recordStudyNowReveal(state, exercise) {
  try {
    // No reviewTaskId: this is INITIAL_PRACTICE, never a scheduled review.
    const attempt = await DB.attempts.start(exercise.id, studyNowStartOptions(state, exercise.id));
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

async function judgeStudyNow(isCorrect) {
  const state = studyNowState;
  if (!state || state.index >= state.exercises.length) return;

  if (state.judging) return; // a double tap must not judge the same question twice
  const tapped = isCorrect ? "CORRECT" : "INCORRECT";
  let adoptedOutcome = null; // set when the server already held an earlier tap (see the submit below)
  // The server hears the judgment FIRST. If it cannot be registered (dropped connection) the student stays on
  // this question with the same buttons and a plain message: nothing advances or is counted that the server
  // does not have, so the result, the evidence and "para reforçar" always agree.
  if (REMOTE_MODE && DB.attempts) {
    state.judging = true;
    // Visible while the server is answering (slow connection): both buttons look off, so the student can see the tap was
    // taken and does not tap the other one believing it would replace it (state.judging ignores it anyway). aria-disabled,
    // not disabled: a disabled button drops keyboard focus and leaves the screen with nothing focusable.
    studyNowCorrectBtn.setAttribute("aria-disabled", "true");
    studyNowIncorrectBtn.setAttribute("aria-disabled", "true");
    studyNowJudgment.setAttribute("aria-busy", "true");
    studyNowMessage.textContent = t("appStudyNow.saving");
    try {
      // The reveal of this question may still be on its way to the server: judge only after it, never before.
      await state.pendingReveal;
      if (!state.attemptId) {
        // Revealing could not start the attempt (connection dropped then): start it now. Never judge without one,
        // or the screen would show progress the server does not have.
        const started = await DB.attempts.start(state.exercises[state.index].id, studyNowStartOptions(state, state.exercises[state.index].id));
        state.attemptId = started.id;
        studyNowQuestionArea.dataset.attemptId = String(started.id);
        try { await DB.attempts.revealSolution(started.id); } catch (error) { console.error("Falha ao registrar a revelação (prática inicial).", error); }
      }
      let outcome = isCorrect ? "CORRECT" : "INCORRECT";
      try {
        await DB.attempts.submit(state.attemptId, { outcome, assessmentMethod: "SELF_REPORT" });
      } catch (error) {
        // The reply to an earlier tap was lost AFTER the server had recorded it: the attempt is already SUBMITTED
        // with what that tap said. That outcome stands (an attempt is never rewritten); adopt it instead of leaving
        // the student stuck on a question the server already holds.
        const earlier = state.unconfirmed;
        if (error?.code === "ALREADY_SUBMITTED" && earlier && earlier.attemptId === state.attemptId) {
          adoptedOutcome = earlier.outcome;
          outcome = earlier.outcome;
        } else {
          state.unconfirmed = { attemptId: state.attemptId, outcome }; // unknown whether the server received it
          throw error;
        }
      }
      state.unconfirmed = null;
      isCorrect = outcome === "CORRECT";
      // Collected only after a successful submit — an attempt that never reached SUBMITTED must never be handed
      // to learningEvidence.create's attemptIds (the server rejects any id that isn't already SUBMITTED).
      state.attemptIds.push(Number(state.attemptId));
    } catch (error) {
      console.error("Falha ao registrar resultado (prática inicial).", error);
      studyNowMessage.textContent = t("appStudyNow.judgeFailed");
      return;
    } finally {
      state.judging = false;
      studyNowCorrectBtn.removeAttribute("aria-disabled");
      studyNowIncorrectBtn.removeAttribute("aria-disabled");
      studyNowJudgment.removeAttribute("aria-busy");
    }
  }
  studyNowMessage.textContent = "";

  const judgedExercise = state.exercises[state.index];
  const judgedItem = { exercise: judgedExercise, attemptId: state.attemptId, outcome: isCorrect ? "CORRECT" : "INCORRECT" };
  state.judgedExercises.push(judgedItem);
  state.lastJudged = judgedItem;
  state.answeredCount += 1;
  if (isCorrect) {
    state.correctCount += 1;
    state.correctedExercises.push(state.exercises[state.index]);
  } else {
    // Slice 2 (SMARTLEARN_PRODUCT_FIRST_V1): keep the exact question/answer
    // this session already has in memory — no new fetch, no new quiz
    // mechanism, just remembering what was already shown so the result
    // screen can offer "Revisar meus erros" instead of ending on a bare score.
    state.wrongExercises.push(state.exercises[state.index]);
  }

  state.index += 1;
  persistStudySnapshot(state);
  renderStudyNowQuestion();
  if (state.index < state.exercises.length) studyNowRevealBtn.focus();
  if (adoptedOutcome && adoptedOutcome !== tapped) {
    studyNowMessage.textContent = t(adoptedOutcome === "CORRECT" ? "appStudyNow.adopted.correct" : "appStudyNow.adopted.incorrect");
  }
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
    backupMessage.textContent = t("appBackup.imported");
    showScreen("today", { focus: true });
  } catch (error) {
    backupMessage.classList.add("is-error");
    backupMessage.textContent = t(error instanceof SyntaxError ? "appBackup.invalidJson" : "appBackup.invalidBackup");
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
  registerSubjectForm.reset();
  registerSubjectForm.hide();
  setSubjectMessage();
  setSubjectManagerMessage();
  setStudyManagerMessage();
  studyMessage.classList.remove("is-error");
  studyMessage.textContent = "";
}

async function openPendingRegisterUnit() {
  const unitId = pendingRegisterFocusUnitId;
  pendingRegisterFocusUnitId = null;
  if (unitId == null) return;
  const row = studyList.querySelector(`.study-row[data-study-id="${unitId}"]`);
  const toggle = row?.querySelector('[data-action="toggle-exercises"]');
  if (!row || !toggle) return;
  toggle.click();
  row.scrollIntoView({ block: "start" });
  toggle.focus({ preventScroll: true });
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
      sourceLabel.textContent = t("appRegister.field.source");
      const sourceInput = document.createElement("input");
      sourceInput.type = "text";
      sourceInput.className = "study-edit-source";
      sourceInput.dataset.studyField = "sourceText";
      sourceInput.value = record.sourceText ?? "";
      sourceInput.maxLength = 200;
      sourceLabel.append(sourceInput);

      const dateLabel = document.createElement("label");
      dateLabel.textContent = t("appRegister.field.date");
      const dateInput = document.createElement("input");
      dateInput.type = "date";
      dateInput.className = "study-edit-date";
      dateInput.dataset.studyField = "studyDate";
      dateInput.value = record.studyDate;
      dateInput.dataset.original = record.studyDate;
      dateLabel.append(dateInput);

      const contentLabel = document.createElement("label");
      contentLabel.textContent = t("appRegister.field.content");
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
      saveButton.textContent = t("appRegister.save");

      const cancelButton = document.createElement("button");
      cancelButton.className = "small-button";
      cancelButton.type = "button";
      cancelButton.dataset.action = "cancel-study";
      cancelButton.textContent = t("appRegister.cancel");

      actions.append(saveButton, cancelButton);
    } else {
      info.append(createTextElement("p", "study-title", subject?.name ?? t("appRegister.noSubject")));

      const meta = document.createElement("div");
      meta.className = "study-meta";
      meta.append(
        createTextElement("span", "study-source-tag", record.sourceText || ""),
        createTextElement("span", "study-date-tag", formatDate(record.studyDate)),
      );
      info.append(meta);
      info.append(createTextElement("p", "study-content", record.title || t("appRegister.contentUnavailable")));

      const editButton = document.createElement("button");
      editButton.className = "small-button";
      editButton.type = "button";
      editButton.dataset.action = "edit-study";
      editButton.textContent = t("appRegister.edit");
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
    qLabel.textContent = t("appRegister.exercise.question");
    const qInput = document.createElement("textarea");
    qInput.rows = 2;
    qInput.className = "exercise-question-input";
    qInput.placeholder = t("appRegister.exercise.questionPlaceholder");
    qLabel.append(qInput);

    const aLabel = document.createElement("label");
    aLabel.textContent = t("appRegister.exercise.answer");
    const aInput = document.createElement("textarea");
    aInput.rows = 2;
    aInput.className = "exercise-answer-input";
    aInput.placeholder = t("appRegister.exercise.answerPlaceholder");
    aLabel.append(aInput);

    const hLabel = document.createElement("label");
    hLabel.textContent = t("appRegister.exercise.hint");
    const hInput = document.createElement("input");
    hInput.type = "text";
    hInput.className = "exercise-hint-input";
    hInput.placeholder = t("appRegister.exercise.hint");
    hLabel.append(hInput);

    // "Por quê" only where the store can keep it (the server); the local store has no such column.
    let wLabel = null;
    if (REMOTE_MODE) {
      wLabel = document.createElement("label");
      wLabel.textContent = t("appRegister.exercise.why");
      const wInput = document.createElement("textarea");
      wInput.rows = 2;
      wInput.className = "exercise-why-input";
      wInput.placeholder = t("appRegister.exercise.whyPlaceholder");
      wLabel.append(wInput);
    }

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "small-button is-primary";
    addBtn.dataset.action = "add-exercise";
    addBtn.dataset.studyId = String(record.id);
    addBtn.textContent = t("appRegister.exercise.add");

    const exerciseFormMsg = createTextElement("p", "field-message exercise-form-message", "");
    exerciseFormMsg.setAttribute("role", "status");

    exerciseAddForm.append(qLabel, aLabel, hLabel, ...(wLabel ? [wLabel] : []), addBtn, exerciseFormMsg);
    exercisesSection.append(exerciseList, exerciseAddForm);

    const toggleExercisesBtn = document.createElement("button");
    toggleExercisesBtn.type = "button";
    toggleExercisesBtn.className = "small-button";
    toggleExercisesBtn.dataset.action = "toggle-exercises";
    toggleExercisesBtn.dataset.studyId = String(record.id);
    toggleExercisesBtn.textContent = t("appRegister.exercise.toggle");

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
    const hEl = exercise.hintText ? createTextElement("p", "exercise-hint", t("appStudyNow.hint", { text: exercise.hintText })) : null;
    const wEl = exercise.explanationText ? createTextElement("p", "exercise-why", t("appStudyNow.why", { text: exercise.explanationText })) : null;
    // the raw values travel with the elements: the inline editor must not parse them back out of the translated sentence
    if (hEl) hEl.dataset.text = exercise.hintText;
    if (wEl) wEl.dataset.text = exercise.explanationText;

    const itemActions = document.createElement("div");
    itemActions.className = "exercise-item-actions";

    const editExBtn = document.createElement("button");
    editExBtn.type = "button";
    editExBtn.className = "small-button";
    editExBtn.dataset.action = "edit-exercise";
    editExBtn.dataset.exerciseId = String(exercise.id);
    editExBtn.dataset.studyId = String(unitId);
    editExBtn.textContent = t("appRegister.edit");

    const delExBtn = document.createElement("button");
    delExBtn.type = "button";
    delExBtn.className = "small-button is-danger";
    delExBtn.dataset.action = "delete-exercise";
    delExBtn.dataset.exerciseId = String(exercise.id);
    delExBtn.dataset.studyId = String(unitId);
    delExBtn.textContent = t("appRegister.remove");

    itemActions.append(editExBtn, delExBtn);
    item.append(qEl, aEl, ...[hEl, wEl].filter(Boolean), itemActions);
    list.append(item);
  }
}

// One idempotency key per LOGICAL creation (E-021 class): a retry of the same form content after a lost reply reuses the key
// and the server returns the row it already made; changed content is a new creation and gets a new key. Cleared on success.
const pendingCreateKeys = new WeakMap();
function createKeyFor(host, signature) {
  if (!host) return crypto.randomUUID();
  let entry = pendingCreateKeys.get(host);
  if (!entry || entry.signature !== signature) {
    entry = { signature, key: crypto.randomUUID() };
    pendingCreateKeys.set(host, entry);
  }
  return entry.key;
}

// The "add exercise" form under a study: validates the question, creates the exercise, clears the form and reports the outcome
// in the form's own message line. `section` is the study's exercises section; `button` is the form's Add button.
async function addExerciseFromForm(section, studyId, button) {
  const qInput = section?.querySelector(".exercise-question-input");
  const aInput = section?.querySelector(".exercise-answer-input");
  const hInput = section?.querySelector(".exercise-hint-input");
  const wInput = section?.querySelector(".exercise-why-input");
  const msgEl = section?.querySelector(".exercise-form-message");
  const questionText = qInput?.value.trim() ?? "";
  if (!questionText) {
    if (msgEl) { msgEl.classList.add("is-error"); msgEl.textContent = t("appRegister.exercise.questionRequired"); }
    qInput?.focus();
    return;
  }
  button.disabled = true;
  try {
    const fields = {
      questionText,
      answerText: aInput?.value.trim() ?? "",
      hintText: hInput?.value.trim() || null,
      ...(wInput ? { explanationText: wInput.value.trim() || null } : {}),
      provenance: 'MANUAL',
    };
    await DB.exercises.create(studyId, { ...fields, operationKey: createKeyFor(section, JSON.stringify([studyId, fields])) });
    pendingCreateKeys.delete(section);
    if (qInput) qInput.value = "";
    if (aInput) aInput.value = "";
    if (hInput) hInput.value = "";
    if (wInput) wInput.value = "";
    if (msgEl) { msgEl.classList.remove("is-error"); msgEl.textContent = t("appRegister.exercise.added"); }
    await renderExerciseList(studyId);
  } catch (error) {
    if (msgEl) { msgEl.classList.add("is-error"); msgEl.textContent = t("appRegister.exercise.saveFailed"); }
    console.error("Falha ao salvar exercício.", error);
  } finally {
    button.disabled = false;
  }
}

// The inline editor that replaces an exercise row; its Save / Cancel buttons are handled by the study-list click dispatcher.
function createExerciseEditForm({ exerciseId, studyId, question, answer, hint, why }) {
  const form = document.createElement("div");
  form.className = "exercise-item exercise-item-edit";

  const questionInput = document.createElement("textarea");
  questionInput.rows = 2; questionInput.value = question; questionInput.className = "exercise-question-input";
  const answerInput = document.createElement("textarea");
  answerInput.rows = 2; answerInput.value = answer; answerInput.className = "exercise-answer-input";
  const hintInput = document.createElement("input");
  hintInput.type = "text"; hintInput.value = hint; hintInput.placeholder = t("appRegister.exercise.hint"); hintInput.className = "exercise-hint-input";
  let whyInput = null;
  if (REMOTE_MODE) {
    whyInput = document.createElement("textarea");
    whyInput.rows = 2; whyInput.value = why; whyInput.placeholder = t("appRegister.exercise.why"); whyInput.className = "exercise-why-input";
    whyInput.setAttribute("aria-label", t("appRegister.exercise.why"));
  }

  const saveButton = document.createElement("button");
  saveButton.type = "button"; saveButton.className = "small-button is-primary";
  saveButton.dataset.action = "save-exercise-edit";
  saveButton.dataset.exerciseId = String(exerciseId);
  saveButton.dataset.studyId = String(studyId);
  saveButton.textContent = t("appRegister.save");

  const cancelButton = document.createElement("button");
  cancelButton.type = "button"; cancelButton.className = "small-button";
  cancelButton.dataset.action = "cancel-exercise-edit";
  cancelButton.dataset.studyId = String(studyId);
  cancelButton.textContent = t("appRegister.cancel");

  form.append(questionInput, answerInput, hintInput, ...(whyInput ? [whyInput] : []), saveButton, cancelButton);
  return { form, questionInput };
}

// Saves the exercise open in the inline editor built by createExerciseEditForm: validates the question, updates the exercise and
// re-renders the list; on failure the editor stays open with its own error line. `button` is the editor's Save button.
async function saveExerciseEdit(button, studyId) {
  const exerciseId = Number(button.dataset.exerciseId);
  if (!exerciseId) return;
  const item = button.closest(".exercise-item-edit");
  const eq = item?.querySelector(".exercise-question-input");
  const ea = item?.querySelector(".exercise-answer-input");
  const eh = item?.querySelector(".exercise-hint-input");
  const ew = item?.querySelector(".exercise-why-input");
  const questionText = eq?.value.trim() ?? "";
  if (!questionText) { eq?.focus(); return; }
  button.disabled = true;
  try {
    await DB.exercises.update(exerciseId, {
      questionText,
      answerText: ea?.value.trim() ?? "",
      hintText: eh?.value.trim() || null,
      ...(ew ? { explanationText: ew.value.trim() || null } : {}),
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
    if (errMsg) errMsg.textContent = t("appRegister.exercise.editSaveFailed");
  }
}

async function renderSubjects(selectedId = subjectSelect.value) {
  const [activeSubjects, allSubjects] = await Promise.all([
    DB.subjects.getActive(),
    DB.subjects.getAll(),
  ]);
  subjectSelect.replaceChildren(new Option(t("screens.form.select"), ""));

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
  syncSelect(subjectSelect);

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
      input.setAttribute("aria-label", t("appRegister.subject.newNameLabel"));
      input.setAttribute("autocomplete", "off");

      const error = document.createElement("span");
      error.className = "inline-edit-error";
      error.setAttribute("aria-live", "polite");

      info.append(input, error);

      const saveBtn = document.createElement("button");
      saveBtn.className = "small-button is-primary";
      saveBtn.type = "button";
      saveBtn.dataset.action = "save-subject";
      saveBtn.textContent = t("appRegister.save");

      const cancelBtn = document.createElement("button");
      cancelBtn.className = "small-button";
      cancelBtn.type = "button";
      cancelBtn.dataset.action = "cancel-subject";
      cancelBtn.textContent = t("appRegister.cancel");

      actions.append(saveBtn, cancelBtn);
    } else {
      // Modo visualização
      info.append(createTextElement("p", "subject-name", subject.name));
      info.append(createTextElement("span", "subject-status", t(subject.isActive ? "appRegister.subject.active" : "appRegister.subject.inactive")));

      const editButton = document.createElement("button");
      editButton.className = "small-button";
      editButton.type = "button";
      editButton.dataset.action = "edit-subject";
      editButton.dataset.subjectName = subject.name;
      editButton.textContent = t("appRegister.edit");

      const toggleButton = document.createElement("button");
      toggleButton.className = "small-button";
      toggleButton.type = "button";
      toggleButton.dataset.action = subject.isActive ? "deactivate-subject" : "activate-subject";
      toggleButton.textContent = t(subject.isActive ? "appRegister.subject.deactivate" : "appRegister.subject.activate");

      const deleteButton = document.createElement("button");
      deleteButton.className = "small-button is-danger";
      deleteButton.type = "button";
      deleteButton.dataset.action = "delete-subject";
      deleteButton.dataset.subjectName = subject.name;
      deleteButton.textContent = t("appRegister.subject.delete");

      actions.append(editButton, toggleButton, deleteButton);
    }

    row.append(info, actions);
    subjectList.append(row);
  }
}

function isKnownScreen(screenId) {
  return screenPanels.some((panel) => panel.dataset.screenPanel === screenId);
}

const DATA_SCREENS = new Set(["today", "stats", "plan", "settings", "materials", "study-now", "exam"]);

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

/** The disciplines of the student live in a panel of Plano: opening it draws the catalog, closing it only hides it. */
function setSubjectsPanel(open) {
  if (!planSubjectsPanel || !planManageSubjectsBtn) return;
  planSubjectsPanel.hidden = !open;
  planManageSubjectsBtn.setAttribute("aria-expanded", String(open));
  if (open) {
    // one panel at a time: both open stacked pushed the lesson list ~1,300 px down
    if (planNewUnitForm && !planNewUnitForm.hidden) setPlanFormVisible(false);
    renderDisciplinas().catch((error) => console.error("Falha ao carregar disciplinas.", error));
    planSubjectsPanel.scrollIntoView({ block: "nearest" });
  }
}

planManageSubjectsBtn?.addEventListener("click", () => setSubjectsPanel(planSubjectsPanel?.hidden !== false));

/**
 * Runs the render of a data screen and tells the student when it could not load (it used to reach only the console, leaving an
 * empty or stale screen with no way forward). The panel is aria-busy while it loads; the message offers to try again.
 */
function runScreenRender(screenId, render) {
  const panel = document.querySelector(`#screen-${screenId}`);
  const clear = () => panel?.querySelector(":scope > .screen-load-error")?.remove();
  clear();
  panel?.setAttribute("aria-busy", "true");
  return Promise.resolve()
    .then(render)
    .then(clear)
    .catch((error) => {
      console.error("Falha ao carregar a tela.", screenId, error);
      clear();
      if (!panel) return;
      const box = document.createElement("div");
      box.className = "screen-load-error";
      box.setAttribute("role", "alert");
      const retry = createTextElement("button", "small-button", t("shell.retry"));
      retry.type = "button";
      retry.addEventListener("click", () => runScreenRender(screenId, render));
      box.append(createTextElement("p", "", t("shell.loadFailed")), retry);
      panel.querySelector(":scope > .screen-heading")?.after(box);
    })
    .finally(() => panel?.removeAttribute("aria-busy"));
}

function clearTransientMessages(panel) {
  for (const el of panel.querySelectorAll(".form-message:not(.is-error):not([hidden]), .field-message:not(.is-error):not([hidden])")) {
    el.textContent = "";
  }
}

// Phone only: Configurações and Conta live behind "Mais" so the bottom bar keeps four large targets. On desktop the
// group is an ordinary part of the sidebar and the toggle is hidden, so none of this state is ever set there.
function closeMobileMore({ restoreFocus = false } = {}) {
  const wasOpen = Boolean(mobileMoreMenu?.classList.contains("is-open"));
  mobileMoreMenu?.classList.remove("is-open");
  mobileMoreToggle?.classList.remove("is-open");
  mobileMoreToggle?.setAttribute("aria-expanded", "false");
  if (restoreFocus && wasOpen) mobileMoreToggle?.focus();
}

export function showScreen(screenId, { focus = false } = {}) {
  closeMobileMore();
  if (screenId === "tracking") screenId = "plan"; // Acompanhar was folded into Plano: an old link or bookmark lands there
  const wantsSubjectsPanel = screenId === "subjects"; // so was Disciplinas, as the "Gerenciar disciplinas" panel of Plano
  if (wantsSubjectsPanel) screenId = "plan";
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
  // (Revisado a pedido do dono: Materiais fica visível e mostra um aviso; a biblioteca continua só com autoridade local.)

  // The study and exam screens only exist while their in-memory session does. After a reload (or a stale link) there is
  // nothing to show: an empty card with a "Ver resposta" that does nothing is worse than starting over from Plano, where
  // an interrupted "Estudar agora" offers to continue and a started exam is reopened from where it stopped.
  if ((nextScreen === "study-now" && !studyNowState && studyNowResultCard.hidden) || (nextScreen === "exam" && !examState)) {
    nextScreen = "plan";
  }

  // A redo's "return to the block" intent only lives until the student is
  // back on Hoje; wandering elsewhere drops it instead of surprising them later.
  if (nextScreen !== "today" && nextScreen !== "study-now") pendingTodayReturnReviewId = null;

  let leftStudyResultUnsent = false;
  for (const panel of screenPanels) {
    const leaving = !panel.hidden && panel.dataset.screenPanel !== nextScreen;
    panel.hidden = panel.dataset.screenPanel !== nextScreen;
    // A passing status ("saved", "copied", "nothing to show") belongs to the moment it was said: it must not greet the student
    // again when they come back. Errors stay until the student acts, and hidden notes keep their own lifecycle.
    if (leaving) clearTransientMessages(panel);
    if (leaving && panel.dataset.screenPanel === "study-now" && pendingStudyEvidence.pendingCount()) leftStudyResultUnsent = true;
  }
  // The "send again" control lives only on the result screen: a result left unsent (H-T04) is sent once more on the way out, not dropped.
  if (leftStudyResultUnsent) recordStudyEvidence().catch((error) => console.error("Falha ao registrar o resultado ao sair.", error));

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
  const moreIsCurrent = Boolean(mobileMoreMenu?.querySelector(`[data-screen="${nextScreen}"]`));
  mobileMoreToggle?.classList.toggle("is-active", moreIsCurrent);
  mobileMoreToggle?.setAttribute("aria-current", moreIsCurrent ? "page" : "false");

  if (window.location.hash !== `#${nextScreen}`) {
    window.history.replaceState(null, "", `#${nextScreen}`);
  }

  if (focus) {
    mainContent?.focus({ preventScroll: true });
  }

  if (nextScreen === "today" && databaseAvailable) {
    runScreenRender("today", renderToday);
  }

  if (nextScreen === "stats" && databaseAvailable) {
    runScreenRender("stats", renderStats);
  }
  if (nextScreen === "plan" && databaseAvailable) {
    // Never leave an interactive stale Plano on screen while its authoritative refresh
    // is in flight. A fast click on an old row could otherwise expand stale closures
    // just before the fresh render replaced that row (CI EXAM-4 regression).
    planList?.replaceChildren();
    runScreenRender("plan", renderPlan);
  }
  if (nextScreen === "plan" && wantsSubjectsPanel) setSubjectsPanel(true);
  if (nextScreen === "settings" && databaseAvailable) {
    runScreenRender("settings", renderSettings);
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
    renderStudies()
      .then(openPendingRegisterUnit)
      .catch((error) => console.error("Falha ao carregar estudos.", error));
  }
  if (nextScreen === "account") {
    renderAccount().catch((error) => console.error("Falha ao carregar conta.", error));
  }
}

let currentThemePreference = getStoredThemePreference();
let quickToggleMemory = readQuickToggleMemory();

function renderThemePicker(preference = currentThemePreference) {
  if (!themePicker) return;

  themePicker.replaceChildren();

  const groups = [
    { key: "system", options: THEME_OPTIONS.filter((option) => option.mode === "auto") },
    { key: "light", options: THEME_OPTIONS.filter((option) => option.mode === "light") },
    { key: "dark", options: THEME_OPTIONS.filter((option) => option.mode === "dark") },
  ];
  // Markup copied from the V7.2 package (renderSettings): .sl-theme-group > h3.sl-theme-heading + .sl-theme-grid > button.sl-theme-option
  // (span.sl-theme-swatch painted by --swatch-*, strong name, small description). "Sistema" previews the palette the system resolves to.
  themePicker.classList.add("sl-theme-library");
  const paletteOf = (id) => THEME_VARIABLES[id === "auto" ? (prefersDarkScheme.matches ? "night" : "paper") : id]?.tokens ?? {};

  for (const group of groups) {
    if (!group.options.length) continue;
    const section = document.createElement("section");
    section.className = "sl-theme-group";
    const headingId = `sl-theme-heading-${group.key}`;
    section.setAttribute("aria-labelledby", headingId);
    const heading = document.createElement("h3");
    heading.id = headingId;
    heading.className = "sl-theme-heading";
    heading.textContent = t(`theme.group.${group.key}`);
    const grid = document.createElement("div");
    grid.className = "sl-theme-grid";
    for (const option of group.options) {
      const tokens = paletteOf(option.id);
      const card = document.createElement("button");
      card.type = "button";
      card.className = "sl-theme-option";
      card.dataset.value = option.id;
      card.setAttribute("aria-pressed", "false");
      const swatch = document.createElement("span");
      swatch.className = "sl-theme-swatch";
      swatch.setAttribute("aria-hidden", "true");
      for (const [name, token] of [["--swatch-bg", "--color-bg"], ["--swatch-paper", "--color-surface"], ["--swatch-ink", "--color-text"], ["--swatch-accent", "--color-primary"], ["--swatch-soft", "--color-primary-soft"]]) swatch.style.setProperty(name, tokens[token]);
      const name = document.createElement("strong");
      name.textContent = option.label;
      const description = document.createElement("small");
      description.textContent = option.description;
      card.append(swatch, name, description);
      grid.append(card);
    }
    section.append(heading, grid);
    themePicker.append(section);
  }

  const preview = document.createElement("div");
  preview.className = "theme-live-preview";
  preview.setAttribute("role", "status");
  preview.setAttribute("aria-live", "polite");
  const previewLabel = document.createElement("span");
  previewLabel.className = "theme-live-label";
  preview.append(previewLabel);
  themePicker.append(preview);

  syncThemePicker(preference);
}

// Destaca o tema ativo na tela de Configurações.
function syncThemePicker(preference) {
  if (!themePicker) return;
  const option = THEME_OPTIONS.find((item) => item.id === preference) ?? THEME_OPTIONS.find((item) => item.id === "auto");
  for (const card of themePicker.querySelectorAll(".sl-theme-option")) card.setAttribute("aria-pressed", String(card.dataset.value === option?.id));
  const previewLabel = themePicker.querySelector(".theme-live-label");
  if (previewLabel && option) previewLabel.textContent = `${t("theme.preview")} · ${option.label}`;
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
  // Antes: passava um booleano onde resolveThemePreference espera "dark"/"light" (com "Sistema" escuro o 1º clique não mudava nada)
  // e sempre caía em Papel/Noite, apagando a escolha do usuário. Agora vira o modo e lembra a escolha de cada modo.
  const { target, memory } = quickToggleTarget(currentThemePreference, prefersDarkScheme.matches ? "dark" : "light", quickToggleMemory);
  quickToggleMemory = memory;
  writeQuickToggleMemory(memory);
  setThemePreference(target);
});

themePicker?.addEventListener("click", (event) => {
  const card = event.target instanceof Element ? event.target.closest(".sl-theme-option") : null;
  if (card instanceof HTMLElement && card.dataset.value) setThemePreference(card.dataset.value);
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

mobileMoreToggle?.addEventListener("click", () => {
  const open = !mobileMoreMenu.classList.contains("is-open");
  mobileMoreMenu.classList.toggle("is-open", open);
  mobileMoreToggle.classList.toggle("is-open", open);
  mobileMoreToggle.setAttribute("aria-expanded", String(open));
  if (open) mobileMoreMenu.querySelector(".nav-item:not([hidden])")?.focus();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && mobileMoreMenu?.classList.contains("is-open")) {
    event.preventDefault();
    closeMobileMore({ restoreFocus: true });
  }
});
function closeMobileMoreOnOutside(event) {
  if (!mobileMoreMenu?.classList.contains("is-open")) return;
  if (!mobileMoreMenu.contains(event.target) && !mobileMoreToggle?.contains(event.target)) closeMobileMore();
}
document.addEventListener("pointerdown", closeMobileMoreOnOutside);
document.addEventListener("focusin", closeMobileMoreOnOutside);
window.matchMedia("(max-width: 47.99rem)").addEventListener("change", () => closeMobileMore());

window.addEventListener("hashchange", () => {
  showScreen(window.location.hash.slice(1));
});

let pendingSubjectCreate = null;

// Cadastro's door to the one registration of a discipline. The save of a study waits for `pendingSubjectCreate` (see saving a study).
async function createSubjectFromRegister(name, color) {
  // AC-05: preserve draft values before re-render
  const draftDate = studyDateInput.value;
  const draftContent = studyContentInput.value;
  const draftSummary = studySummaryTextarea.value;
  const draftSource = studySourceTextInput ? studySourceTextInput.value : "";

  pendingSubjectCreate = (async () => {
    const subject = await DB.subjects.create(name, color);
    await renderSubjects(subject.id);
  })();
  await pendingSubjectCreate;

  // AC-05: restore draft values after re-render, but never over what the user typed while the request was in flight
  if (!studyDateInput.value) studyDateInput.value = draftDate;
  if (!studyContentInput.value) studyContentInput.value = draftContent;
  if (!studySummaryTextarea.value) studySummaryTextarea.value = draftSummary;
  if (studySourceTextInput && !studySourceTextInput.value) studySourceTextInput.value = draftSource;
}

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
      if (errorEl) errorEl.textContent = t("appRegister.subject.nameRequired");
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
        errorEl.textContent = t(isDuplicate ? "appRegister.subject.exists" : "appRegister.subject.renameFailed");
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
      const confirmed = await showConfirm(t("appRegister.subject.deleteConfirm", { name: currentName }));
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
    setSubjectManagerMessage(t(isDuplicate ? "appRegister.subject.exists" : "appRegister.subject.changeFailed"));
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
    await addExerciseFromForm(row.querySelector(`[data-exercises-for="${studyId}"]`), studyId, button);
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
    const { form, questionInput } = createExerciseEditForm({
      exerciseId,
      studyId,
      question: item.querySelector(".exercise-question")?.textContent ?? "",
      answer: item.querySelector(".exercise-answer")?.textContent ?? "",
      hint: item.querySelector(".exercise-hint")?.dataset.text ?? "",
      why: item.querySelector(".exercise-why")?.dataset.text ?? "",
    });
    item.replaceWith(form);
    questionInput.focus();
    return;
  }

  if (action === "save-exercise-edit") {
    await saveExerciseEdit(button, studyId);
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
      if (errorEl) errorEl.textContent = t("appRegister.study.required");
      if (!studyDate) dateInput?.focus();
      else contentInput?.focus();
      return;
    }

    try {
      // The date goes along only when the student changed it: the server refuses any studyDate (correcting it would have to
      // reproject the pending reviews), so sending an unchanged one made every edit fail in server mode.
      const changes = { sourceText, title: content };
      if (studyDate !== dateInput.dataset.original) changes.studyDate = studyDate;
      await DB.learningUnits.update(studyId, changes);
      activeStudyEditId = null;
      setStudyManagerMessage();
      await Promise.all([renderStudies(), renderToday(), renderStats()]);
    } catch (error) {
      if (errorEl) errorEl.textContent = t("appRegister.study.saveFailed");
      console.error("Falha ao salvar estudo.", error);
    }
  }
});

todayPrimaryActionBtn?.addEventListener("click", () => {
  const reviewId = todayPrimaryActionBtn.dataset.reviewId;
  if (!reviewId) return;
  const row = reviewDashboard.querySelector(`.review-row[data-review-id="${reviewId}"]`);
  if (!row) return;
  revealFolded(row);
  // The review may sit inside a collapsed per-unit card on Vencidas.
  const unitCard = row.closest("details.overdue-unit");
  if (unitCard) unitCard.open = true;
  const body = row.querySelector(".review-row-body");
  const toggle = row.querySelector('[data-action="toggle-row"]');
  if (body && body.hidden) {
    body.hidden = false;
    row.classList.add("is-open");
    toggle?.setAttribute("aria-expanded", "true");
    if (toggle) toggle.textContent = t("shell.action.collapse");
  }
  row.scrollIntoView({ behavior: "smooth", block: "start" });
  row.classList.add("is-highlighted");
  setTimeout(() => row.classList.remove("is-highlighted"), 2000);
});

reviewDashboard.addEventListener("click", (event) => {
  const button = event.target.closest('[data-action="toggle-row"]');
  if (!button) return;
  const row = button.closest(".review-row");
  const body = row?.querySelector(".review-row-body");
  if (!body) return;
  const expanded = body.hidden;
  body.hidden = !expanded;
  row.classList.toggle("is-open", expanded);
  button.setAttribute("aria-expanded", String(expanded));
  button.textContent = t(expanded ? "shell.action.collapse" : "today.review.open");
});

// "Ver aula": the lesson in Plano (the same shortcut Estatísticas uses); it opens nothing when the lesson is gone.
reviewDashboard.addEventListener("click", async (event) => {
  const button = event.target.closest('[data-action="open-lesson"]');
  if (!button) return;
  await openLessonInPlan(button.dataset.unitId);
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
    if (msgEl) { msgEl.classList.add("is-error"); msgEl.textContent = t("appReview.external.questionsRequired"); }
    qInput?.focus();
    return;
  }
  if (correctCount > questionsCount) {
    if (msgEl) { msgEl.classList.add("is-error"); msgEl.textContent = t("appReview.external.overflow"); }
    aInput?.focus();
    return;
  }
  button.disabled = true;
  try {
    const today = getLocalDateValue();
    await DB.learningEvidence.create({
      operationKey: createKeyFor(row, JSON.stringify([unitId, today, questionsCount, correctCount])),
      unitId,
      evidenceDate: today,
      context: "EXTERNAL",
      questionsCount,
      correctCount,
    });
    if (row) pendingCreateKeys.delete(row);
    if (qInput) qInput.value = "";
    if (aInput) aInput.value = "";
    if (msgEl) {
      msgEl.classList.remove("is-error");
      const pct = formatDecimal((correctCount / questionsCount) * 100);
      msgEl.textContent = t("appReview.external.recorded", { questions: questionsCount, correct: correctCount, percent: pct });
    }
  } catch (error) {
    if (msgEl) { msgEl.classList.add("is-error"); msgEl.textContent = t("appReview.external.failed"); }
    console.error("Falha ao registrar exercícios externos.", error);
  } finally {
    button.disabled = false;
    button.focus({ preventScroll: true }); // a disabled button drops keyboard focus
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
const attemptStartsInFlight = new WeakMap();
function ensureAttemptStarted(exItem) {
  if (!REMOTE_MODE || !DB.attempts || !exItem) return Promise.resolve(null);
  if (exItem.dataset.attemptId) return Promise.resolve(exItem.dataset.attemptId);
  // Two taps before the first reply share one start; the key also makes a retry after a lost reply return the same attempt.
  if (!attemptStartsInFlight.has(exItem)) {
    const pending = startAttemptForItem(exItem).finally(() => attemptStartsInFlight.delete(exItem));
    attemptStartsInFlight.set(exItem, pending);
  }
  return attemptStartsInFlight.get(exItem);
}

async function startAttemptForItem(exItem) {
  const exerciseId = Number(exItem.dataset.exerciseId);
  if (!Number.isInteger(exerciseId)) return null;
  const reviewTaskId = Number(exItem.dataset.reviewTaskId);
  exItem.dataset.attemptKey ||= crypto.randomUUID();
  try {
    const attempt = await DB.attempts.start(exerciseId, { reviewTaskId: Number.isInteger(reviewTaskId) ? reviewTaskId : null, operationKey: exItem.dataset.attemptKey });
    exItem.dataset.attemptId = String(attempt.id);
    judgedQuestionAttemptIds.set(exerciseId, attempt.id);
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

/** Sends the remembered outcome of one Hoje item to the attempt ledger. True once the server has it. */
async function flushPendingAttempt(exItem) {
  const outcome = exItem.dataset.pendingOutcome;
  if (!outcome) return true;
  try {
    await pendingReviewReveals.get(exItem); // the reveal of this item may still be on its way: judge only after it
    const attemptId = exItem.dataset.attemptId || await ensureAttemptStarted(exItem);
    if (!attemptId) return false;
    await DB.attempts.submit(attemptId, { outcome, assessmentMethod: "SELF_REPORT" });
    delete exItem.dataset.pendingOutcome;
    return true;
  } catch (error) {
    // An earlier send of THIS outcome reached the server and only its reply was lost: the attempt is already
    // SUBMITTED with exactly that outcome (the item's buttons are locked, so it cannot differ). It is not unsent.
    if (error?.code === "ALREADY_SUBMITTED" && exItem.dataset.attemptId) {
      delete exItem.dataset.pendingOutcome;
      return true;
    }
    console.error("Falha ao registrar resultado da tentativa (item-level tracking).", error);
    return false;
  }
}

/** Retries every pending item under `container`; returns how many the server still does not have. */
async function flushPendingAttempts(container) {
  let remaining = 0;
  for (const exItem of container?.querySelectorAll(".review-exercise-item[data-pending-outcome]") ?? []) {
    if (!(await flushPendingAttempt(exItem))) remaining += 1;
  }
  return remaining;
}

reviewDashboard.addEventListener("click", async (event) => {
  const button = event.target.closest('[data-action="reveal-answer"]');
  if (!button) return;
  const exItem = button.closest(".review-exercise-item");
  const answerEl = button.nextElementSibling;
  if (!answerEl) return;
  const wasHidden = answerEl.hidden;
  answerEl.hidden = !answerEl.hidden;
  button.textContent = t(answerEl.hidden ? "shell.action.viewAnswer" : "shell.action.hideAnswer");
  if (!answerEl.hidden && exItem && exItem.dataset.exerciseAnswered !== "true") {
    const judgment = exItem.querySelector(".exercise-judgment");
    if (judgment) judgment.hidden = false;
  }
  if (wasHidden && !answerEl.hidden) {
    // Kept per item so a judgment tapped right away waits for it (see flushPendingAttempt): judging first would start a second
    // attempt for the same question, or submit this one before the reveal reaches the server, which then refuses it.
    const reveal = recordReviewReveal(exItem);
    pendingReviewReveals.set(exItem, reveal);
    await reveal;
  }
});

const pendingReviewReveals = new WeakMap();

/** Starts the server attempt for a review exercise (when it has none yet) and records the reveal on it. Never rejects. */
async function recordReviewReveal(exItem) {
  const attemptId = await ensureAttemptStarted(exItem);
  if (!attemptId) return;
  try { await DB.attempts.revealSolution(attemptId); }
  catch (error) { console.error("Falha ao registrar revelação de resposta (item-level tracking).", error); }
}

reviewDashboard.addEventListener("click", async (event) => {
  const button = event.target.closest('[data-action="exercise-acertei"], [data-action="exercise-errei"]');
  if (!button) return;
  const exItem = button.closest(".review-exercise-item");
  if (!exItem || exItem.dataset.exerciseAnswered === "true") return;

  const isCorrect = button.dataset.action === "exercise-acertei";
  exItem.dataset.exerciseAnswered = "true";
  exItem.classList.add(isCorrect ? "is-correct" : "is-wrong");

  if (REMOTE_MODE && DB.attempts) {
    // The local judgment stays the primary record of the review (it feeds the review's own evidence); the item-level
    // attempt is what "para reforçar" reads. If it cannot be sent now it is remembered and retried when the review is
    // completed or the redo starts, so the two cannot silently disagree.
    exItem.dataset.pendingOutcome = isCorrect ? "CORRECT" : "INCORRECT";
    judgedQuestionExerciseIds.add(Number(exItem.dataset.exerciseId));
    revealQuestionFlagControls(exItem);
    await flushPendingAttempt(exItem);
  }
  revealQuestionFlagControls(exItem);
  for (const btn of exItem.querySelectorAll(".exercise-judgment button")) {
    btn.disabled = true;
  }
  button.classList.add("is-selected");
  button.setAttribute("aria-pressed", "true");

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
      el.textContent = `${formatDecimal(scorePercent)}%`;
      el.classList.remove("is-empty");
    }
    section.dataset.allAnswered = "true";
  }
  updateReviewBlockResult(section);
  if (row) syncReviewProgress(row);

  // The judged button was just disabled, which drops keyboard focus to <body>:
  // hand it to the next actionable control (next question, or the redo action
  // when the block just ended with errors).
  const nextOpen = section.querySelector('.review-exercise-item[data-exercise-answered="false"] [data-action="reveal-answer"]');
  (nextOpen ?? section.querySelector(".review-block-retest"))?.focus();

  // The last answer concludes the stage by itself (one rule, see review-completion.js): no second "Revisão feita".
  const box = row?.querySelector('[data-action="review-done"]');
  if (row && box && !box.checked && !box.disabled && reviewConclusion({ total, answered }).kind === "EVIDENCE") {
    box.disabled = true;
    try {
      await concludeReviewWithEvidence(Number(box.dataset.reviewId), section, { retestFirst: true });
    } catch (error) {
      if (error?.code === "ALREADY_COMPLETED") {
        await renderToday().catch((refreshError) => console.error("Falha ao atualizar Hoje.", refreshError));
        return;
      }
      // nothing was concluded: the box stays as the way to try again
      box.disabled = false;
      setReviewMessage(t("appReview.saveFailed"), true);
      console.error("Falha ao concluir a revisão.", error);
    }
  }
});

reviewDashboard.addEventListener("click", async (event) => {
  const button = event.target.closest('[data-action="retest-block"]');
  if (!button) return;
  const section = button.closest("[data-exercises-total]");
  const row = section?.closest(".review-row");
  if (!section || !row) return;
  const wrongIds = new Set(
    [...section.querySelectorAll('.review-exercise-item.is-wrong:not([data-retest="CORRECT"])')].map((el) => Number(el.dataset.exerciseId)),
  );
  const wrong = (reviewBlockExercises.get(section) ?? []).filter((e) => wrongIds.has(e.id));
  if (wrong.length === 0) return;
  // The redo pairs with the original error on the server: send what could not be sent during the review first. If it
  // still fails the redo opens anyway (studying is never blocked by the ledger) and the student is told.
  const unsent = REMOTE_MODE && DB.attempts ? await flushPendingAttempts(section) : 0;
  startRetestBlock({
    returnReviewId: Number(row.dataset.reviewId),
    unitId: Number(row.dataset.unitId),
    subjectName: row.querySelector(".subject-chip")?.textContent ?? "",
    unitTitle: row.querySelector(".review-content")?.textContent ?? "",
    exercises: wrong,
  });
  if (unsent > 0) studyNowMessage.textContent = t(unsent === 1 ? "appReview.unsentRetest.one" : "appReview.unsentRetest.other", { count: unsent });
});

reviewDashboard.addEventListener("click", (event) => {
  const button = event.target.closest('[data-action="edit-summary"]');
  if (!button) return;
  const row = button.closest(".review-row");
  if (!row) return;
  const editArea = row.querySelector(".review-summary-edit");
  if (!editArea) return;
  editArea.hidden = !editArea.hidden;
  button.setAttribute("aria-expanded", String(!editArea.hidden));
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
  const placeholderEl = row.querySelector(".review-summary-placeholder");
  if (!textarea) return;

  const newSummaryBody = textarea.value.trim() || null;
  button.disabled = true;
  try {
    const updated = await DB.learningUnits.update(unitId, { summaryBody: newSummaryBody });
    if (displayEl && updated) {
      renderSummary(displayEl, updated.summaryBody ?? "");
      displayEl.hidden = !updated.summaryBody;
      if (placeholderEl) placeholderEl.hidden = Boolean(updated.summaryBody);
    }
    textarea.value = newSummaryBody ?? "";
    if (messageEl) {
      messageEl.classList.remove("is-error");
      messageEl.textContent = t("appReview.summary.saved");
      setTimeout(() => { messageEl.textContent = ""; }, 2000);
    }
    row.querySelector(".review-summary-edit").hidden = true;
    // the editor closed with the focused button inside it: focus goes back to the button that opened it
    const opener = row.querySelector('[data-action="edit-summary"]');
    opener?.setAttribute("aria-expanded", "false");
    opener?.focus();
  } catch (error) {
    if (messageEl) {
      messageEl.classList.add("is-error");
      messageEl.textContent = t("appReview.summary.saveFailed");
    }
    console.error("Falha ao salvar resumo.", error);
    button.disabled = false;
    button.focus({ preventScroll: true }); // a disabled button drops keyboard focus
  } finally {
    button.disabled = false;
  }
});

/**
 * Completing (or undoing) a review re-renders Hoje and the row moves to another group, so the checkbox the keyboard
 * was on no longer exists. Put focus on the same review's checkbox in its new place (its state is now committed and
 * it can be undone from there); if that row is gone, on the page heading.
 */
function refocusReviewDone(taskId, { retestFirst = false } = {}) {
  const retest = retestFirst ? reviewDashboard.querySelector(`.review-row[data-review-id="${taskId}"] .review-block-retest`) : null;
  const again = retest ?? reviewDashboard.querySelector(`[data-action="review-done"][data-review-id="${taskId}"]`);
  if (again) { again.focus({ preventScroll: true }); return; }
  const heading = document.querySelector("#title-today");
  if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
}

/**
 * Concludes a stage whose questions are ALL answered (the one conclusion rule, review-completion.js): items whose attempt could not be
 * sent earlier get another try, the answers are recorded as the stage's evidence, and Hoje is redrawn with focus back on the same review.
 * Throws when the server refuses, leaving the stage as it was.
 */
async function concludeReviewWithEvidence(taskId, section, { retestFirst = false } = {}) {
  const unsentItems = REMOTE_MODE && DB.attempts ? await flushPendingAttempts(section) : 0;
  await DB.completeReviewWithEvidence({
    taskId,
    questionsCount: Number(section.dataset.exercisesAnswered),
    correctCount: Number(section.dataset.exercisesCorrect),
  });
  setReviewMessage();
  await renderToday();
  refocusReviewDone(taskId, { retestFirst });
  if (unsentItems > 0) setReviewMessage(t(unsentItems === 1 ? "appReview.unsentReview.one" : "appReview.unsentReview.other", { count: unsentItems }), true);
}

reviewDashboard.addEventListener("change", async (event) => {
  const input = event.target.closest('[data-action="review-done"]');
  if (!input) return;

  input.disabled = true;
  const taskId = Number(input.dataset.reviewId);
  try {
    const row = input.closest(".review-row");
    const exercisesSection = row?.querySelector("[data-exercises-total]");

    if (input.checked && exercisesSection) {
      const rule = reviewConclusion({ total: Number(exercisesSection.dataset.exercisesTotal), answered: Number(exercisesSection.dataset.exercisesAnswered) });
      if (rule.kind === "PRACTICE_PENDING") {
        // A stage with questions is not concluded by reading nor by a part of them: it stays pending.
        input.checked = false;
        input.disabled = false;
        input.focus({ preventScroll: true });
        setReviewMessage(t(rule.remaining === 1 ? "appReview.practicePending.one" : "appReview.practicePending.other", { count: rule.remaining }), true);
        return;
      }
      if (rule.kind === "EVIDENCE") {
        await concludeReviewWithEvidence(taskId, exercisesSection);
        return;
      }
    }

    // reading: only a stage without questions gets here (or undoing a conclusion); it records "lida" and never a score
    await DB.reviewTasks.update(taskId, {
      reviewDone: input.checked,
      completedAt: input.checked ? new Date().toISOString() : null,
    });
    setReviewMessage();
    await renderToday();
    refocusReviewDone(taskId);
  } catch (error) {
    // An earlier tap reached the server and only its reply was lost: the review IS completed (what the server holds
    // stands, including any score it recorded). Showing "could not save" for that, forever, would be false.
    // (the same for undoing it: "not completed" means the first undo already took effect)
    if ((error?.code === "ALREADY_COMPLETED" && input.checked) || (error?.code === "NOT_COMPLETED" && !input.checked)) {
      try {
        setReviewMessage();
        await renderToday();
        refocusReviewDone(taskId);
        return;
      } catch (refreshError) {
        console.error("Falha ao atualizar Hoje após revisão já concluída.", refreshError);
      }
    }
    input.checked = input.dataset.committedChecked === "true";
    input.disabled = false;
    input.focus({ preventScroll: true });
    setReviewMessage(t("appReview.saveFailed"), true);
    console.error("Falha ao atualizar a revisão.", error);
  }
});

generationLanguageSave?.addEventListener('click', async () => {
  if (!REMOTE_MODE || !generationLanguageSelect) return;
  generationLanguageSave.disabled = true;
  if (generationLanguageMessage) {
    generationLanguageMessage.classList.remove('is-error');
    generationLanguageMessage.textContent = '';
  }
  try {
    const chosen = generationLanguageSelect.value;
    const updated = await DB.settings.update({ generationLocale: chosen });
    generationLanguageSelect.value = updated.generationLocale ?? chosen;
    syncSelect(generationLanguageSelect);
    if (generationLanguageMessage) generationLanguageMessage.textContent = t("appBackup.language.saved");
  } catch (error) {
    if (generationLanguageMessage) {
      generationLanguageMessage.classList.add('is-error');
      generationLanguageMessage.textContent = t("appBackup.language.saveFailed");
    }
    console.error('Falha ao atualizar o idioma de geração.', error);
  } finally {
    generationLanguageSave.disabled = false;
  }
});

exportBackupButton.addEventListener("click", exportBackup);

resetDatabaseButton.addEventListener("click", async () => {
  const confirmed = await showConfirm(t("appBackup.reset.confirm"));
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
    setResetMessage(t("appBackup.reset.done"));
  } catch (error) {
    setResetMessage(t("appBackup.reset.failed"), true);
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
  const confirmed = await showConfirm(t("appBackup.import.confirmReplace"));
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
    const body = renderSummary(createTextElement("div", "daily-summary-body", ""), record.summaryBody ?? record.title);
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
    setReviewMessage(t("appReview.comment.saveFailed"), true);
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
  const text = values.scorePercent == null ? "—" : `${formatDecimal(values.scorePercent)}%`;
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
    setReviewMessage(t("validation.review.overflow"), true);
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
    setReviewMessage(t("appReview.score.saveFailed"), true);
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
    setReviewMessage(t("appReview.questionsStatus.saveFailed"), true);
    console.error("Falha ao salvar status das questões.", error);
  }
});

studyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  studyMessage.classList.remove("is-error");
  studyMessage.textContent = "";

  // a subject being created right now is the one the user just picked: wait for it instead of reporting "no subject"
  if (pendingSubjectCreate) await pendingSubjectCreate.catch(() => {});

  const subjectId = Number(subjectSelect.value);
  const sourceText = studySourceTextInput ? studySourceTextInput.value.trim() : "";
  const studyDate = studyDateInput.value;
  const content = studyContentInput.value.trim();
  const summaryBody = studySummaryTextarea.value.trim() || null;
  const lessonDate = studyLessonDateInput?.value || null;

  if (lessonDate && studyDate && lessonDate > studyDate) {
    studyMessage.classList.add("is-error");
    studyMessage.textContent = t("appRegister.form.lessonDateLater");
    studyLessonDateInput.focus();
    return;
  }
  if (!subjectId || !studyDate || !content) {
    studyMessage.classList.add("is-error");
    if (!subjectId) {
      studyMessage.textContent = t("appRegister.form.subjectRequired");
      subjectSelect.focus();
    } else if (!studyDate) {
      studyMessage.textContent = t("appRegister.form.dateRequired");
      studyDateInput.focus();
    } else {
      studyMessage.textContent = t("appRegister.form.contentRequired");
      studyContentInput.focus();
    }
    return;
  }
  const studyTitleError = validateTitleField(content, t("shell.field.studyContent"));
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
      lessonDate,
      title: content,
      summaryBody,
      operationKey: studySaveOperation.key,
    });
    studySaveOperation.renew();
    rememberSelection(LAST_SUBJECT_KEY, subjectId);
    await renderStudies();
    studyContentInput.value = "";
    studySummaryTextarea.value = "";
    if (studyLessonDateInput) studyLessonDateInput.value = "";
    if (studySourceTextInput) studySourceTextInput.value = "";
    studyMessage.textContent = t("appRegister.form.studySaved");
    studyContentInput.focus();
  } catch (error) {
    if (!(error instanceof NetworkError)) studySaveOperation.renew();
    studyMessage.classList.add("is-error");
    studyMessage.textContent = t("appRegister.form.studySaveFailed");
  }
});

studyDateInput.value = getLocalDateValue();
await dbInit;
if (databaseAvailable && authenticated) {
  await renderSubjects();
  await renderToday();
}

evolutionFilterSubject?.addEventListener("change", async () => {
  if (!databaseAvailable) return;
  const [ev, units, subjs] = await Promise.all([DB.learningEvidence.getAll(), DB.learningUnits.getAll(), DB.subjects.getAll()]);
  renderEvolutionSvg(ev, units, subjs);
});

planFilterSubject?.addEventListener("change", () => {
  planPage = 1;
  if (databaseAvailable) renderPlan().catch(console.error);
});
planFilterState?.addEventListener("change", () => {
  planPage = 1;
  if (databaseAvailable) renderPlan().catch(console.error);
});
planSort?.addEventListener("change", () => {
  planPage = 1;
  if (databaseAvailable) renderPlan().catch(console.error);
});

planFilterPeriod?.addEventListener("change", () => {
  planPage = 1;
  if (databaseAvailable) renderPlan().catch(console.error);
});

planSearch?.addEventListener("input", () => {
  planPage = 1;
  if (databaseAvailable) renderPlan().catch(console.error);
});
planPrev?.addEventListener("click", () => { planPage -= 1; if (databaseAvailable) renderPlan().catch(console.error); });
planNext?.addEventListener("click", () => { planPage += 1; if (databaseAvailable) renderPlan().catch(console.error); });
planTopPrev?.addEventListener("click", () => planPrev?.click());
planTopNext?.addEventListener("click", () => planNext?.click());

statsUnitFilterPeriod?.addEventListener("change", () => {
  if (!databaseAvailable) return;
  renderStats().catch(console.error);
});

function setPlanFormVisible(visible) {
  if (!planNewUnitForm) return;
  planNewUnitForm.hidden = !visible;
  planNewUnitBtn.setAttribute("aria-expanded", String(visible));
  if (visible) {
    if (planSubjectsPanel && !planSubjectsPanel.hidden) setSubjectsPanel(false);
    if (!planStudyDate.value) planStudyDate.value = getLocalDateValue();
    planStudyTitle.focus();
  }
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
planEmptyNewBtn?.addEventListener("click", () => setPlanFormVisible(true));

// "Pular para o conteúdo": the hash router owns location.hash, so the link moves focus itself instead of navigating.
document.querySelector(".skip-link")?.addEventListener("click", (event) => {
  event.preventDefault();
  document.querySelector(".app-main")?.focus();
});

// First run (empty Hoje): the two ways to start. "Enviar um PDF" exists only where Materiais does.
const firstUploadBtn = todayEmptyState?.querySelector('[data-action="first-upload"]');
const firstCreateBtn = todayEmptyState?.querySelector('[data-action="first-create"]');
if (firstUploadBtn) firstUploadBtn.hidden = !(REMOTE_MODE && LOCAL_AUTHORITY);
firstUploadBtn?.addEventListener("click", () => showScreen("materials", { focus: true }));
firstCreateBtn?.addEventListener("click", () => {
  showScreen("plan", { focus: false });
  setPlanFormVisible(true);
});

planUnitCancelBtn?.addEventListener("click", () => {
  setPlanFormVisible(false);
  planSubjectForm?.hide();
  planSubjectForm?.reset();
  setPlanFormMessage();
  planSaveOperation.renew();
});

// Plano's door to the one registration of a discipline: the new discipline is created now, listed and picked for the lesson being typed
async function createSubjectFromPlan(name, color) {
  const newSubject = await DB.subjects.create(name, color);
  await renderPlan();
  if (planSubjectSelect) { planSubjectSelect.value = String(newSubject.id); syncSelect(planSubjectSelect); }
  planStudyTitle.focus();
}

planUnitSaveBtn?.addEventListener("click", async () => {
  setPlanFormMessage();

  const title = planStudyTitle?.value.trim() ?? "";
  const studyDate = planStudyDate?.value ?? "";
  const lessonDate = planLessonDate?.value || null;

  // Validate unit fields first — before creating any discipline
  if (!studyDate) { setPlanFormMessage(t("plan.unit.dateRequired"), true); planStudyDate?.focus(); return; }
  if (lessonDate && lessonDate > studyDate) { setPlanFormMessage(t("plan.unit.lessonDateLater"), true); planLessonDate?.focus(); return; }
  const titleError = validateTitleField(title, t("shell.field.studyContent"));
  if (titleError) { setPlanFormMessage(titleError, true); planStudyTitle?.focus(); return; }

  // Resolve discipline: capture new name to include in atomic save, or use selected existing ID
  let newSubjectName = null;
  const pendingName = planSubjectForm?.pendingName();
  if (pendingName) {
    const nameError = validateNamingField(pendingName, t("shell.field.subjectName"));
    if (nameError) { setPlanFormMessage(nameError, true); planSubjectForm.input.focus(); return; }
    newSubjectName = pendingName;
  }

  const sourceText = planStudySource?.value.trim() ?? "";
  const summaryBody = planStudySummary?.value.trim() || null;

  let subjectId;
  if (!newSubjectName) {
    subjectId = Number(planSubjectSelect?.value);
    if (!subjectId) { setPlanFormMessage(t("plan.unit.subjectRequired"), true); planSubjectSelect?.focus(); return; }
  }

  planUnitSaveBtn.disabled = true;
  try {
    const studyData = newSubjectName
      ? { newSubjectName, newSubjectColor: planSubjectForm.color, sourceText, studyDate, lessonDate, title, summaryBody, operationKey: planSaveOperation.key }
      : { subjectId, sourceText, studyDate, lessonDate, title, summaryBody, operationKey: planSaveOperation.key };
    const saved = await generateReviewTasks(studyData);
    // Save succeeded (or an idempotent retry returned the original result)
    // — this intent is done, the next save is a genuinely new one.
    planSaveOperation.renew();
    // Clear draft immediately; render failures below must NOT re-submit
    planStudyTitle.value = "";
    planStudySource.value = "";
    planStudySummary.value = "";
    if (planLessonDate) planLessonDate.value = "";
    planSubjectForm?.reset();
    planSubjectForm?.hide();
    setPlanFormMessage(t("plan.unit.saved"));
    try {
      await renderPlan();
      if (planSubjectSelect) { planSubjectSelect.value = String(saved.subjectId); syncSelect(planSubjectSelect); }
      // AC-014: clear subject filter if it would hide the newly saved unit
      if (planFilterSubject && planFilterSubject.value && planFilterSubject.value !== String(saved.subjectId)) {
        planFilterSubject.value = '';
        await renderPlan();
      }
      setPlanFormVisible(false);
      setPlanFormMessage();
      await renderToday();
    } catch {
      setPlanFormMessage(t("plan.unit.savedReload"));
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
    setPlanFormMessage(t("plan.unit.saveFailed"), true);
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
const accountPasswordDetails = document.querySelector("#account-password-details");
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
  // a signed-in screen never leaves the password fields open for typing: they stay behind the button
  if (!loggedIn || !accountLoggedInView) accountPasswordDetails?.removeAttribute("open");
  if (loggedIn && accountLoggedInAs) {
    accountLoggedInAs.textContent = user.emailDisplay;
    const avatar = document.querySelector("#account-avatar");
    if (avatar) avatar.textContent = String(user.emailDisplay ?? "").trim().charAt(0).toLocaleUpperCase();
  }
}

// V7.2 shortcuts on the Conta card: "Preferências e dados" and "Continuar estudo".
document.addEventListener("click", (event) => {
  const go = event.target.closest?.("[data-go-screen]");
  if (go) showScreen(go.dataset.goScreen, { focus: true });
});

document.querySelector("#account-show-register")?.addEventListener("click", () => {
  accountLoginForm.hidden = true;
  accountRegisterForm.hidden = false;
});
document.querySelector("#account-show-login")?.addEventListener("click", () => {
  accountRegisterForm.hidden = true;
  accountLoginForm.hidden = false;
});

// Eye button: shows the typed password as text and hides it again; the field value is never read or stored here.
document.addEventListener("click", (event) => {
  const toggle = event.target.closest?.(".password-toggle");
  if (!toggle) return;
  const field = document.getElementById(toggle.getAttribute("aria-controls"));
  if (!field) return;
  const show = field.type === "password";
  field.type = show ? "text" : "password";
  toggle.setAttribute("aria-pressed", String(show));
});

// A reset form (after sign-in or a password change) goes back to hidden characters.
document.addEventListener("reset", (event) => {
  for (const toggle of event.target.querySelectorAll?.(".password-toggle") ?? []) {
    const field = document.getElementById(toggle.getAttribute("aria-controls"));
    if (field) field.type = "password";
    toggle.setAttribute("aria-pressed", "false");
  }
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
    // evidence this account left unsent (another student may have used the screen since) goes out now, under this account
    if (pendingStudyEvidence.pendingCount()) recordStudyEvidence().catch((error) => console.error("Falha ao registrar o resultado pendente.", error));
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
  setAccountMessage("account-register");
  accountRegisterForm.reset();
  accountRegisterForm.hidden = true;
  accountLoginForm.hidden = false;
  // the register form is hidden now: the success text goes where the student is looking (the login form)
  setAccountMessage("account-login", t("account.registered"));
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
  setAccountMessage("account-password", t("auth.success.passwordChanged"));
  accountPasswordForm.reset();
  accountPasswordDetails?.removeAttribute("open");
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
    const wasOnDataScreen = DATA_SCREENS.has(window.location.hash.slice(1));
    authenticated = false;
    await renderAccount();
    if (wasOnDataScreen) {
      showScreen("account");
      // Without this the student is thrown onto a bare login form with no idea why (the form clears it on the next attempt).
      setAccountMessage("account-login", t("account.sessionExpired"), true);
    }
  });
}

enhanceAllSelects();
showScreen(window.location.hash.slice(1) || DEFAULT_SCREEN);
