// Materiais: upload a PDF, say WHAT to study, approve the source scope, generate an AI draft and edit it as a lesson.
// The flow is topic-first (the student does not walk 165 cards): upload -> "O que você quer estudar?" -> located sections ->
// generate -> the lesson editor (Resumo / Questões / Fonte / Revisão), which REPLACES the list on screen — the rest of the
// book is never a vertical continuation of the lesson being edited. What belongs to other screens is passed in once through
// configureMaterialsUI.
import * as SourceProposalsUI from "./source-proposals-ui.js";
import { formatNumber } from "./i18n/format.js";
import { t } from "./i18n/index.js";
import * as DraftReviewUI from "./draft-review-ui.js";
import { createTextElement } from "./dom-utils.js";
import { createLessonEditor } from "./lesson-editor-ui.js";
import * as GenerationJobsUI from "./generation-jobs-ui.js";
import {
  elapsedLabel, jobIsActive, latestJobsByProposal, jobPhaseLabel, jobElapsedMs, jobFailureMessage, jobListStatus,
} from "./lesson-view-model.js";

const sourcesCard = document.querySelector("#sources-card");
const sourcesChooseFileButton = document.querySelector("#sources-choose-file");
const sourcesFileInput = document.querySelector("#sources-file-input");
const sourcesMessage = document.querySelector("#sources-message");
const sourcesProposalsPanel = document.querySelector("#sources-proposals-panel");
const sourcesProposalsList = document.querySelector("#sources-proposals-list");
const sourcesCoverageNote = document.querySelector("#sources-coverage-note");
const topicForm = document.querySelector("#sources-topic-form");
const topicInput = document.querySelector("#sources-topic-input");
const topicResults = document.querySelector("#sources-topic-results");
const draftsBox = document.querySelector("#sources-drafts");
const draftsList = document.querySelector("#sources-drafts-list");
const indexDetails = document.querySelector("#sources-index");
const indexSummary = document.querySelector("#sources-index-summary");
const editorialDetails = document.querySelector("#sources-editorial");
const editorialSummary = document.querySelector("#sources-editorial-summary");
const editorialList = document.querySelector("#sources-editorial-list");
const generationBox = document.querySelector("#sources-generation");
const editorView = document.querySelector("#sources-editor-view");
const existingBox = document.querySelector("#sources-existing");
const existingList = document.querySelector("#sources-existing-list");

// "1 trecho proposto" / "N trechos propostos" (0 too: only 1 is singular, unlike the pt-BR plural category tn() would pick).
function proposedText(count, note) {
  const form = count === 1 ? "one" : "other";
  return note
    ? t(`materials.upload.proposedWithNote.${form}`, { count, note })
    : t(`materials.upload.proposed.${form}`, { count });
}

// What Materiais needs from the rest of the app (set once at start-up, before any user event can fire):
//   listActiveSubjects()  -> Promise<subject[]>   disciplines offered when accepting a draft
//   getLocalDateValue()   -> "YYYY-MM-DD"         default date of the lesson
//   startStudyNow(unit, subjectName)               "Estudar agora" right after an accept
//   openSummary(unitId)                            "Abrir Resumo": Plano with that lesson open
//   refreshAfterAccept()  -> Promise               refresh Disciplinas, Plano and Hoje once a unit exists
let deps = null;
export function configureMaterialsUI(next) {
  deps = next;
}

let currentSourceId = null;
let activeEditor = null;
// The proposals as last shown (each with its newest generation job as `latestJob`), and the one generation whose progress panel
// is open (`watched`). The server owns every state: this is only what the screen last read.
let currentProposals = [];
let watched = null;
let pollTimer = null;
let pollRunning = false;
const POLL_WATCHING_MS = 1000; // the progress panel is open: the student is waiting for it
const POLL_WATCHING_QUICK_MS = 400; // ...and right after it opens, a generation that ends at once is shown at once
const POLL_QUICK_TICKS = 5;
const POLL_BACKGROUND_MS = 3000; // only the list shows it
const POLL_FIRST_MS = 250;
// Index sections up to this size are shown open; a whole book stays collapsed behind the topic search.
const INDEX_OPEN_UP_TO = 12;

function setSourcesMessage(message = "", isError = false) {
  if (!sourcesMessage) return;
  sourcesMessage.classList.toggle("is-error", isError);
  sourcesMessage.textContent = message;
  // An error raised far below must not be left off-screen, or the student clicks and sees nothing happen.
  if (isError && message) sourcesMessage.scrollIntoView({ block: "nearest" });
}

const nf = { format: (value) => formatNumber(value) }; // resolved per call so the active locale applies
const rangeLabel = (a, b) => (a === b ? t("materials.range.pdfPage", { page: a }) : t("materials.range.pdfPages", { start: a, end: b }));
const KIND_LABEL_KEYS = {
  FRONT_MATTER: "materials.kind.frontMatter", COPYRIGHT: "materials.kind.copyright", DEDICATION: "materials.kind.dedication",
  PREFACE: "materials.kind.preface", ACKNOWLEDGMENTS: "materials.kind.acknowledgments", SUMMARY: "materials.kind.summary",
  EXERCISE: "materials.kind.exercise", ANSWER_KEY: "materials.kind.answerKey", REFERENCE: "materials.kind.reference",
  APPENDIX: "materials.kind.appendix", OTHER: "materials.kind.other",
};
const notStudyNote = (kind) => t("materials.kind.noDraft", { label: t(KIND_LABEL_KEYS[kind] ?? "materials.kind.notStudy") });

// ---- views -------------------------------------------------------------------------------------------------------------
async function showBrowse() {
  const leftProposalId = activeEditor?.getDraft().proposalId;
  activeEditor?.destroy();
  activeEditor = null;
  editorView?.replaceChildren();
  if (editorView) editorView.hidden = true;
  if (sourcesCard) sourcesCard.hidden = false;
  // The list must tell the truth about what exists now (a draft was just created or an accept happened).
  await refreshProposals();
  // Focus goes back to the unit the student just left (its draft is listed in "Rascunhos em andamento" or in the index), not to a far-away button.
  const visible = (el) => Boolean(el) && el.getClientRects().length > 0;
  const back = [draftsList?.querySelector(`[data-proposal-id="${leftProposalId}"] [data-action]`), sourcesProposalsList?.querySelector(`[data-proposal-id="${leftProposalId}"] [data-action="open-draft"]`)].find(visible);
  (back ?? sourcesChooseFileButton)?.focus({ preventScroll: false });
}

async function openEditor(draft, title) {
  closeProgressPanel();
  const subjects = await deps.listActiveSubjects().catch(() => []);
  activeEditor?.destroy();
  const editor = createLessonEditor({
    draft,
    title,
    subjects,
    today: deps.getLocalDateValue(),
    deps: {
      reviseSummary: DraftReviewUI.reviseSummary,
      reviseQuestion: DraftReviewUI.reviseQuestion,
      deleteQuestion: DraftReviewUI.deleteQuestion,
      acceptDraft: DraftReviewUI.acceptDraft,
      previewAcceptance: DraftReviewUI.previewAcceptance,
      reauditDraft: DraftReviewUI.reauditDraft,
      getDraft: DraftReviewUI.getDraft,
      onBack: showBrowse,
      startStudyNow: (unit, subjectName) => deps.startStudyNow(unit, subjectName),
      openSummary: (unitId) => deps.openSummary(unitId),
      refreshAfterAccept: () => deps.refreshAfterAccept(),
    },
  });
  activeEditor = editor;
  editorView.replaceChildren(editor.element);
  editorView.hidden = false;
  if (sourcesCard) sourcesCard.hidden = true;
  editor.focusTitle();
  editorView.scrollIntoView({ block: "start" });
}

// ---- generation (a job on the server: the student can leave and come back; every state shown is read from the server) ---------
const progressTitle = (title) => t("materials.progress.title", { title });

/** The trechos with their newest generation job as `latestJob`. A job list that cannot be read leaves them without one (never invents one). */
async function withJobs(proposals) {
  const result = await GenerationJobsUI.listJobs();
  const latest = result.ok ? latestJobsByProposal(result.jobs) : new Map();
  return proposals.map((proposal) => ({ ...proposal, latestJob: latest.get(proposal.id) ?? null }));
}

async function showProposals(proposals) {
  renderSourceProposals(await withJobs(proposals));
  ensurePolling();
}

/** Reads the open document's trechos and jobs again from the server and shows them. */
async function refreshProposals() {
  if (!currentSourceId) return;
  const listed = await SourceProposalsUI.listProposals(currentSourceId);
  if (listed.ok) await showProposals(listed.proposals);
}

// -- polling: one timer at a time, only while something is generating and Materiais is on screen --------------------------------
const cardVisible = () => Boolean(sourcesCard) && sourcesCard.getClientRects().length > 0;
const wantsPolling = () => watched !== null || currentProposals.some((p) => jobIsActive(p.latestJob));

function stopPolling() {
  clearTimeout(pollTimer);
  pollTimer = null;
}

function ensurePolling(delay = POLL_FIRST_MS) {
  if (pollTimer !== null || pollRunning || activeEditor || !wantsPolling()) return;
  pollTimer = setTimeout(runPoll, delay);
}

async function runPoll() {
  pollTimer = null;
  // Nothing to update while the student is elsewhere or in the editor: coming back to the list starts it again.
  if (activeEditor || !cardVisible()) return;
  pollRunning = true;
  try {
    await pollJobs();
  } finally {
    pollRunning = false;
  }
  if (watched) watched.polls = (watched.polls ?? 0) + 1;
  ensurePolling(!watched ? POLL_BACKGROUND_MS : watched.polls <= POLL_QUICK_TICKS ? POLL_WATCHING_QUICK_MS : POLL_WATCHING_MS);
}

async function pollJobs() {
  const result = await GenerationJobsUI.listJobs();
  if (!result.ok) return; // a network blip: the screen keeps what it last knew and tries again at the next tick
  const latest = latestJobsByProposal(result.jobs);
  const finished = [];
  for (const proposal of currentProposals) {
    const job = latest.get(proposal.id) ?? null;
    if (jobIsActive(proposal.latestJob) && !jobIsActive(job) && proposal.id !== watched?.proposalId) finished.push({ proposal, job });
  }
  let proposals = currentProposals.map((proposal) => ({ ...proposal, latestJob: latest.get(proposal.id) ?? null }));
  if (finished.length > 0 && currentSourceId) {
    // a job ended: its draft (or nothing, if it failed) is a fact of the trecho, read it from the server
    const listed = await SourceProposalsUI.listProposals(currentSourceId);
    if (listed.ok) proposals = listed.proposals.map((proposal) => ({ ...proposal, latestJob: latest.get(proposal.id) ?? null }));
  }
  applyProposals(proposals);
  for (const { proposal, job } of finished) {
    if (job?.state === "SUCCEEDED") setSourcesMessage(t("materials.generation.finished", { title: proposal.title }));
    else if (job?.state === "FAILED") setSourcesMessage(jobFailureMessage(job), true);
  }
  if (watched) {
    const job = result.jobs.find((candidate) => candidate.id === watched.job.id);
    if (!job) return;
    if (jobIsActive(job)) {
      watched.job = job;
      renderProgress();
    } else {
      await concludeWatched(job);
    }
  }
}

// -- the progress panel of the generation the student is waiting for ------------------------------------------------------------
function openProgressPanel(job, proposalId, title) {
  closeProgressPanel();
  const heading = createTextElement("p", "sources-generation-title", progressTitle(title));
  heading.tabIndex = -1;
  const timer = createTextElement("p", "sources-generation-timer", elapsedLabel(jobElapsedMs(job, Date.now())));
  timer.setAttribute("aria-hidden", "true"); // ticks every second: not announced
  const phase = createTextElement("p", "sources-generation-phase", jobPhaseLabel(job));
  phase.setAttribute("role", "status"); // announced when the REAL phase changes, not every second
  const stalled = createTextElement("p", "lesson-hint sources-generation-stalled", "");
  stalled.setAttribute("role", "status");
  const note = createTextElement("p", "lesson-hint", t("materials.progress.note"));
  const actions = document.createElement("div");
  actions.className = "sources-generation-actions";
  const background = createTextElement("button", "small-button", t("materials.progress.background"));
  background.type = "button";
  background.dataset.action = "generation-background";
  const cancel = createTextElement("button", "small-button is-danger", t("materials.progress.cancel"));
  cancel.type = "button";
  cancel.dataset.action = "generation-cancel";
  actions.append(background, cancel);
  generationBox.replaceChildren(heading, timer, phase, stalled, note, actions);
  generationBox.hidden = false;
  const ticker = setInterval(() => { timer.textContent = elapsedLabel(jobElapsedMs(watched?.job ?? job, Date.now())); }, 1000);
  watched = { job, proposalId, title, ticker, elements: { timer, phase, stalled, cancel } };
  setBusy(true);
  heading.focus({ preventScroll: false });
  stopPolling();
  ensurePolling(POLL_FIRST_MS);
}

function renderProgress() {
  if (!watched) return;
  const { job, elements } = watched;
  const phaseText = watched.cancelling ? t("materials.progress.cancelling") : jobPhaseLabel(job);
  if (elements.phase.textContent !== phaseText) elements.phase.textContent = phaseText;
  const stalledText = job.state === "STALLED"
    ? t("materials.progress.stalled")
    : "";
  if (elements.stalled.textContent !== stalledText) elements.stalled.textContent = stalledText;
}

function closeProgressPanel() {
  if (watched) clearInterval(watched.ticker);
  watched = null;
  generationBox.hidden = true;
  generationBox.replaceChildren();
  setBusy(false);
}

/** The job the panel was waiting for ended: the draft opens, or the student is told why not. */
async function concludeWatched(job) {
  const { title, proposalId } = watched;
  closeProgressPanel();
  if (job.state === "SUCCEEDED") {
    const draft = await DraftReviewUI.getDraft(job.draftId);
    if (draft.ok) {
      await openEditor(draft.draft, title);
      setSourcesMessage(t("materials.generation.draftReady"));
      return;
    }
    setSourcesMessage(draft.message || t("materials.draft.openFailed"), true);
  } else if (job.state === "FAILED") {
    setSourcesMessage(jobFailureMessage(job), true);
  } else {
    setSourcesMessage(t("materials.generation.cancelled"));
  }
  await refreshProposals();
  focusProposalAction(proposalId);
}

function focusProposalAction(proposalId) {
  const item = sourcesProposalsList?.querySelector(`[data-proposal-id="${proposalId}"]`);
  (item?.querySelector('[data-action="generate-draft"], [data-action="open-draft"]') ?? topicInput)?.focus({ preventScroll: true });
}

async function continueInBackground() {
  if (!watched) return;
  const { proposalId } = watched;
  closeProgressPanel();
  await refreshProposals();
  setSourcesMessage(t("materials.generation.inBackground"));
  const item = sourcesProposalsList?.querySelector(`[data-proposal-id="${proposalId}"]`);
  (item?.querySelector('[data-action="show-generation"]') ?? sourcesChooseFileButton)?.focus({ preventScroll: true });
}

async function cancelWatched() {
  if (!watched) return;
  const { cancel } = watched.elements;
  if (!window.confirm(t("materials.progress.cancelConfirm"))) {
    cancel.focus({ preventScroll: true });
    return;
  }
  const { job } = watched;
  cancel.disabled = true;
  watched.cancelling = true; // the server answers once the provider has really stopped, which can take a few seconds
  renderProgress();
  const result = await GenerationJobsUI.cancelJob(job.id);
  if (watched?.job.id !== job.id) return; // it ended some other way while the student was confirming
  if (!result.ok) {
    watched.cancelling = false;
    renderProgress();
    cancel.disabled = false;
    setSourcesMessage(result.message || t("materials.progress.cancelFailed"), true);
    return;
  }
  await concludeWatched(result.job);
}

generationBox?.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  if (button.dataset.action === "generation-background") continueInBackground();
  else if (button.dataset.action === "generation-cancel") cancelWatched();
});

let starting = false;
async function generateFor(proposal) {
  if (watched || starting) return;
  starting = true;
  setSourcesMessage("");
  setBusy(true);
  let created;
  try {
    created = await GenerationJobsUI.createJob(proposal.id);
  } finally {
    starting = false;
  }
  if (!created.ok) {
    setBusy(false);
    setSourcesMessage(created.message || t("materials.generation.startFailed"), true);
    focusProposalAction(proposal.id);
    return;
  }
  openProgressPanel(created.job, proposal.id, proposal.title);
}

/** "Ver andamento": reopens the progress panel of a trecho that is generating in the background. */
async function showGenerationOf(proposalId, title) {
  if (watched || starting) return;
  const proposal = currentProposals.find((p) => p.id === Number(proposalId));
  if (!jobIsActive(proposal?.latestJob)) {
    await refreshProposals(); // it ended meanwhile: the list says how
    return;
  }
  openProgressPanel(proposal.latestJob, proposal.id, title ?? proposal.title);
}

function setBusy(busy) {
  for (const control of sourcesProposalsPanel?.querySelectorAll("button, input") ?? []) control.disabled = busy;
}

// ---- proposal index ----------------------------------------------------------------------------------------------------
function createSourceProposalItem(proposal) {
  const li = document.createElement("li");
  li.className = "source-proposal-item";
  li.dataset.proposalId = String(proposal.id);

  const rangeText = proposal.pageStart === proposal.pageEnd ? t("materials.range.page", { page: proposal.pageStart }) : t("materials.range.pages", { start: proposal.pageStart, end: proposal.pageEnd });
  const range = createTextElement("p", "source-proposal-range", rangeText);
  range.id = `source-proposal-range-${proposal.id}`;

  const titleInput = document.createElement("input");
  titleInput.type = "text";
  titleInput.className = "source-proposal-title-input";
  titleInput.value = proposal.title;
  // The field has no visible label: its accessible name says what it edits, and which trecho (the list repeats it).
  titleInput.setAttribute("aria-label", t("materials.proposal.titleLabel", { range: rangeText.toLowerCase() }));

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "small-button";
  saveBtn.dataset.action = "save-proposal-title";
  saveBtn.textContent = t("materials.proposal.saveTitle");

  const toggleBtn = document.createElement("button");
  toggleBtn.type = "button";
  toggleBtn.className = "text-button";
  toggleBtn.dataset.action = "toggle-proposal-excerpt";
  toggleBtn.setAttribute("aria-expanded", "false"); // a disclosure: expose whether the excerpt is open
  toggleBtn.textContent = t("materials.proposal.showExcerpt");

  const excerpt = createTextElement("p", "source-proposal-excerpt", proposal.excerpt);
  excerpt.hidden = true;

  // The same buttons repeat in every trecho: the pages of the trecho they belong to are their description.
  for (const button of [saveBtn, toggleBtn]) button.setAttribute("aria-describedby", range.id);
  // What comes after is what the trecho DOES now (generate / generating / ready / failed): it is redrawn when the server says its job moved.
  const slot = document.createElement("div");
  slot.className = "source-proposal-slot";
  // The save confirmation lives next to the field it is about (the page-level line can be far off-screen). The live region exists
  // empty BEFORE the save: a region inserted together with its text is not announced.
  const saved = createTextElement("p", "source-proposal-saved", "");
  saved.setAttribute("role", "status");
  titleInput.addEventListener("input", () => { saved.textContent = ""; }); // an edit makes "Título salvo" stale
  li.append(range, titleInput, saveBtn, saved, toggleBtn, excerpt, slot);
  if (!proposal.generatable) li.classList.add("is-editorial");
  renderActionSlot(li, proposal);
  return li;
}

/** Everything that tells two states of a trecho apart on screen: when it changes, its slot is redrawn. */
const proposalSignature = (p) => JSON.stringify([p.generatable, p.latestDraft?.id, p.latestDraft?.status, p.latestJob?.id, p.latestJob?.state, p.latestJob?.phase]);

function statusLine(status) {
  const line = createTextElement("p", `source-job-status is-${status.kind}`, status.label);
  line.dataset.jobStatus = status.kind;
  return line;
}

function actionButton(label, action, rangeId) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "small-button";
  button.dataset.action = action;
  button.textContent = label;
  if (rangeId) button.setAttribute("aria-describedby", rangeId);
  return button;
}

function renderActionSlot(li, proposal) {
  const slot = li.querySelector(".source-proposal-slot");
  const rangeId = li.querySelector(".source-proposal-range")?.id;
  const hadFocus = slot.contains(document.activeElement);
  const job = proposal.latestJob ?? null;
  const status = jobListStatus(job);
  const parts = [];
  if (!proposal.generatable) {
    parts.push(createTextElement("p", "lesson-hint", notStudyNote(proposal.kind)));
  } else if (proposal.latestDraft?.status === "ACCEPTED") {
    parts.push(createTextElement("p", "lesson-hint", t("materials.proposal.lessonCreated")));
    // the lesson exists: its Resumo is one click away (only offered while the server says the lesson is still there)
    if (proposal.latestDraft.acceptedUnitId != null && deps.openSummary) {
      const open = actionButton(t("materials.action.openSummary"), "open-summary", rangeId);
      open.dataset.unitId = String(proposal.latestDraft.acceptedUnitId);
      parts.push(open);
    }
  } else if (status?.kind === "generating") {
    parts.push(statusLine(status));
    if (status.stalled) parts.push(createTextElement("p", "lesson-hint", t("materials.proposal.stalledHint")));
    const show = actionButton(t("materials.action.showProgress"), "show-generation", rangeId);
    show.dataset.jobId = String(job.id);
    parts.push(show);
  } else if (proposal.latestDraft) {
    if (status?.kind === "ready" && job.draftId === proposal.latestDraft.id) parts.push(statusLine(status));
    const open = actionButton(t("materials.action.openDraft"), "open-draft", rangeId);
    open.dataset.draftId = String(proposal.latestDraft.id);
    parts.push(open);
  } else {
    if (status?.kind === "failed") {
      parts.push(statusLine(status), createTextElement("p", "lesson-hint", jobFailureMessage(job)));
    }
    parts.push(actionButton(status?.kind === "failed" ? t("materials.action.retry") : t("materials.action.generate"), "generate-draft", rangeId));
  }
  slot.replaceChildren(...parts);
  li.dataset.signature = proposalSignature(proposal);
  if (hadFocus) slot.querySelector("button")?.focus({ preventScroll: true }); // a redrawn button must not drop keyboard focus
}

/** The server moved a job: only the trechos whose state changed are redrawn (an open excerpt or an edited title elsewhere stays as it is). */
function applyProposals(proposals) {
  currentProposals = proposals;
  const byId = new Map(proposals.map((p) => [String(p.id), p]));
  for (const li of sourcesProposalsPanel?.querySelectorAll(".source-proposal-item") ?? []) {
    const proposal = byId.get(li.dataset.proposalId);
    if (proposal && li.dataset.signature !== proposalSignature(proposal)) renderActionSlot(li, proposal);
  }
  renderDraftsInProgress(proposals);
  if (watched) setBusy(true);
}

// Units with an unaccepted draft, or a generation going on or failed, are listed apart from the (often collapsed) index:
// work in progress must never hide inside a 100-unit list.
function renderDraftsInProgress(proposals) {
  if (!draftsList) return;
  const focused = draftsList.contains(document.activeElement) ? document.activeElement : null;
  const wasFocused = focused ? { proposalId: focused.closest("li")?.dataset.proposalId } : null;
  draftsList.replaceChildren();
  const open = proposals.filter((p) => {
    if (!p.generatable || p.latestDraft?.status === "ACCEPTED") return false;
    const kind = jobListStatus(p.latestJob)?.kind;
    return Boolean(p.latestDraft) || kind === "generating" || kind === "failed";
  });
  for (const proposal of open) {
    const li = document.createElement("li");
    li.className = "source-draft-item";
    li.dataset.proposalId = String(proposal.id);
    const rangeText = proposal.pageStart === proposal.pageEnd ? t("materials.range.pageLower", { page: proposal.pageStart }) : t("materials.range.pagesLower", { start: proposal.pageStart, end: proposal.pageEnd });
    const title =createTextElement("span", "source-draft-item-title", proposal.title);
    const range = createTextElement("span", "lesson-hint", rangeText);
    const status = jobListStatus(proposal.latestJob);
    const generating = status?.kind === "generating";
    const failed = !generating && !proposal.latestDraft && status?.kind === "failed";
    const ready = !generating && status?.kind === "ready" && proposal.latestJob.draftId === proposal.latestDraft?.id;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "small-button";
    button.dataset.title = proposal.title;
    if (generating) {
      button.dataset.action = "show-generation";
      button.textContent = t("materials.action.showProgress");
      button.setAttribute("aria-label", t("materials.draft.showProgressLabel", { title: proposal.title, range: rangeText }));
    } else if (failed) {
      button.dataset.action = "retry-generation";
      button.textContent = t("materials.action.retry");
      button.setAttribute("aria-label", t("materials.draft.retryLabel", { title: proposal.title, range: rangeText }));
    } else {
      button.dataset.action = "open-draft-in-progress";
      button.dataset.draftId = String(proposal.latestDraft.id);
      button.textContent = t("materials.action.openDraft");
      button.setAttribute("aria-label", t("materials.draft.openLabel", { title: proposal.title, range: rangeText }));
    }
    li.append(title, range);
    if (generating || failed || ready) li.append(statusLine(status));
    li.append(button);
    draftsList.append(li);
  }
  if (draftsBox) draftsBox.hidden = open.length === 0;
  if (wasFocused) draftsList.querySelector(`[data-proposal-id="${wasFocused.proposalId}"] [data-action]`)?.focus({ preventScroll: true });
}

draftsList?.addEventListener("click", async (event) => {
  const show = event.target.closest('[data-action="show-generation"]');
  if (show) {
    await showGenerationOf(show.closest("li").dataset.proposalId, show.dataset.title);
    return;
  }
  const retry = event.target.closest('[data-action="retry-generation"]');
  if (retry) {
    const proposal = currentProposals.find((p) => p.id === Number(retry.closest("li").dataset.proposalId));
    if (proposal) await generateFor(proposal);
    return;
  }
  const button = event.target.closest('[data-action="open-draft-in-progress"]');
  if (!button) return;
  button.disabled = true;
  const result = await DraftReviewUI.getDraft(button.dataset.draftId);
  button.disabled = false;
  if (!result.ok) {
    setSourcesMessage(result.message || t("materials.draft.openFailed"), true);
    return;
  }
  await openEditor(result.draft, button.dataset.title ?? t("materials.draft.fallbackTitle"));
});

function renderSourceProposals(proposals) {
  currentProposals = proposals;
  if (!sourcesProposalsList) return;
  sourcesProposalsList.replaceChildren();
  editorialList?.replaceChildren();
  const content = proposals.filter((p) => p.generatable);
  const editorial = proposals.filter((p) => !p.generatable);
  for (const proposal of content) sourcesProposalsList.append(createSourceProposalItem(proposal));
  for (const proposal of editorial) editorialList?.append(createSourceProposalItem(proposal));
  // content.length can be 0: the singular is chosen explicitly (tn would treat 0 as singular in pt-BR)
  if (indexSummary) indexSummary.textContent = content.length === 1 ? t("materials.index.summary.one", { count: content.length }) : t("materials.index.summary.other", { count: content.length });
  if (indexDetails) indexDetails.open = content.length <= INDEX_OPEN_UP_TO;
  if (editorialDetails) {
    editorialDetails.hidden = editorial.length === 0;
    editorialDetails.open = false;
    if (editorialSummary) editorialSummary.textContent = t("materials.editorial.summary", { count: editorial.length });
  }
  if (sourcesProposalsPanel) sourcesProposalsPanel.hidden = proposals.length === 0;
  renderDraftsInProgress(proposals);
  topicResults?.replaceChildren();
  if (watched) setBusy(true);
}

// ---- topic search ------------------------------------------------------------------------------------------------------
function createTopicItem(candidate, query) {
  const li = document.createElement("li");
  li.className = "source-topic-item";
  li.dataset.ordinal = String(candidate.ordinal);
  li.append(createTextElement("p", "source-topic-title", candidate.title));
  li.append(createTextElement("p", "source-proposal-range", t("materials.topic.rangeChars", { range: rangeLabel(candidate.pageStart, candidate.pageEnd), chars: nf.format(candidate.chars) })));
  if (candidate.excerpt) li.append(createTextElement("p", "source-topic-excerpt", candidate.excerpt));
  if (candidate.generatable) {
    const generate = document.createElement("button");
    generate.type = "button";
    generate.className = "small-button";
    generate.dataset.action = "generate-topic";
    generate.dataset.query = query;
    generate.textContent = t("materials.action.generate");
    li.append(generate);
  } else {
    li.append(createTextElement("p", "lesson-hint", notStudyNote(candidate.kind)));
  }
  return li;
}

topicForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentSourceId) return;
  const query = topicInput.value.trim();
  if (query.length < 2) {
    setSourcesMessage(t("materials.topic.tooShort"), true);
    return;
  }
  setSourcesMessage(t("materials.topic.searching"));
  const result = await SourceProposalsUI.searchTopics(currentSourceId, query);
  if (!result.ok) {
    setSourcesMessage(result.message || t("materials.topic.searchFailed"), true);
    return;
  }
  topicResults.replaceChildren();
  if (result.candidates.length === 0) {
    setSourcesMessage(t("materials.topic.none"), true);
    return;
  }
  for (const candidate of result.candidates) topicResults.append(createTopicItem(candidate, query));
  const found = result.candidates.length; // >= 1 here, the plural form is still chosen explicitly to mirror the old ternary
  setSourcesMessage(found === 1 ? t("materials.topic.found.one", { count: found }) : t("materials.topic.found.other", { count: found }));
});

topicResults?.addEventListener("click", async (event) => {
  const button = event.target.closest('[data-action="generate-topic"]');
  if (!button) return;
  const item = button.closest(".source-topic-item");
  const ordinal = Number(item.dataset.ordinal);
  button.disabled = true;
  const approved = await SourceProposalsUI.approveScope(currentSourceId, { ordinal, topic: button.dataset.query });
  button.disabled = false;
  if (!approved.ok) {
    setSourcesMessage(approved.message || t("materials.topic.approveFailed"), true);
    button.focus({ preventScroll: true });
    return;
  }
  await generateFor(approved.proposal);
});

// ---- documents already uploaded: reopen instead of sending the same PDF again ------------------------------------------------
async function loadExistingSources() {
  if (!existingBox) return;
  const result = await SourceProposalsUI.listSources();
  if (!result.ok) return;
  const ready = result.sources.filter((s) => s.extractionStatus === "EXTRACTED");
  existingList.replaceChildren();
  for (const source of ready) {
    const li = document.createElement("li");
    li.className = "source-existing-item";
    li.append(createTextElement("span", "source-existing-name", source.originalName));
    if (source.pageCount) li.append(document.createTextNode(" "), createTextElement("span", "source-existing-pages", t("materials.existing.pages", { count: nf.format(source.pageCount) })));
    const open = document.createElement("button");
    open.type = "button";
    open.className = "small-button";
    open.dataset.action = "open-source";
    open.dataset.sourceId = String(source.id);
    open.textContent = t("materials.existing.open");
    open.setAttribute("aria-label", t("materials.existing.openLabel", { name: source.originalName }));
    li.append(document.createTextNode(" "), open);
    existingList.append(li);
  }
  existingBox.hidden = ready.length === 0;
}

existingList?.addEventListener("click", async (event) => {
  const button = event.target.closest('[data-action="open-source"]');
  if (!button) return;
  button.disabled = true;
  currentSourceId = Number(button.dataset.sourceId);
  setSourcesMessage(t("materials.existing.opening"));
  const listed = await SourceProposalsUI.listProposals(currentSourceId);
  button.disabled = false;
  if (!listed.ok) {
    setSourcesMessage(listed.message || t("materials.existing.openFailed"), true);
    return;
  }
  if (sourcesCoverageNote) { sourcesCoverageNote.hidden = true; sourcesCoverageNote.textContent = ""; }
  await showProposals(listed.proposals);
  setSourcesMessage(proposedText(listed.proposals.length));
  topicInput?.focus({ preventScroll: true });
});

// The list is refreshed whenever the student opens Materiais (an upload elsewhere, another window, a first visit).
// A generation that went on while the student was elsewhere is read from the server again as soon as the list is on screen.
document.querySelector('[data-screen="materials"]')?.addEventListener("click", () => { loadExistingSources(); ensurePolling(); });

// ---- upload ------------------------------------------------------------------------------------------------------------
sourcesChooseFileButton?.addEventListener("click", () => {
  sourcesFileInput?.click();
});

async function showExistingProposals(sourceId, extraction, prefix = "") {
  const existing = await SourceProposalsUI.listProposals(sourceId);
  if (!existing.ok) return false;
  await showProposals(existing.proposals);
  setSourcesMessage(prefix || SourceProposalsUI.alreadyProcessedMessage(existing.proposals.length, extraction));
  return true;
}

sourcesFileInput?.addEventListener("change", async () => {
  const [file] = sourcesFileInput.files ?? [];
  if (!file) return;
  if (sourcesProposalsPanel) sourcesProposalsPanel.hidden = true;
  if (sourcesProposalsList) sourcesProposalsList.replaceChildren();
  topicResults?.replaceChildren();
  if (sourcesCoverageNote) { sourcesCoverageNote.hidden = true; sourcesCoverageNote.textContent = ""; } // never leave a warning from the previous PDF

  try {
    setSourcesMessage(t("materials.upload.sending"));
    const uploadResult = await SourceProposalsUI.uploadSource(file);
    if (!uploadResult.ok) {
      setSourcesMessage(uploadResult.message || t("materials.upload.sendFailed"), true);
      return;
    }
    currentSourceId = uploadResult.source.id;

    setSourcesMessage(t("materials.upload.extracting"));
    const extractResult = await SourceProposalsUI.extractSource(uploadResult.source.id);
    if (!extractResult.ok) {
      setSourcesMessage(extractResult.message || t("materials.upload.extractFailed"), true);
      return;
    }
    if (extractResult.extraction.status !== "EXTRACTED") {
      setSourcesMessage(SourceProposalsUI.unreadableSourceMessage(extractResult.extraction.status), true);
      return;
    }

    setSourcesMessage(t("materials.upload.chunking"));
    const chunkResult = await SourceProposalsUI.chunkSource(uploadResult.source.id);
    // The same PDF sent again: its trechos (and any rascunho or accepted content on them) already exist and are never
    // replaced silently. Land on them instead of a dead-end error.
    if (!chunkResult.ok && SourceProposalsUI.isAlreadyProcessed(chunkResult.code)) {
      if (await showExistingProposals(uploadResult.source.id, extractResult.extraction)) return;
    }
    if (!chunkResult.ok) {
      setSourcesMessage(chunkResult.message || t("materials.upload.chunkFailed"), true);
      return;
    }

    await showProposals(chunkResult.proposals);
    // pages with no extractable text never became a proposal: say so, or silence reads as full coverage
    const skippedNote = SourceProposalsUI.skippedPagesNote(extractResult.extraction);
    // the status line is overwritten by the next action; the coverage note stays with the proposals it describes
    if (sourcesCoverageNote && skippedNote) { sourcesCoverageNote.textContent = skippedNote; sourcesCoverageNote.hidden = false; }
    setSourcesMessage(proposedText(chunkResult.proposals.length, skippedNote));
    topicInput?.focus({ preventScroll: true });
    loadExistingSources();
  } catch (error) {
    setSourcesMessage(t("materials.upload.processFailed"), true);
    console.error("Falha ao processar fonte enviada.", error);
  } finally {
    sourcesFileInput.value = "";
  }
});

// ---- index list actions ------------------------------------------------------------------------------------------------
async function onIndexClick(event) {
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
      toggleBtn.setAttribute("aria-expanded", "true");
      toggleBtn.textContent = t("materials.proposal.hideExcerpt");
    } else {
      excerptEl.hidden = true;
      toggleBtn.setAttribute("aria-expanded", "false");
      toggleBtn.textContent = t("materials.proposal.showExcerpt");
    }
    return;
  }

  const saveBtn = event.target.closest('[data-action="save-proposal-title"]');
  if (saveBtn) {
    const input = item.querySelector(".source-proposal-title-input");
    if (!input) return;
    const saved = item.querySelector(".source-proposal-saved");
    if (saved) saved.textContent = "";
    saveBtn.disabled = true;
    try {
      const result = await SourceProposalsUI.renameProposal(proposalId, input.value);
      if (result.ok) {
        if (saved) saved.textContent = t("materials.proposal.titleSaved");
      } else {
        setSourcesMessage(result.message || t("materials.proposal.saveFailed"), true);
      }
    } finally {
      saveBtn.disabled = false;
      saveBtn.focus({ preventScroll: true }); // a disabled button drops keyboard focus
    }
    return;
  }

  const summaryBtn = event.target.closest('[data-action="open-summary"]');
  if (summaryBtn) {
    if (!(await deps.openSummary(Number(summaryBtn.dataset.unitId)))) setSourcesMessage(t("plan.openLesson.missing"), true);
    return;
  }

  const openBtn = event.target.closest('[data-action="open-draft"]');
  if (openBtn) {
    openBtn.disabled = true;
    const result = await DraftReviewUI.getDraft(openBtn.dataset.draftId);
    openBtn.disabled = false;
    if (!result.ok) {
      setSourcesMessage(result.message || t("materials.draft.openFailed"), true);
      return;
    }
    await openEditor(result.draft, item.querySelector(".source-proposal-title-input")?.value ?? t("materials.draft.fallbackTitle"));
    return;
  }

  const showBtn = event.target.closest('[data-action="show-generation"]');
  if (showBtn) {
    await showGenerationOf(proposalId, item.querySelector(".source-proposal-title-input")?.value);
    return;
  }

  const generateBtn = event.target.closest('[data-action="generate-draft"]');
  if (generateBtn) {
    const proposal = {
      id: Number(proposalId),
      title: item.querySelector(".source-proposal-title-input")?.value ?? t("materials.proposal.fallbackTitle"),
      pageStart: Number(item.querySelector(".source-proposal-range")?.textContent.match(/\d+/g)?.[0]),
      pageEnd: Number(item.querySelector(".source-proposal-range")?.textContent.match(/\d+/g)?.at(-1)),
    };
    await generateFor(proposal);
  }
}
sourcesProposalsList?.addEventListener("click", onIndexClick);
editorialList?.addEventListener("click", onIndexClick);
