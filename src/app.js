import "./styles.css";
import { DB } from "./db.js";
import { Stats } from "./stats.js";

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
const studySourceInput = document.querySelector("#study-source");
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

function createReviewCard(task, studyRecord, subject, groupName) {
  const card = document.createElement("article");
  card.className = "review-card";
  card.dataset.reviewId = String(task.id);

  const topline = document.createElement("div");
  topline.className = "review-card-topline";
  topline.append(createTextElement("p", "review-subject", subject?.name ?? "Sem disciplina"));

  const badgeText = groupName === "overdue"
    ? `Atrasada · R${task.reviewNumber}`
    : groupName === "doneToday"
      ? `Feita · R${task.reviewNumber}`
      : `${groupName === "tomorrow" ? "Amanhã" : "Hoje"} · R${task.reviewNumber}`;
  const badge = createTextElement("span", "review-badge", badgeText);
  if (groupName === "overdue") badge.classList.add("is-overdue");
  if (groupName === "doneToday") badge.classList.add("is-done");
  topline.append(badge);
  card.append(topline);

  const study = document.createElement("div");
  study.className = "review-study";
  study.append(createTextElement("h3", "review-content", studyRecord?.content ?? "Conteúdo indisponível"));
  if (studyRecord?.source) {
    study.append(createTextElement("p", "review-source", studyRecord.source));
  }
  card.append(study);

  const meta = document.createElement("dl");
  meta.className = "review-meta";
  for (const [label, value] of [
    ["Estudado em", formatDate(studyRecord?.studyDate)],
    ["Revisão prevista", formatDate(task.dueDate)],
  ]) {
    const item = document.createElement("div");
    item.append(
      createTextElement("dt", "", label),
      createTextElement("dd", "", value),
    );
    meta.append(item);
  }
  card.append(meta);

  const actions = document.createElement("div");
  actions.className = "review-actions";
  const reviewDoneLabel = document.createElement("label");
  reviewDoneLabel.className = "check-control";
  const reviewDoneInput = document.createElement("input");
  reviewDoneInput.type = "checkbox";
  reviewDoneInput.checked = task.reviewDone;
  reviewDoneInput.dataset.action = "review-done";
  reviewDoneInput.dataset.reviewId = String(task.id);
  reviewDoneLabel.append(reviewDoneInput, document.createTextNode("Rev feita"));

  const questionsDoneLabel = document.createElement("label");
  questionsDoneLabel.className = "check-control";
  const questionsDoneInput = document.createElement("input");
  questionsDoneInput.type = "checkbox";
  questionsDoneInput.checked = task.questionsDone;
  questionsDoneInput.dataset.action = "questions-done";
  questionsDoneInput.dataset.reviewId = String(task.id);
  questionsDoneLabel.append(questionsDoneInput, document.createTextNode("Q feita"));

  const exerciseControls = document.createElement("div");
  exerciseControls.className = "exercise-controls";
  for (const [field, label, value] of [
    ["questionsCount", "Questões", task.questionsCount],
    ["correctCount", "Acertos", task.correctCount],
  ]) {
    const fieldLabel = document.createElement("label");
    fieldLabel.className = "number-control";
    fieldLabel.append(createTextElement("span", "", label));
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.step = "1";
    input.inputMode = "numeric";
    input.value = value ?? "";
    input.dataset.action = "score-input";
    input.dataset.field = field;
    input.dataset.reviewId = String(task.id);
    input.setAttribute("aria-label", `${label} da revisão R${task.reviewNumber}`);
    fieldLabel.append(input);
    exerciseControls.append(fieldLabel);
  }
  const score = createTextElement(
    "span",
    "score-value",
    task.scorePercent == null ? "—" : `${Number(task.scorePercent).toFixed(1)}%`,
  );
  score.dataset.scoreFor = String(task.id);
  score.setAttribute("aria-label", "Percentual de acertos");
  exerciseControls.append(score);

  const commentLabel = document.createElement("label");
  commentLabel.className = "comment-control";
  commentLabel.append(createTextElement("span", "", "Comentário"));
  const commentInput = document.createElement("textarea");
  commentInput.rows = 2;
  commentInput.maxLength = 500;
  commentInput.value = task.comment ?? "";
  commentInput.placeholder = "Anote uma dúvida ou ponto importante";
  commentInput.dataset.action = "comment";
  commentInput.dataset.reviewId = String(task.id);
  commentInput.setAttribute("aria-label", `Comentário da revisão R${task.reviewNumber}`);
  commentLabel.append(commentInput);

  actions.append(reviewDoneLabel, questionsDoneLabel, exerciseControls, commentLabel);
  card.append(actions);
  return card;
}

export async function renderToday() {
  const today = getLocalDateValue();
  const tomorrow = getTomorrowValue(today);
  const [overdue, dueToday, doneToday, dueTomorrow, studyRecords, subjects] = await Promise.all([
    DB.reviewTasks.getOverdue(today),
    DB.reviewTasks.getForToday(today),
    DB.reviewTasks.getCompletedToday(today),
    DB.reviewTasks.getTomorrow(tomorrow),
    DB.studyRecords.getAll(),
    DB.subjects.getAll(),
  ]);
  const studiesById = new Map(studyRecords.map((record) => [record.id, record]));
  const subjectsById = new Map(subjects.map((subject) => [subject.id, subject]));
  const groups = { overdue, today: dueToday, doneToday, tomorrow: dueTomorrow };
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
      list.append(createReviewCard(task, studyRecord, subject, groupName));
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

const REVIEW_DAY_OFFSETS = [
  1, 7, 15, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 360, 390,
];

export function generateReviewDates(studyDate) {
  const baseDate = new Date(`${studyDate}T00:00:00.000Z`);
  if (Number.isNaN(baseDate.getTime())) {
    throw new Error("A data de estudo é inválida.");
  }

  return REVIEW_DAY_OFFSETS.map((offset) => {
    const reviewDate = new Date(baseDate);
    reviewDate.setUTCDate(reviewDate.getUTCDate() + offset);
    return reviewDate.toISOString().slice(0, 10);
  });
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
    renderSubjects().catch((error) => console.error("Falha ao carregar disciplinas.", error));
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

reviewDashboard.addEventListener("change", async (event) => {
  const input = event.target.closest('[data-action="review-done"]');
  if (!input) return;

  input.disabled = true;
  try {
    await DB.reviewTasks.update(Number(input.dataset.reviewId), {
      reviewDone: input.checked,
      completedAt: input.checked ? new Date().toISOString() : null,
    });
    await renderToday();
  } catch (error) {
    input.checked = !input.checked;
    input.disabled = false;
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
  await DB.reviewTasks.update(Number(input.dataset.reviewId), {
    comment: input.value.trim() || null,
  });
});

function getScoreValues(card) {
  const questionsInput = card.querySelector('[data-field="questionsCount"]');
  const correctInput = card.querySelector('[data-field="correctCount"]');
  const questionsCount = questionsInput.value === "" ? null : Math.max(0, Number.parseInt(questionsInput.value, 10) || 0);
  const correctCount = correctInput.value === "" ? null : Math.max(0, Number.parseInt(correctInput.value, 10) || 0);
  const scorePercent = questionsCount > 0
    ? ((correctCount ?? 0) / questionsCount) * 100
    : null;
  return { questionsCount, correctCount, scorePercent };
}

function updateScoreDisplay(card) {
  const values = getScoreValues(card);
  const score = card.querySelector("[data-score-for]");
  score.textContent = values.scorePercent == null ? "—" : `${values.scorePercent.toFixed(1)}%`;
  return values;
}

reviewDashboard.addEventListener("input", (event) => {
  if (!event.target.matches('[data-action="score-input"]')) return;
  updateScoreDisplay(event.target.closest(".review-card"));
});

reviewDashboard.addEventListener("focusout", async (event) => {
  const input = event.target.closest('[data-action="score-input"]');
  if (!input) return;
  const card = input.closest(".review-card");
  await DB.reviewTasks.update(Number(input.dataset.reviewId), updateScoreDisplay(card));
});

reviewDashboard.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || !event.target.matches('[data-action="score-input"]')) return;
  event.preventDefault();
  event.target.blur();
});

reviewDashboard.addEventListener("change", async (event) => {
  const input = event.target.closest('[data-action="questions-done"]');
  if (!input) return;
  await DB.reviewTasks.update(Number(input.dataset.reviewId), {
    questionsDone: input.checked,
  });
});

studyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  studyMessage.classList.remove("is-error");
  studyMessage.textContent = "";

  const subjectId = Number(subjectSelect.value);
  const studyDate = studyDateInput.value;
  const content = studyContentInput.value.trim();

  if (!subjectId || !studyDate || !content) {
    studyMessage.classList.add("is-error");
    studyMessage.textContent = "Preencha a disciplina, a data e o conteúdo.";
    if (!subjectId) subjectSelect.focus();
    else if (!studyDate) studyDateInput.focus();
    else studyContentInput.focus();
    return;
  }

  try {
    await generateReviewTasks({
      subjectId,
      studyDate,
      content,
      source: studySourceInput.value.trim(),
    });
    studyContentInput.value = "";
    studySourceInput.value = "";
    studyDateInput.value = getLocalDateValue();
    studyMessage.textContent = "Estudo salvo! Revisões geradas.";
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
