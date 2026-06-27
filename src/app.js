import "./styles.css";
import { DB } from "./db.js";
import { Stats } from "./stats.js";
import { getReviewScoreValidationMessage, getReviewScoreValues } from "./review-score.js";
import { generateReviewDates } from "./review-schedule.js";

await DB.init();

const DEFAULT_SCREEN = "today";
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
const reviewDashboard = document.querySelector("#review-dashboard");
const reviewGroups = {
  overdue: document.querySelector("#block-overdue"),
  today: document.querySelector("#block-today"),
  doneToday: document.querySelector("#block-done-today"),
  tomorrow: document.querySelector("#block-tomorrow"),
};
const metricElements = {
  totalQuestions: document.querySelector("#metric-questions"),
  totalCorrect: document.querySelector("#metric-correct"),
  avgScore: document.querySelector("#metric-average"),
  reviewsDone: document.querySelector("#metric-reviews-done"),
  reviewsPending: document.querySelector("#metric-reviews-pending"),
  reviewsOverdue: document.querySelector("#metric-reviews-overdue"),
};
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

function getReviewStatusLabel(groupName, task) {
  const prefix = groupName === "overdue"
    ? "Atrasada"
    : groupName === "doneToday"
      ? "Feita"
      : groupName === "tomorrow"
        ? "Amanhã"
        : "Hoje";
  return `${prefix} · R${task.reviewNumber}`;
}

function createReviewRow(task, studyRecord, subject, source, groupName) {
  const row = document.createElement("article");
  row.className = "review-row";
  row.dataset.reviewId = String(task.id);
  row.dataset.group = groupName;

  const main = document.createElement("div");
  main.className = "review-row-main";

  const subjectCell = document.createElement("div");
  subjectCell.className = "review-cell review-subject-cell";
  subjectCell.append(createTextElement("p", "review-subject", subject?.name ?? "Sem disciplina"));

  const contentCell = document.createElement("div");
  contentCell.className = "review-cell review-content-cell";
  contentCell.append(createTextElement("h3", "review-content", studyRecord?.content ?? "Conteúdo indisponível"));

  const sourceCell = document.createElement("div");
  sourceCell.className = "review-cell review-source-cell";
  sourceCell.append(createTextElement("p", "review-source", source?.name ?? "Fonte indisponível"));
  sourceCell.append(createTextElement("p", "review-study-date", formatDate(studyRecord?.studyDate)));

  const statusCell = document.createElement("div");
  statusCell.className = "review-cell review-status-cell";
  const statusBadge = createTextElement("span", "review-status", getReviewStatusLabel(groupName, task));
  statusBadge.classList.add(groupName === "doneToday" ? "is-done" : `is-${groupName}`);
  statusCell.append(statusBadge);

  const reviewDoneCell = document.createElement("div");
  reviewDoneCell.className = "review-cell review-toggle-cell";
  const reviewDoneLabel = document.createElement("label");
  reviewDoneLabel.className = "check-control review-toggle";
  const reviewDoneInput = document.createElement("input");
  reviewDoneInput.type = "checkbox";
  reviewDoneInput.checked = task.reviewDone;
  reviewDoneInput.dataset.action = "review-done";
  reviewDoneInput.dataset.reviewId = String(task.id);
  reviewDoneInput.dataset.committedChecked = String(task.reviewDone);
  reviewDoneLabel.append(reviewDoneInput, document.createTextNode("Rev. feita"));
  reviewDoneCell.append(reviewDoneLabel);

  const questionsDoneCell = document.createElement("div");
  questionsDoneCell.className = "review-cell review-toggle-cell";
  const questionsDoneLabel = document.createElement("label");
  questionsDoneLabel.className = "check-control review-toggle";
  const questionsDoneInput = document.createElement("input");
  questionsDoneInput.type = "checkbox";
  questionsDoneInput.checked = task.questionsDone;
  questionsDoneInput.dataset.action = "questions-done";
  questionsDoneInput.dataset.reviewId = String(task.id);
  questionsDoneInput.dataset.committedChecked = String(task.questionsDone);
  questionsDoneLabel.append(questionsDoneInput, document.createTextNode("Q. feitas"));
  questionsDoneCell.append(questionsDoneLabel);

  const questionsCell = document.createElement("div");
  questionsCell.className = "review-cell review-score-cell";
  const questionsLabel = document.createElement("label");
  questionsLabel.className = "number-control review-number-control";
  questionsLabel.append(createTextElement("span", "review-field-label", "Questões"));
  const questionsInput = document.createElement("input");
  questionsInput.type = "number";
  questionsInput.min = "0";
  questionsInput.step = "1";
  questionsInput.inputMode = "numeric";
  questionsInput.value = task.questionsCount ?? "";
  questionsInput.dataset.action = "score-input";
  questionsInput.dataset.field = "questionsCount";
  questionsInput.dataset.reviewId = String(task.id);
  questionsInput.dataset.committedValue = String(task.questionsCount ?? "");
  questionsInput.setAttribute("aria-label", `Questões da revisão R${task.reviewNumber}`);
  questionsLabel.append(questionsInput);
  questionsCell.append(questionsLabel);

  const correctCell = document.createElement("div");
  correctCell.className = "review-cell review-score-cell";
  const correctLabel = document.createElement("label");
  correctLabel.className = "number-control review-number-control";
  correctLabel.append(createTextElement("span", "review-field-label", "Acertos"));
  const correctInput = document.createElement("input");
  correctInput.type = "number";
  correctInput.min = "0";
  correctInput.step = "1";
  correctInput.inputMode = "numeric";
  correctInput.value = task.correctCount ?? "";
  correctInput.dataset.action = "score-input";
  correctInput.dataset.field = "correctCount";
  correctInput.dataset.reviewId = String(task.id);
  correctInput.dataset.committedValue = String(task.correctCount ?? "");
  correctInput.setAttribute("aria-label", `Acertos da revisão R${task.reviewNumber}`);
  correctLabel.append(correctInput);
  correctCell.append(correctLabel);

  const scoreCell = document.createElement("div");
  scoreCell.className = "review-cell review-score-cell review-score-cell-percent";
  const initialScoreValues = getReviewScoreValues(task.questionsCount, task.correctCount);
  const score = createTextElement(
    "span",
    "score-value review-score-value",
    initialScoreValues.scorePercent == null ? "—" : `${initialScoreValues.scorePercent.toFixed(1)}%`,
  );
  score.dataset.scoreFor = String(task.id);
  score.setAttribute("aria-label", "Percentual de acertos");
  scoreCell.append(score);

  main.append(
    subjectCell,
    contentCell,
    sourceCell,
    statusCell,
    reviewDoneCell,
    questionsDoneCell,
    questionsCell,
    correctCell,
    scoreCell,
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

  row.append(main, commentLabel);
  return row;
}

export async function renderToday() {
  const today = getLocalDateValue();
  const tomorrow = getTomorrowValue(today);
  const [overdue, dueToday, doneToday, dueTomorrow, studyRecords, subjects, sources] = await Promise.all([
    DB.reviewTasks.getOverdue(today),
    DB.reviewTasks.getForToday(today),
    DB.reviewTasks.getCompletedToday(today),
    DB.reviewTasks.getTomorrow(tomorrow),
    DB.studyRecords.getAll(),
    DB.subjects.getAll(),
    DB.sources.getAll(),
  ]);
  const studiesById = new Map(studyRecords.map((record) => [record.id, record]));
  const subjectsById = new Map(subjects.map((subject) => [subject.id, subject]));
  const sourcesById = new Map(sources.map((source) => [source.id, source]));
  const groups = { overdue, today: dueToday, tomorrow: dueTomorrow, doneToday: doneToday };
  let totalVisible = 0;

  for (const [groupName, tasks] of Object.entries(groups)) {
    const block = reviewGroups[groupName];
    const list = block.querySelector(`[data-review-list="${groupName}"]`);
    const count = block.querySelector(`[data-count-for="${groupName}"]`);
    list.replaceChildren();
    count.textContent = String(tasks.length);
    block.hidden = tasks.length === 0;
    totalVisible += tasks.length;

    for (const task of tasks) {
      const studyRecord = studiesById.get(task.studyRecordId);
      const subject = subjectsById.get(studyRecord?.subjectId);
      const source = sourcesById.get(studyRecord?.sourceId);
      list.append(createReviewRow(task, studyRecord, subject, source, groupName));
    }
  }

  todayEmptyState.hidden = totalVisible > 0;
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

  subjectAveragesBody.replaceChildren();
  subjectAveragesEmpty.hidden = stats.avgBySubject.length > 0;
  for (const subject of stats.avgBySubject) {
    const row = document.createElement("tr");
    const name = document.createElement("th");
    name.scope = "row";
    name.textContent = subject.subjectName;
    const average = document.createElement("td");
    average.textContent = `${subject.avgScore.toFixed(1).replace(".", ",")}%`;
    row.append(name, average);
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
    info.append(createTextElement("p", "source-name", source.name));
    info.append(createTextElement("span", "source-status", source.isActive ? "Ativa" : "Desativada"));

    const actions = document.createElement("div");
    actions.className = "source-actions";

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

    actions.append(editButton, toggleButton);
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
    info.append(createTextElement("p", "subject-name", subject.name));
    info.append(createTextElement("span", "subject-status", subject.isActive ? "Ativa" : "Desativada"));

    const actions = document.createElement("div");
    actions.className = "subject-actions";

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

  if (nextScreen === "today") {
    renderToday().catch((error) => console.error("Falha ao atualizar a tela Hoje.", error));
  }

  if (nextScreen === "stats") {
    renderStats().catch((error) => console.error("Falha ao atualizar as estatísticas.", error));
  }
  if (nextScreen === "register") {
    Promise.all([renderSubjects(), renderSources()]).catch((error) => {
      console.error("Falha ao carregar cadastro.", error);
    });
  }
  if (nextScreen === "settings") {
    renderSettings().catch((error) => console.error("Falha ao carregar configurações.", error));
  }
}

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

  try {
    if (action === "edit-subject") {
      const nextName = window.prompt("Novo nome da disciplina:", currentName);
      if (nextName === null) return;
      await DB.subjects.update(subjectId, { name: nextName });
    }

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

sourceList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  const row = event.target.closest(".source-row");
  if (!button || !row) return;

  const sourceId = Number(row.dataset.sourceId);
  const currentName = button.dataset.sourceName;
  const action = button.dataset.action;

  try {
    if (action === "edit-source") {
      const nextName = window.prompt("Novo nome da fonte:", currentName);
      if (nextName === null) return;
      await DB.sources.update(sourceId, { name: nextName });
    }

    if (action === "deactivate-source") {
      await DB.sources.deactivate(sourceId);
    }

    if (action === "activate-source") {
      await DB.sources.update(sourceId, { isActive: true });
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
    score: card.querySelector("[data-score-for]"),
  };
}

function getScoreState(card) {
  const controls = getScoreControls(card);
  const values = getReviewScoreValues(controls.questionsInput.value, controls.correctInput.value);
  controls.correctInput.setCustomValidity(getReviewScoreValidationMessage(values));
  return { ...controls, values };
}

function updateScoreDisplay(card) {
  const { score, values } = getScoreState(card);
  score.textContent = values.scorePercent == null ? "—" : `${values.scorePercent.toFixed(1)}%`;
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
  const sourceId = Number(studySourceSelect.value);
  const studyDate = studyDateInput.value;
  const content = studyContentInput.value.trim();

  if (!subjectId || !sourceId || !studyDate || !content) {
    studyMessage.classList.add("is-error");
    studyMessage.textContent = "Preencha a disciplina, a fonte, a data e o conteúdo.";
    if (!subjectId) subjectSelect.focus();
    else if (!sourceId) studySourceSelect.focus();
    else if (!studyDate) studyDateInput.focus();
    else studyContentInput.focus();
    return;
  }

  try {
    await generateReviewTasks({
      subjectId,
      sourceId,
      studyDate,
      content,
    });
    studyContentInput.value = "";
    studyMessage.textContent = "Estudo salvo. 16 revisões criadas.";
    studyContentInput.focus();
  } catch {
    studyMessage.classList.add("is-error");
    studyMessage.textContent = "Não foi possível salvar o estudo. Tente novamente.";
  }
});

studyDateInput.value = getLocalDateValue();
await renderSubjects();
await renderToday();
showScreen(window.location.hash.slice(1) || DEFAULT_SCREEN);
