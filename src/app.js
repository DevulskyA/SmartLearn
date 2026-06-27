import "./styles.css";
import { DB } from "./db.js";
import { Stats } from "./stats.js";
import { getReviewScoreValidationMessage, getReviewScoreValues } from "./review-score.js";
import { generateReviewDates } from "./review-schedule.js";
import {
  THEME_OPTIONS,
  applyThemePreference,
  getStoredThemePreference,
  resolveThemePreference,
} from "./theme.js";

let databaseAvailable = false;
const dbInit = DB.init()
  .then(() => {
    databaseAvailable = true;
    return true;
  })
  .catch((error) => {
    console.error("Falha ao inicializar o banco local.", error);
    return false;
  });

const DEFAULT_SCREEN = "today";
const LAST_SUBJECT_KEY = "smartlearn:lastSubjectId";
const LAST_SOURCE_KEY = "smartlearn:lastSourceId";
const FALLBACK_SOURCE_NAME = "Sem fonte";

// Estado de edição inline — null quando nenhuma linha está em modo edição.
let activeSourceEditId = null;
let activeSubjectEditId = null;

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
const studySourceSelect = document.querySelector("#study-source");
const showSourceFormButton = document.querySelector("#show-source-form");
const newSourceForm = document.querySelector("#new-source-form");
const newSourceInput = document.querySelector("#new-source-input");
const sourceMessage = document.querySelector("#source-message");
const sourceList = document.querySelector("#source-list");
const sourcesEmpty = document.querySelector("#sources-empty");
const sourceManagerMessage = document.querySelector("#source-manager-message");
const studyMessage = document.querySelector("#study-message");
const todayDateLabel = document.querySelector("#today-date-label");
const todayEmptyState = document.querySelector("#today-empty-state");
const todaySuccessState = document.querySelector("#today-success-state");
const todayTomorrow = document.querySelector("#today-tomorrow");
const reviewDashboard = document.querySelector("#review-dashboard");
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
const resetDatabaseButton = document.querySelector("#reset-database");
const resetMessage = document.querySelector("#reset-message");
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
  if (number < 50) return "performance-badge--critical";
  if (number < 70) return "performance-badge--attention";
  if (number < 85) return "performance-badge--good";
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
  contentCell.textContent = exercise.content;

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

function createReviewRow(task, studyRecord, subject, source, groupName, today) {
  const row = document.createElement("article");
  row.className = "review-row";
  row.dataset.reviewId = String(task.id);
  row.dataset.group = groupName;

  // Header: review-number marker + identity + status/score tags
  const header = document.createElement("div");
  header.className = "review-row-header";

  const marker = createTextElement("span", "review-marker", `R${task.reviewNumber}`);
  marker.classList.add(`is-${groupName === "doneToday" ? "done" : groupName}`);
  marker.setAttribute("aria-label", `Revisão número ${task.reviewNumber}`);

  const heading = document.createElement("div");
  heading.className = "review-row-heading";
  heading.append(createTextElement("p", "review-subject", subject?.name ?? "Sem disciplina"));
  heading.append(createTextElement("h3", "review-content", studyRecord?.content ?? "Conteúdo indisponível"));
  heading.append(
    createTextElement(
      "p",
      "review-meta",
      `${source?.name ?? "Fonte indisponível"} · ${formatDate(studyRecord?.studyDate)}`,
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

  const expandButton = document.createElement("button");
  expandButton.type = "button";
  expandButton.className = "review-expand";
  expandButton.dataset.action = "expand";
  expandButton.setAttribute("aria-expanded", String(hasScoreData));
  expandButton.textContent = "Ver desempenho";

  primary.append(reviewDoneLabel, expandButton);

  // Collapsible detail: questions, score, comment
  const detail = document.createElement("div");
  detail.className = "review-row-detail";
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

  row.append(header, primary, detail);
  return row;
}

export async function renderToday() {
  const today = getLocalDateValue();
  const tomorrow = getTomorrowValue(today);
  const [pendingToday, overdueReviews, completedToday, tomorrowReviews, studyRecords, subjects, sources] =
    await Promise.all([
      DB.reviewTasks.getForToday(today),
      DB.reviewTasks.getOverdue(today),
      DB.reviewTasks.getCompletedToday(today),
      DB.reviewTasks.getTomorrow(tomorrow),
      DB.studyRecords.getAll(),
      DB.subjects.getAll(),
      DB.sources.getAll(),
    ]);
  const studiesById = new Map(studyRecords.map((record) => [record.id, record]));
  const subjectsById = new Map(subjects.map((subject) => [subject.id, subject]));
  const sourcesById = new Map(sources.map((source) => [source.id, source]));
  const groups = {
    overdue: overdueReviews,
    today: pendingToday,
    doneToday: completedToday,
  };

  for (const [groupName, tasks] of Object.entries(groups)) {
    const block = reviewGroups[groupName];
    const list = block.querySelector(`[data-review-list="${groupName}"]`);
    const count = block.querySelector(`[data-count-for="${groupName}"]`);
    list.replaceChildren();
    count.textContent = String(tasks.length);
    block.hidden = tasks.length === 0;

    for (const task of tasks) {
      const studyRecord = studiesById.get(task.studyRecordId);
      const subject = subjectsById.get(studyRecord?.subjectId);
      const source = sourcesById.get(studyRecord?.sourceId);
      list.append(createReviewRow(task, studyRecord, subject, source, groupName, today));
    }
  }

  const pendingCount = overdueReviews.length + pendingToday.length;
  const hasData = studyRecords.length > 0;
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
}

export async function renderStats() {
  const [reviewTasks, studyRecords, subjects] = await Promise.all([
    DB.reviewTasks.getAll(),
    DB.studyRecords.getAll(),
    DB.subjects.getAll(),
  ]);
  const stats = Stats.calculate(reviewTasks, studyRecords, subjects);
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

  const dataPoints = reviewTasks
    .filter(
      (task) => task.questionsDone && task.scorePercent != null && task.completedAt != null,
    )
    .sort((a, b) => a.completedAt.localeCompare(b.completedAt))
    .map((task) => ({
      date: task.completedAt.slice(0, 10),
      scorePercent: Number(task.scorePercent),
    }));
  const chartRendered = Stats.renderChart(evolutionChart, dataPoints);
  evolutionChart.hidden = !chartRendered;
  chartEmpty.hidden = chartRendered;
  if (!chartRendered) {
    chartEmpty.textContent = "Sem dados suficientes para o gráfico.";
  }
}
export async function renderSettings() {
  const settings = await DB.settings.get();
  lastBackupLabel.textContent = settings?.lastBackupAt
    ? `Último backup: ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(settings.lastBackupAt))}`
    : "Nenhum backup exportado.";
}

export async function exportBackup() {
  exportBackupButton.disabled = true;
  backupMessage.classList.remove("is-error");
  backupMessage.textContent = "";
  try {
    const data = await DB.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `smartlearn-backup-${getLocalDateValue()}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    await DB.settings.update({ lastBackupAt: new Date().toISOString() });
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
  const tasks = generateReviewDates(studyDate).map((dueDate, index) => ({
    reviewNumber: index + 1,
    dueDate,
    reviewDone: false,
    questionsDone: false,
  }));

  return DB.studyRecords.createWithReviews(studyData, tasks);
}

async function resolveStudySourceId(selectedSourceId) {
  if (selectedSourceId) return selectedSourceId;

  const activeSources = await DB.sources.getActive();
  if (activeSources.length > 0) return null;

  const allSources = await DB.sources.getAll();
  const fallbackSource = allSources.find(
    (source) => source.name.localeCompare(FALLBACK_SOURCE_NAME, "pt-BR", { sensitivity: "accent" }) === 0,
  );

  if (fallbackSource) {
    if (!fallbackSource.isActive) {
      await DB.sources.update(fallbackSource.id, { isActive: true });
    }
    await renderSources(fallbackSource.id);
    return fallbackSource.id;
  }

  const source = await DB.sources.create(FALLBACK_SOURCE_NAME);
  await renderSources(source.id);
  return source.id;
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

function setSourceMessage(message = "") {
  sourceMessage.textContent = message;
}

function setSourceManagerMessage(message = "") {
  sourceManagerMessage.textContent = message;
}

function setSourceFormVisible(visible) {
  newSourceForm.hidden = !visible;
  showSourceFormButton.setAttribute("aria-expanded", String(visible));
  setSourceMessage();

  if (visible) {
    newSourceInput.focus();
  }
}

function pluralize(value, singular, plural) {
  return value === 1 ? singular : plural;
}

async function renderSources(selectedId = studySourceSelect.value) {
  const [activeSources, allSources] = await Promise.all([
    DB.sources.getActive(),
    DB.sources.getAll(),
  ]);
  studySourceSelect.replaceChildren(new Option("Selecione...", ""));

  for (const source of activeSources) {
    studySourceSelect.add(new Option(source.name, String(source.id)));
  }

  if (selectedId !== undefined && selectedId !== null) {
    studySourceSelect.value = String(selectedId);
  }

  if (!studySourceSelect.value) {
    const remembered = recallSelection(LAST_SOURCE_KEY);
    if (remembered && activeSources.some((source) => String(source.id) === remembered)) {
      studySourceSelect.value = remembered;
    }
  }

  if (!studySourceSelect.value && activeSources.length === 1) {
    studySourceSelect.value = String(activeSources[0].id);
  }

  renderSourceList(allSources);
}

function renderSourceList(sources) {
  sourceList.replaceChildren();
  sourcesEmpty.hidden = sources.length > 0;

  for (const source of sources) {
    const row = document.createElement("article");
    row.className = "source-row";
    row.classList.toggle("is-inactive", !source.isActive);
    row.dataset.sourceId = String(source.id);

    const info = document.createElement("div");
    info.className = "source-info";

    const actions = document.createElement("div");
    actions.className = "source-actions";

    if (source.id === activeSourceEditId) {
      // Modo edição inline
      row.classList.add("is-editing");

      const input = document.createElement("input");
      input.type = "text";
      input.className = "inline-edit-input";
      input.value = source.name;
      input.id = `source-edit-input-${source.id}`;
      input.setAttribute("aria-label", "Novo nome da fonte");
      input.setAttribute("autocomplete", "off");

      const error = document.createElement("span");
      error.className = "inline-edit-error";
      error.setAttribute("aria-live", "polite");

      info.append(input, error);

      const saveBtn = document.createElement("button");
      saveBtn.className = "small-button is-primary";
      saveBtn.type = "button";
      saveBtn.dataset.action = "save-source";
      saveBtn.textContent = "Salvar";

      const cancelBtn = document.createElement("button");
      cancelBtn.className = "small-button";
      cancelBtn.type = "button";
      cancelBtn.dataset.action = "cancel-source";
      cancelBtn.textContent = "Cancelar";

      actions.append(saveBtn, cancelBtn);
    } else {
      // Modo visualização
      info.append(createTextElement("p", "source-name", source.name));
      info.append(createTextElement("span", "source-status", source.isActive ? "Ativa" : "Desativada"));

      const editButton = document.createElement("button");
      editButton.className = "small-button";
      editButton.type = "button";
      editButton.dataset.action = "edit-source";
      editButton.dataset.sourceName = source.name;
      editButton.textContent = "Editar";

      const toggleButton = document.createElement("button");
      toggleButton.className = "small-button";
      toggleButton.type = "button";
      toggleButton.dataset.action = source.isActive ? "deactivate-source" : "activate-source";
      toggleButton.textContent = source.isActive ? "Desativar" : "Ativar";

      const deleteButton = document.createElement("button");
      deleteButton.className = "small-button is-danger";
      deleteButton.type = "button";
      deleteButton.dataset.action = "delete-source";
      deleteButton.dataset.sourceName = source.name;
      deleteButton.textContent = "Excluir";

      actions.append(editButton, toggleButton, deleteButton);
    }

    row.append(info, actions);
    sourceList.append(row);
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

export function showScreen(screenId, { focus = false } = {}) {
  const nextScreen = isKnownScreen(screenId) ? screenId : DEFAULT_SCREEN;

  for (const panel of screenPanels) {
    panel.hidden = panel.dataset.screenPanel !== nextScreen;
  }

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
  if (nextScreen === "register" && databaseAvailable) {
    Promise.all([renderSubjects(), renderSources()]).catch((error) => {
      console.error("Falha ao carregar cadastro.", error);
    });
  }
  if (nextScreen === "settings" && databaseAvailable) {
    renderSettings().catch((error) => console.error("Falha ao carregar configurações.", error));
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

  if (!name) {
    setSubjectMessage("Informe o nome da disciplina.");
    newSubjectInput.focus();
    return;
  }

  try {
    const subject = await DB.subjects.create(name);
    await renderSubjects(subject.id);
    newSubjectForm.reset();
    setSubjectFormVisible(false);
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

showSourceFormButton.addEventListener("click", () => {
  setSourceFormVisible(newSourceForm.hidden);
});

newSourceForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = newSourceInput.value.trim();

  if (!name) {
    setSourceMessage("Informe o nome da fonte.");
    newSourceInput.focus();
    return;
  }

  try {
    const source = await DB.sources.create(name);
    await renderSources(source.id);
    newSourceForm.reset();
    setSourceFormVisible(false);
  } catch (error) {
    const isDuplicate = /unique|duplicate/i.test(String(error));
    setSourceMessage(
      isDuplicate
        ? "Essa fonte já está cadastrada."
        : "Não foi possível adicionar a fonte. Tente novamente.",
    );
    newSourceInput.focus();
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
      await Promise.all([renderSubjects(), renderToday(), renderStats()]);
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
      const confirmed = window.confirm(
        `Excluir "${currentName}" apagará todos os estudos e revisões ligados a essa disciplina. Continuar?`,
      );
      if (!confirmed) return;
      await DB.subjects.deleteCascade(subjectId);
    }

    setSubjectMessage();
    setSubjectManagerMessage();
    await Promise.all([renderSubjects(), renderToday(), renderStats()]);
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

sourceList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  const row = event.target.closest(".source-row");
  if (!button || !row) return;

  const sourceId = Number(row.dataset.sourceId);
  const currentName = button.dataset.sourceName;
  const action = button.dataset.action;

  // Ações do editor inline — tratadas antes do bloco de try comum.
  if (action === "edit-source") {
    activeSourceEditId = sourceId;
    await renderSources();
    document.getElementById(`source-edit-input-${sourceId}`)?.focus();
    return;
  }

  if (action === "cancel-source") {
    activeSourceEditId = null;
    setSourceManagerMessage();
    await renderSources();
    return;
  }

  if (action === "save-source") {
    const input = row.querySelector(".inline-edit-input");
    const errorEl = row.querySelector(".inline-edit-error");
    const newName = input?.value?.trim() ?? "";
    if (!newName) {
      if (errorEl) errorEl.textContent = "Informe o nome da fonte.";
      input?.focus();
      return;
    }
    try {
      await DB.sources.update(sourceId, { name: newName });
      activeSourceEditId = null;
      setSourceManagerMessage();
      await Promise.all([renderSources(), renderToday(), renderStats()]);
    } catch (saveError) {
      const isDuplicate = /unique|duplicate/i.test(String(saveError));
      if (errorEl) {
        errorEl.textContent = isDuplicate
          ? "Essa fonte já está cadastrada."
          : "Não foi possível renomear a fonte.";
      }
      input?.focus();
    }
    return;
  }

  try {
    if (action === "deactivate-source") {
      await DB.sources.deactivate(sourceId);
    }

    if (action === "activate-source") {
      await DB.sources.update(sourceId, { isActive: true });
    }

    if (action === "delete-source") {
      const { studiesCount, reviewsCount } = await DB.sources.getUsageSummary(sourceId);
      const hasUsage = studiesCount > 0 || reviewsCount > 0;
      const usageMessage = hasUsage
        ? `Isso apagará ${studiesCount} ${pluralize(studiesCount, "estudo", "estudos")} e ${reviewsCount} ${pluralize(reviewsCount, "revisão", "revisões")} ligados a essa fonte.`
        : "Essa fonte ainda não tem estudos vinculados.";
      const confirmed = window.confirm(
        `Excluir "${currentName}"? ${usageMessage} Continuar?`,
      );
      if (!confirmed) return;
      await DB.sources.deleteCascade(sourceId);
    }

    setSourceManagerMessage();
    await Promise.all([renderSources(), renderToday(), renderStats()]);
  } catch (error) {
    const isDuplicate = /unique|duplicate/i.test(String(error));
    setSourceManagerMessage(
      isDuplicate
        ? "Essa fonte já está cadastrada."
        : "Não foi possível alterar a fonte.",
    );
    console.error("Falha ao alterar fonte.", error);
  }
});

sourceList.addEventListener("keydown", async (event) => {
  if (!activeSourceEditId) return;
  if (!event.target.classList.contains("inline-edit-input")) return;
  const row = event.target.closest(".source-row");
  if (!row) return;
  if (event.key === "Enter") {
    event.preventDefault();
    row.querySelector('[data-action="save-source"]')?.click();
  }
  if (event.key === "Escape") {
    event.preventDefault();
    activeSourceEditId = null;
    setSourceManagerMessage();
    await renderSources();
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

reviewDashboard.addEventListener("change", async (event) => {
  const input = event.target.closest('[data-action="review-done"]');
  if (!input) return;

  input.disabled = true;
  try {
    await DB.reviewTasks.update(Number(input.dataset.reviewId), {
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
  const confirmed = window.confirm(
    "Apagar toda a base local? Exporte um backup antes se quiser guardar os dados atuais.",
  );
  if (!confirmed) return;

  resetDatabaseButton.disabled = true;
  setResetMessage();
  try {
    await DB.clearAll();
    await Promise.all([
      renderSubjects(),
      renderSources(),
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
  const confirmed = window.confirm("Isso substituirá todos os dados atuais. Continuar?");
  if (confirmed) await importBackup(file);
  importBackupInput.value = "";
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
  let sourceId = Number(studySourceSelect.value);
  const studyDate = studyDateInput.value;
  const content = studyContentInput.value.trim();

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

  try {
    sourceId = await resolveStudySourceId(sourceId);
    if (!sourceId) {
      studyMessage.classList.add("is-error");
      studyMessage.textContent = "Selecione ou crie uma fonte.";
      studySourceSelect.focus();
      return;
    }

    await generateReviewTasks({
      subjectId,
      sourceId,
      studyDate,
      content,
    });
    rememberSelection(LAST_SUBJECT_KEY, subjectId);
    rememberSelection(LAST_SOURCE_KEY, sourceId);
    studyContentInput.value = "";
    studyMessage.textContent = "Estudo salvo. 16 revisões criadas.";
    studyContentInput.focus();
  } catch {
    studyMessage.classList.add("is-error");
    studyMessage.textContent = "Não foi possível salvar o estudo. Tente novamente.";
  }
});

studyDateInput.value = getLocalDateValue();
await dbInit;
if (databaseAvailable) {
  await renderSubjects();
  await renderToday();
}
showScreen(window.location.hash.slice(1) || DEFAULT_SCREEN);
