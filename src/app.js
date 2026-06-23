import "./styles.css";
import { DB } from "./db.js";

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
const studyForm = document.querySelector("#study-form");
const studyDateInput = document.querySelector("#study-date");
const studyContentInput = document.querySelector("#study-content");
const studySourceInput = document.querySelector("#study-source");
const studyMessage = document.querySelector("#study-message");
const todayDateLabel = document.querySelector("#today-date-label");
const todayEmptyState = document.querySelector("#today-empty-state");
const reviewGroups = {
  overdue: document.querySelector("#block-overdue"),
  today: document.querySelector("#block-today"),
  doneToday: document.querySelector("#block-done-today"),
  tomorrow: document.querySelector("#block-tomorrow"),
};

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

  card.append(createTextElement("h3", "review-content", studyRecord?.content ?? "Conteúdo indisponível"));
  if (studyRecord?.source) {
    card.append(createTextElement("p", "review-source", studyRecord.source));
  }

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

function setSubjectFormVisible(visible) {
  newSubjectForm.hidden = !visible;
  showSubjectFormButton.setAttribute("aria-expanded", String(visible));
  setSubjectMessage();

  if (visible) {
    newSubjectInput.focus();
  }
}

async function renderSubjects(selectedId = subjectSelect.value) {
  const subjects = await DB.subjects.getAll();
  subjectSelect.replaceChildren(new Option("Selecione...", ""));

  for (const subject of subjects) {
    subjectSelect.add(new Option(subject.name, String(subject.id)));
  }

  if (selectedId !== undefined && selectedId !== null) {
    subjectSelect.value = String(selectedId);
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
