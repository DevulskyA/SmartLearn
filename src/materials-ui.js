// Materiais: upload a PDF, say WHAT to study, approve the source scope, generate an AI draft and edit it as a lesson.
// The flow is topic-first (the student does not walk 165 cards): upload -> "O que você quer estudar?" -> located sections ->
// generate -> the lesson editor (Resumo / Questões / Fonte / Revisão), which REPLACES the list on screen — the rest of the
// book is never a vertical continuation of the lesson being edited. What belongs to other screens is passed in once through
// configureMaterialsUI.
import * as SourceProposalsUI from "./source-proposals-ui.js";
import { formatNumber } from "./i18n/format.js";
import { t, tn } from "./i18n/index.js";
import * as DraftReviewUI from "./draft-review-ui.js";
import { createTextElement } from "./dom-utils.js";
import { showConfirm } from "./confirm-dialog.js";
import { createLessonEditor } from "./lesson-editor-ui.js";
import * as GenerationJobsUI from "./generation-jobs-ui.js";
import { libraryView, LIBRARY_TOOLS_FROM } from "./materials-library.js";
import { printedOfPdfPage } from "../shared/page-numbering.js";
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
const rangeForm = document.querySelector("#sources-range-form");
const rangeStartInput = document.querySelector("#sources-range-start");
const rangeEndInput = document.querySelector("#sources-range-end");
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
const openBar = document.querySelector("#sources-open-bar");
const openTitle = document.querySelector("#sources-open-title");
const backToLibraryButton = document.querySelector("#sources-back");

// One thing at a time: with a material open the screen shows only that material (back link, drafts, pages, other ways to choose);
// the library and its heading come back with "Voltar à biblioteca". The library keeps its own rendering; only the card's mode changes.
let currentSourceName = "";
function setOpenMaterial(open) {
  sourcesCard?.classList.toggle("is-open-material", open);
  if (openBar) openBar.hidden = !open;
  if (open && openTitle) openTitle.textContent = existingSources.find((s) => s.id === currentSourceId)?.originalName ?? currentSourceName;
  if (open && currentSourceId != null) loadPageNumbering(currentSourceId); else numberingFor = null;
}

// Page numbers: the ones printed in the book when the PDF shows them (the server detects it), else the PDF's own. The student types
// and reads the same numbers; only the server converts to PDF pages.
let pageNumbering = { mode: "pdf" };
let numberingFor = null;
const shownPages = (proposal) => [printedOfPdfPage(pageNumbering, proposal.pageStart), printedOfPdfPage(pageNumbering, proposal.pageEnd)];
// The range as the student reads it in the book; the front matter (cover, contents) has no printed number and says so instead of showing one.
function bookRangeLabel(proposal, lower = false) {
  const [start, end] = shownPages(proposal);
  if (start === null || end === null) return t(lower ? "materials.range.frontLower" : "materials.range.front");
  if (start === end) return t(lower ? "materials.range.pageLower" : "materials.range.page", { page: start });
  return t(lower ? "materials.range.pagesLower" : "materials.range.pages", { start, end });
}
function updateRangeHint() {
  const hint = rangeForm?.querySelector(".lesson-hint");
  if (!hint) return;
  const key = pageNumbering.mode === "printed" ? "screens.materials.range.hintBook" : "screens.materials.range.hint";
  hint.dataset.i18n = key;
  hint.textContent = t(key);
}
async function loadPageNumbering(sourceId) {
  if (numberingFor === sourceId) return;
  numberingFor = sourceId;
  pageNumbering = { mode: "pdf" };
  updateRangeHint();
  const result = await SourceProposalsUI.getPageNumbering(sourceId);
  if (numberingFor !== sourceId) return; // another material was opened meanwhile
  pageNumbering = result.ok ? result.numbering : { mode: "pdf" };
  updateRangeHint();
  if (pageNumbering.mode === "printed") renderSourceProposals(currentProposals);
}

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

// A lost connection is a different problem from an unreadable file: say which one, so the student retries or changes the file.
function uploadFailureMessage(error) {
  const connectionLost = error?.name === "OfflineError" || error?.name === "NetworkError";
  return connectionLost ? t("store.error.offline") : t("materials.upload.processFailed");
}

async function openEditor(draft, title) {
  closeProgressPanel();
  let subjectsFailed = false;
  const subjects = await deps.listActiveSubjects().catch(() => { subjectsFailed = true; return []; });
  activeEditor?.destroy();
  const editor = createLessonEditor({
    draft,
    title,
    subjects,
    subjectsFailed,
    today: deps.getLocalDateValue(),
    deps: {
      reviseSummary: DraftReviewUI.reviseSummary,
      reviseQuestion: DraftReviewUI.reviseQuestion,
      deleteQuestion: DraftReviewUI.deleteQuestion,
      acceptDraft: DraftReviewUI.acceptDraft,
      previewAcceptance: DraftReviewUI.previewAcceptance,
      reauditDraft: DraftReviewUI.reauditDraft,
      auditSummary: DraftReviewUI.auditSummary,
      listSummaryVersions: DraftReviewUI.listSummaryVersions,
      readSummaryVersion: DraftReviewUI.readSummaryVersion,
      restoreSummaryVersion: DraftReviewUI.restoreSummaryVersion,
      generateQuestions: DraftReviewUI.generateDraftQuestions,
      activeQuestionsJob: DraftReviewUI.activeQuestionsJob,
      cancelQuestions: DraftReviewUI.cancelQuestionsJob,
      getDraft: DraftReviewUI.getDraft,
      getDecision: DraftReviewUI.getDecision,
      decideReplacement: DraftReviewUI.decideReplacement,
      // Translation = a new version of the same trecho in another language; the job runs on the server like any generation.
      translateDraft: async (proposalId, targetLocale) => {
        const created = await GenerationJobsUI.createJob(proposalId, { targetLocale });
        if (!created.ok) return created;
        await showBrowse();
        openProgressPanel(created.job, proposalId, title, { translateTo: targetLocale });
        return { ok: true };
      },
      // Regenerate = the same trecho again with today's prompt, as a new version beside this one (the student chooses which to keep).
      regenerateDraft: async (proposalId) => {
        const created = await GenerationJobsUI.createJob(proposalId, { regenerate: true });
        if (!created.ok) return created;
        await showBrowse();
        openProgressPanel(created.job, proposalId, title);
        return { ok: true };
      },
      openDraftById: async (draftId) => {
        const opened = await DraftReviewUI.getDraft(draftId);
        if (opened.ok) await openEditor(opened.draft, title);
        return opened.ok;
      },
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
  ensurePolling(nextPollingDelay());
}

function nextPollingDelay() {
  if (!watched) return POLL_BACKGROUND_MS;
  return watched.polls <= POLL_QUICK_TICKS ? POLL_WATCHING_QUICK_MS : POLL_WATCHING_MS;
}

function finishedJobs(latest) {
  const finished = [];
  for (const proposal of currentProposals) {
    const job = latest.get(proposal.id) ?? null;
    if (jobIsActive(proposal.latestJob) && !jobIsActive(job) && proposal.id !== watched?.proposalId) finished.push({ proposal, job });
  }
  return finished;
}

async function proposalsAfterJobs(latest, finished) {
  let proposals = currentProposals.map((proposal) => ({ ...proposal, latestJob: latest.get(proposal.id) ?? null }));
  if (finished.length === 0 || !currentSourceId) return proposals;
  // a job ended: its draft (or nothing, if it failed) is a fact of the trecho, read it from the server
  const listed = await SourceProposalsUI.listProposals(currentSourceId);
  if (listed.ok) proposals = listed.proposals.map((proposal) => ({ ...proposal, latestJob: latest.get(proposal.id) ?? null }));
  return proposals;
}

function announceFinishedJobs(finished) {
  for (const { proposal, job } of finished) {
    if (job?.state === "SUCCEEDED") setSourcesMessage(t("materials.generation.finished", { title: proposal.title }));
    else if (job?.state === "FAILED") setSourcesMessage(jobFailureMessage(job), true);
  }
}

async function updateWatchedJob(jobs) {
  if (!watched) return;
  const job = jobs.find((candidate) => candidate.id === watched.job.id);
  if (!job) return;
  if (jobIsActive(job)) {
    watched.job = job;
    renderProgress();
  } else await concludeWatched(job);
}

async function pollJobs() {
  const result = await GenerationJobsUI.listJobs();
  if (watched) { watched.connectionLost = !result.ok; renderLiveness(); }
  if (!result.ok) return; // a network blip: the screen keeps what it last knew (and says so) and tries again at the next tick
  const latest = latestJobsByProposal(result.jobs);
  const finished = finishedJobs(latest);
  applyProposals(await proposalsAfterJobs(latest, finished));
  announceFinishedJobs(finished);
  await updateWatchedJob(result.jobs);
}

// -- the progress panel of the generation the student is waiting for ------------------------------------------------------------
// The language a translation job was asked for, by job id (a regeneration in the same language is not one): remembered across a reload below.
const translationTargets = new Map();
function openProgressPanel(job, proposalId, title, { translateTo = null } = {}) {
  closeProgressPanel();
  if (translateTo) translationTargets.set(job.id, translateTo);
  const translate = Boolean(translateTo);
  const heading = createTextElement("p", "sources-generation-title", translate
    ? t("materials.progress.translateTitle", { title, language: t(`editor.translate.lang.${translateTo}`) })
    : progressTitle(title));
  heading.tabIndex = -1;
  const timer = createTextElement("p", "sources-generation-timer", elapsedLabel(jobElapsedMs(job, Date.now())));
  timer.setAttribute("aria-hidden", "true"); // ticks every second: not announced
  const phase = createTextElement("p", "sources-generation-phase", jobPhaseLabel(job, { translate }));
  phase.setAttribute("role", "status"); // announced when the REAL phase changes, not every second
  // Proof of life: the dot beats and the line says when the AI last wrote something, so "working" never looks like "frozen".
  const live = document.createElement("p");
  live.className = "sources-generation-live";
  live.setAttribute("aria-hidden", "true"); // ticks every second: the phase and the stalled warning are what is announced
  const liveDot = document.createElement("span");
  liveDot.className = "sources-generation-pulse";
  const liveText = document.createElement("span");
  live.append(liveDot, liveText);
  const connection = createTextElement("p", "sources-generation-connection", "");
  connection.setAttribute("role", "alert");
  const stalled = createTextElement("p", "lesson-hint sources-generation-stalled", "");
  stalled.setAttribute("role", "status");
  const note = createTextElement("p", "lesson-hint", t(translate ? "materials.progress.translateNote" : "materials.progress.note"));
  const actions = document.createElement("div");
  actions.className = "sources-generation-actions";
  const background = createTextElement("button", "small-button", t("materials.progress.background"));
  background.type = "button";
  background.dataset.action = "generation-background";
  const cancel = createTextElement("button", "small-button is-danger", t("materials.progress.cancel"));
  cancel.type = "button";
  cancel.dataset.action = "generation-cancel";
  actions.append(background, cancel);
  generationBox.replaceChildren(heading, timer, phase, live, connection, stalled, note, actions);
  generationBox.hidden = false;
  const ticker = setInterval(() => {
    timer.textContent = elapsedLabel(jobElapsedMs(watched?.job ?? job, Date.now()));
    renderLiveness();
  }, 1000);
  watched = { job, proposalId, title, translate, ticker, seenActivity: job.lastActivityAt ?? null, activityAt: Date.now(), connectionLost: false, elements: { timer, phase, stalled, cancel, liveDot, liveText, connection } };
  rememberWatched(proposalId, title, job.id, translateTo);
  renderLiveness();
  setBusy(true);
  heading.focus({ preventScroll: false });
  stopPolling();
  ensurePolling(POLL_FIRST_MS);
}

const agoLabel = (ms) => (ms < 5000
  ? t("materials.progress.activityNow")
  : ms < 60_000 ? t("materials.progress.activitySeconds", { seconds: Math.round(ms / 1000) }) : t("materials.progress.activityMinutes", { minutes: Math.floor(ms / 60_000) }));

/** The "is it alive" line: queued, waiting for the first output, or when the AI last wrote; and a clear warning when the server cannot be reached. */
function renderLiveness() {
  if (!watched) return;
  const { job, elements } = watched;
  const sinceActivity = Date.now() - watched.activityAt;
  const waitingFirst = job.state !== "QUEUED" && !job.lastActivityAt;
  let text;
  if (job.state === "QUEUED") text = t("materials.progress.activityQueued");
  else if (waitingFirst) text = t("materials.progress.activityNone");
  else text = t(watched.connectionLost ? "materials.progress.activitySeen" : "materials.progress.activityLast", { ago: agoLabel(sinceActivity) });
  if (elements.liveText.textContent !== text) elements.liveText.textContent = text;
  elements.liveDot.classList.toggle("is-alive", !watched.connectionLost && job.state === "CALLING_PROVIDER" && sinceActivity < 20_000);
  const connectionText = watched.connectionLost ? t("materials.progress.connectionLost") : "";
  if (elements.connection.textContent !== connectionText) elements.connection.textContent = connectionText;
}

// A page reload drops everything in memory but the job lives on the server: remember which one the student was watching, and open it again.
const RESUME_KEY = "smartlearn.watchedGeneration";
function rememberWatched(proposalId, title, jobId, translateTo) {
  try { sessionStorage.setItem(RESUME_KEY, JSON.stringify({ sourceId: currentSourceId, proposalId, title, jobId, translateTo })); } catch { /* storage may be blocked: the list still shows "Ver progresso" */ }
}
function forgetWatched() {
  try { sessionStorage.removeItem(RESUME_KEY); } catch { /* same */ }
}
let resumeTried = false;
async function resumeWatchedAfterReload() {
  if (resumeTried) return;
  resumeTried = true;
  let saved = null;
  try { saved = JSON.parse(sessionStorage.getItem(RESUME_KEY) ?? "null"); } catch { /* ignore */ }
  if (!saved?.sourceId || !saved.proposalId || watched) return;
  const listed = await SourceProposalsUI.listProposals(saved.sourceId);
  if (!listed.ok) { forgetWatched(); return; }
  currentSourceId = saved.sourceId;
  await showProposals(listed.proposals);
  if (saved.translateTo && saved.jobId) translationTargets.set(saved.jobId, saved.translateTo);
  await showGenerationOf(saved.proposalId, saved.title); // opens the panel while the job is active; otherwise the list already tells how it ended
  if (!watched) forgetWatched();
}

function renderProgress() {
  if (!watched) return;
  const { job, elements } = watched;
  if (job.lastActivityAt !== watched.seenActivity) { watched.seenActivity = job.lastActivityAt; watched.activityAt = Date.now(); }
  renderLiveness();
  const phaseText = watched.cancelling ? t("materials.progress.cancelling") : jobPhaseLabel(job, { translate: watched.translate });
  if (elements.phase.textContent !== phaseText) elements.phase.textContent = phaseText;
  const stalledText = job.state === "STALLED"
    ? t("materials.progress.stalled")
    : "";
  if (elements.stalled.textContent !== stalledText) elements.stalled.textContent = stalledText;
}

function closeProgressPanel() {
  if (watched) clearInterval(watched.ticker);
  forgetWatched();
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
  if (!(await showConfirm(t("materials.progress.cancelConfirm")))) {
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
  const job = proposal.latestJob;
  openProgressPanel(job, proposal.id, title ?? proposal.title, { translateTo: translationTargets.get(job.id) ?? null });
}

function setBusy(busy) {
  for (const control of sourcesProposalsPanel?.querySelectorAll("button, input") ?? []) control.disabled = busy;
}

// ---- proposal index ----------------------------------------------------------------------------------------------------
// Titles and the index only ORIENT: this fills the page range (the one place that chooses what to study) with the pages of the title.
// Front matter has no printed number, so it offers nothing to copy.
function createUseRangeButton(range) {
  if (range.generatable === false) return null;
  const [start, end] = shownPages(range);
  if (start === null || end === null) return null;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "text-button";
  button.dataset.action = "use-range";
  button.dataset.start = String(start);
  button.dataset.end = String(end);
  button.textContent = t("materials.range.use");
  return button;
}
document.addEventListener("click", (event) => {
  const button = event.target.closest?.('[data-action="use-range"]');
  if (!button || !rangeStartInput || !rangeEndInput) return;
  rangeStartInput.value = button.dataset.start;
  rangeEndInput.value = button.dataset.end;
  rangeForm?.scrollIntoView({ block: "center", behavior: "auto" });
  rangeStartInput.focus({ preventScroll: true });
});

function createSourceProposalItem(proposal) {
  const li = document.createElement("li");
  li.className = "source-proposal-item";
  li.dataset.proposalId = String(proposal.id);

  const rangeText = bookRangeLabel(proposal);
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
  const useRangeBtn = createUseRangeButton(proposal);

  // The same buttons repeat in every trecho: the pages of the trecho they belong to are their description.
  for (const button of [saveBtn, toggleBtn, useRangeBtn].filter(Boolean)) button.setAttribute("aria-describedby", range.id);
  // What comes after is what the trecho DOES now (generate / generating / ready / failed): it is redrawn when the server says its job moved.
  const slot = document.createElement("div");
  slot.className = "source-proposal-slot";
  // The save confirmation lives next to the field it is about (the page-level line can be far off-screen). The live region exists
  // empty BEFORE the save: a region inserted together with its text is not announced.
  const saved = createTextElement("p", "source-proposal-saved", "");
  saved.setAttribute("role", "status");
  titleInput.addEventListener("input", () => { saved.textContent = ""; }); // an edit makes "Título salvo" stale
  li.append(range, titleInput, saveBtn, saved, toggleBtn, ...(useRangeBtn ? [useRangeBtn] : []), excerpt, slot);
  if (!proposal.generatable) li.classList.add("is-editorial");
  renderActionSlot(li, proposal);
  return li;
}

/** Everything that tells two states of a trecho apart on screen: when it changes, its slot is redrawn. */
const proposalSignature = (p) => JSON.stringify([p.generatable, p.latestDraft?.id, p.latestDraft?.status, p.latestDraft?.lessonQuestions?.state, p.latestJob?.id, p.latestJob?.state, p.latestJob?.phase]);

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

function acceptedDraftParts(proposal, rangeId) {
  const parts = [createTextElement("p", "lesson-hint", t("materials.proposal.lessonCreated"))];
  // the lesson exists: its Resumo is one click away (only offered while the server says the lesson is still there)
  if (proposal.latestDraft.acceptedUnitId != null && deps.openSummary) {
    const open = actionButton(t("materials.action.openSummary"), "open-summary", rangeId);
    open.dataset.unitId = String(proposal.latestDraft.acceptedUnitId);
    parts.push(open);
  }
  // A lesson accepted as a summary only can still get its questions: they are reviewed in a draft of their own before they join the lesson
  const later = proposal.latestDraft.lessonQuestions;
  if (later?.state === "AVAILABLE" && proposal.latestDraft.acceptedUnitId != null) {
    const ask = actionButton(t("materials.action.lessonQuestions"), "lesson-questions", rangeId);
    ask.dataset.unitId = String(proposal.latestDraft.acceptedUnitId);
    parts.push(ask);
  } else if (later?.state === "IN_REVIEW") {
    const review = actionButton(t("materials.action.reviewLessonQuestions"), "open-draft", rangeId);
    review.dataset.draftId = String(later.draftId);
    parts.push(review);
  }
  return parts;
}

function generatingDraftParts(job, status, rangeId) {
  const parts = [statusLine(status)];
  if (status.stalled) parts.push(createTextElement("p", "lesson-hint", t("materials.proposal.stalledHint")));
  const show = actionButton(t("materials.action.showProgress"), "show-generation", rangeId);
  show.dataset.jobId = String(job.id);
  parts.push(show);
  return parts;
}

function existingDraftParts(proposal, job, status, rangeId) {
  const parts = [];
  if (status?.kind === "ready" && job.draftId === proposal.latestDraft.id) parts.push(statusLine(status));
  const open = actionButton(t("materials.action.openDraft"), "open-draft", rangeId);
  open.dataset.draftId = String(proposal.latestDraft.id);
  parts.push(open);
  return parts;
}

function idleDraftParts(job, status, rangeId) {
  const parts = [];
  const failed = status?.kind === "failed";
  if (failed) parts.push(statusLine(status), createTextElement("p", "lesson-hint", jobFailureMessage(job)));
  parts.push(actionButton(t(failed ? "materials.action.retry" : "materials.action.generate"), "generate-draft", rangeId));
  return parts;
}

function proposalActionParts(proposal, job, status, rangeId) {
  if (!proposal.generatable) return [createTextElement("p", "lesson-hint", notStudyNote(proposal.kind))];
  if (proposal.latestDraft?.status === "ACCEPTED") return acceptedDraftParts(proposal, rangeId);
  if (status?.kind === "generating") return generatingDraftParts(job, status, rangeId);
  if (proposal.latestDraft) return existingDraftParts(proposal, job, status, rangeId);
  return idleDraftParts(job, status, rangeId);
}

function renderActionSlot(li, proposal) {
  const slot = li.querySelector(".source-proposal-slot");
  const rangeId = li.querySelector(".source-proposal-range")?.id;
  const hadFocus = slot.contains(document.activeElement);
  const job = proposal.latestJob ?? null;
  const status = jobListStatus(job);
  const parts = proposalActionParts(proposal, job, status, rangeId);
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
function draftInProgressState(proposal) {
  if (!proposal.generatable || proposal.latestDraft?.status === "ACCEPTED") return null;
  const status = jobListStatus(proposal.latestJob);
  const generating = status?.kind === "generating";
  const failed = !generating && !proposal.latestDraft && status?.kind === "failed";
  const ready = !generating && status?.kind === "ready" && proposal.latestJob.draftId === proposal.latestDraft?.id;
  if (!proposal.latestDraft && !generating && !failed) return null;
  return { proposal, status, generating, failed, ready };
}

function renderDraftInProgressItem({ proposal, status, generating, failed, ready }) {
  const li = document.createElement("li");
  li.className = "source-draft-item";
  li.dataset.proposalId = String(proposal.id);
  const rangeText = bookRangeLabel(proposal, true);
  const title = createTextElement("span", "source-draft-item-title", proposal.title);
  const range = createTextElement("span", "lesson-hint", rangeText);
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
  if (!generating && !failed && proposal.latestDraft?.status === "DRAFT") {
    const discard = document.createElement("button");
    discard.type = "button";
    discard.className = "small-button is-danger";
    discard.dataset.action = "discard-draft";
    discard.dataset.draftId = String(proposal.latestDraft.id);
    discard.dataset.title = proposal.title;
    discard.textContent = t("materials.draft.discard");
    discard.setAttribute("aria-label", t("materials.draft.discardLabel", { title: proposal.title }));
    li.append(discard);
  }
  return li;
}

function renderDraftsInProgress(proposals) {
  if (!draftsList) return;
  const focused = draftsList.contains(document.activeElement) ? document.activeElement : null;
  const wasFocused = focused ? { proposalId: focused.closest("li")?.dataset.proposalId } : null;
  draftsList.replaceChildren();
  const open = proposals.map(draftInProgressState).filter(Boolean);
  for (const state of open) draftsList.append(renderDraftInProgressItem(state));
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
  const discard = event.target.closest('[data-action="discard-draft"]');
  if (discard) {
    // two explicit confirmations: discarding is the only way a student's unfinished summary disappears
    const params = { title: discard.dataset.title };
    if (!(await showConfirm(t("materials.draft.discardConfirm1", params)))) return;
    if (!(await showConfirm(t("materials.draft.discardConfirm2", params)))) return;
    discard.disabled = true;
    const result = await DraftReviewUI.discardDraft(discard.dataset.draftId, { confirmDiscard: true });
    if (!result.ok) {
      discard.disabled = false;
      setSourcesMessage(result.message || t("materials.draft.discardFailed"), true);
      return;
    }
    setSourcesMessage(t("materials.draft.discardDone"));
    await refreshProposals();
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
  if (indexDetails) { indexDetails.hidden = content.length === 0; indexDetails.open = content.length <= INDEX_OPEN_UP_TO; } // an empty index is not offered
  if (editorialDetails) {
    editorialDetails.hidden = editorial.length === 0;
    editorialDetails.open = false;
    if (editorialSummary) editorialSummary.textContent = t("materials.editorial.summary", { count: editorial.length });
  }
  // A material with no trechos (no outline in the PDF) still needs the page range and the title search: the panel follows the open
  // material, never the number of proposals (with 0 of them the student had nothing to act on).
  if (sourcesProposalsPanel) sourcesProposalsPanel.hidden = currentSourceId == null;
  setOpenMaterial(currentSourceId != null);
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
    const useRange = createUseRangeButton(candidate);
    if (useRange) li.append(useRange);
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

// One range instead of dozens of clicks: the student types "from page / to page" and the same approveScope({range}) path is used.
rangeForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentSourceId) return;
  const pageStart = Number.parseInt(rangeStartInput.value, 10);
  const pageEnd = Number.parseInt(rangeEndInput.value, 10);
  if (!Number.isInteger(pageStart) || !Number.isInteger(pageEnd) || pageStart < 1 || pageEnd < pageStart) {
    setSourcesMessage(t("screens.materials.range.invalid"), true);
    return;
  }
  const submit = rangeForm.querySelector('[type="submit"]');
  submit.disabled = true;
  const approved = await SourceProposalsUI.approveScope(currentSourceId, { range: { pageStart, pageEnd } });
  submit.disabled = false;
  if (!approved.ok) {
    setSourcesMessage(approved.message || t("materials.topic.approveFailed"), true);
    return;
  }
  await generateFor(approved.proposal);
});

// ---- documents already uploaded: reopen instead of sending the same PDF again ------------------------------------------------
// The list the server returned (documents with extracted text), and what the student is looking at: search, order, page.
let existingSources = [];
const libraryState = { query: "", sort: "original", page: 1 };
const libraryTools = document.querySelector("#library-tools");
const librarySearch = document.querySelector("#library-search");
const librarySort = document.querySelector("#library-sort");
const libraryCount = document.querySelector("#library-count");
const libraryPager = document.querySelector("#library-pager");
const libraryPrev = document.querySelector("#library-prev");
const libraryNext = document.querySelector("#library-next");
const libraryPageLabel = document.querySelector("#library-page-label");

async function loadExistingSources() {
  if (!existingBox) return;
  const result = await SourceProposalsUI.listSources();
  if (!result.ok) return;
  existingSources = result.sources.filter((s) => s.extractionStatus === "EXTRACTED");
  renderExistingSources();
}

function renderExistingSources() {
  const showTools = existingSources.length >= LIBRARY_TOOLS_FROM;
  if (!showTools) { libraryState.query = ""; libraryState.sort = "original"; libraryState.page = 1; librarySearch.value = ""; librarySort.value = "original"; }
  const view = libraryView(existingSources, libraryState);
  libraryState.page = view.page; // clamped: removing the last item of the last page lands on the new last page
  libraryTools.hidden = !showTools;
  libraryCount.hidden = !showTools;
  libraryPager.hidden = !showTools || view.pageCount <= 1;
  if (showTools) {
    const range = { matched: nf.format(view.matched), total: nf.format(view.total), from: nf.format(view.from), to: nf.format(view.to) };
    libraryCount.textContent = view.matched === 0 ? t("materials.library.none") : tn("materials.library.count", view.total, range);
    libraryPageLabel.textContent = t("materials.library.page", { page: nf.format(view.page), count: nf.format(view.pageCount) });
    libraryPrev.setAttribute("aria-disabled", String(view.page <= 1));
    libraryNext.setAttribute("aria-disabled", String(view.page >= view.pageCount));
  }
  existingList.replaceChildren();
  for (const source of view.items) {
    const li = document.createElement("li");
    li.className = "source-existing-item";
    const identity = document.createElement("span");
    identity.className = "sl-source-identity";
    identity.append(createTextElement("span", "source-existing-name", source.originalName));
    identity.append(createTextElement("span", "sl-source-progress", source.draftCount > 0 ? tn("materials.existing.prepared", source.draftCount) : t("materials.existing.available")));
    li.append(identity);
    if (source.pageCount) li.append(document.createTextNode(" "), createTextElement("span", "source-existing-pages", t("materials.existing.pages", { count: nf.format(source.pageCount) })));
    const open = document.createElement("button");
    open.type = "button";
    open.className = "small-button";
    open.dataset.action = "open-source";
    open.dataset.sourceId = String(source.id);
    open.textContent = t("materials.existing.open");
    open.setAttribute("aria-label", t("materials.existing.openLabel", { name: source.originalName }));
    li.append(document.createTextNode(" "), open);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "small-button is-danger";
    remove.dataset.action = "remove-source";
    remove.dataset.sourceId = String(source.id);
    remove.dataset.sourceName = source.originalName;
    remove.textContent = t("materials.existing.remove");
    remove.setAttribute("aria-label", t("materials.existing.removeLabel", { name: source.originalName }));
    li.append(document.createTextNode(" "), remove);
    existingList.append(li);
  }
  existingBox.hidden = existingSources.length === 0;
}

// aria-disabled (not disabled) on the pager buttons: a button that disables itself under the focus would drop the keyboard position.
librarySearch?.addEventListener("input", () => { libraryState.query = librarySearch.value; libraryState.page = 1; renderExistingSources(); });
librarySort?.addEventListener("change", () => { libraryState.sort = librarySort.value; libraryState.page = 1; renderExistingSources(); });
libraryPrev?.addEventListener("click", () => {
  if (libraryPrev.getAttribute("aria-disabled") === "true") return;
  libraryState.page -= 1;
  renderExistingSources();
});
libraryNext?.addEventListener("click", () => {
  if (libraryNext.getAttribute("aria-disabled") === "true") return;
  libraryState.page += 1;
  renderExistingSources();
});

existingList?.addEventListener("click", async (event) => {
  const removeButton = event.target.closest('[data-action="remove-source"]');
  if (removeButton) {
    const id = Number(removeButton.dataset.sourceId);
    if (!(await showConfirm(t("materials.existing.removeConfirm", { name: removeButton.dataset.sourceName })))) { removeButton.focus({ preventScroll: true }); return; }
    removeButton.disabled = true;
    const result = await SourceProposalsUI.removeSource(id);
    if (!result.ok) {
      removeButton.disabled = false;
      setSourcesMessage(result.message || t("materials.existing.removeFailed"), true);
      removeButton.focus({ preventScroll: true });
      return;
    }
    if (currentSourceId === id) { currentSourceId = null; if (sourcesProposalsPanel) sourcesProposalsPanel.hidden = true; setOpenMaterial(false); }
    await loadExistingSources();
    setSourcesMessage(t("materials.existing.removed"));
    sourcesChooseFileButton?.focus({ preventScroll: true });
    return;
  }
  // Pointer shortcut: a click on the name opens the material like its "Abrir" button. The name is not focusable and has no role, so
  // keyboard and screen-reader users keep exactly one control per action (the button); a text selection is not treated as a click.
  const identity = event.target.closest(".sl-source-identity");
  if (identity && !event.target.closest("button") && !window.getSelection()?.toString()) {
    identity.closest("li")?.querySelector('[data-action="open-source"]:not(:disabled)')?.click();
    return;
  }
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
// Watching the screen itself (not the nav button) also covers F5 and a link straight to #materials, where nobody clicks the button.
const materialsScreen = document.querySelector("#screen-materials");
function onMaterialsShown() {
  if (!materialsScreen || materialsScreen.hidden) return;
  // Coming back to Materiais lands on the library; a lesson still open in the editor is not touched.
  if (currentSourceId != null && editorView?.hidden !== false) showLibrary();
  loadExistingSources();
  ensurePolling();
  resumeWatchedAfterReload();
}
if (materialsScreen) {
  new MutationObserver(onMaterialsShown).observe(materialsScreen, { attributes: true, attributeFilter: ["hidden"] });
  onMaterialsShown();
}

function showLibrary({ focus = false } = {}) {
  currentSourceId = null;
  currentSourceName = "";
  if (sourcesProposalsPanel) sourcesProposalsPanel.hidden = true;
  sourcesCoverageNote?.setAttribute("hidden", "");
  topicResults?.replaceChildren();
  setOpenMaterial(false);
  setSourcesMessage("");
  if (focus) (existingList?.querySelector('[data-action="open-source"]') ?? sourcesChooseFileButton)?.focus({ preventScroll: false });
}
backToLibraryButton?.addEventListener("click", () => showLibrary({ focus: true }));

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
    currentSourceName = uploadResult.source.originalName ?? file.name;

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
    setSourcesMessage(uploadFailureMessage(error), true);
    console.error("Falha ao processar fonte enviada.", error);
  } finally {
    sourcesFileInput.value = "";
  }
});

// ---- index list actions ------------------------------------------------------------------------------------------------
async function toggleProposalExcerpt(event, item, proposalId) {
  const toggleBtn = event.target.closest('[data-action="toggle-proposal-excerpt"]');
  if (!toggleBtn) return false;
  const excerptEl = item.querySelector(".source-proposal-excerpt");
  if (!excerptEl) return true;
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
  return true;
}

async function saveProposalTitle(event, item, proposalId) {
  const saveBtn = event.target.closest('[data-action="save-proposal-title"]');
  if (!saveBtn) return false;
  const input = item.querySelector(".source-proposal-title-input");
  if (!input) return true;
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
  return true;
}

async function openAcceptedSummary(event) {
  const summaryBtn = event.target.closest('[data-action="open-summary"]');
  if (!summaryBtn) return false;
  if (!(await deps.openSummary(Number(summaryBtn.dataset.unitId)))) setSourcesMessage(t("plan.openLesson.missing"), true);
  return true;
}

async function openLessonQuestionsFromIndex(event, item) {
  const askBtn = event.target.closest('[data-action="lesson-questions"]');
  if (!askBtn) return false;
  askBtn.disabled = true;
  const result = await DraftReviewUI.openLessonQuestions(Number(askBtn.dataset.unitId));
  askBtn.disabled = false;
  if (!result.ok) {
    setSourcesMessage(result.message || t("materials.lessonQuestions.failed"), true);
    return true;
  }
  await openEditor(result.draft, item.querySelector(".source-proposal-title-input")?.value ?? t("materials.draft.fallbackTitle"));
  return true;
}

async function openDraftFromIndex(event, item) {
  const openBtn = event.target.closest('[data-action="open-draft"]');
  if (!openBtn) return false;
  openBtn.disabled = true;
  const result = await DraftReviewUI.getDraft(openBtn.dataset.draftId);
  openBtn.disabled = false;
  if (!result.ok) {
    setSourcesMessage(result.message || t("materials.draft.openFailed"), true);
    return true;
  }
  await openEditor(result.draft, item.querySelector(".source-proposal-title-input")?.value ?? t("materials.draft.fallbackTitle"));
  return true;
}

async function showGenerationFromIndex(event, item, proposalId) {
  const showBtn = event.target.closest('[data-action="show-generation"]');
  if (!showBtn) return false;
  await showGenerationOf(proposalId, item.querySelector(".source-proposal-title-input")?.value);
  return true;
}

async function generateDraftFromIndex(event, item, proposalId) {
  const generateBtn = event.target.closest('[data-action="generate-draft"]');
  if (!generateBtn) return false;
  const proposal = {
    id: Number(proposalId),
    title: item.querySelector(".source-proposal-title-input")?.value ?? t("materials.proposal.fallbackTitle"),
    pageStart: Number(item.querySelector(".source-proposal-range")?.textContent.match(/\d+/g)?.[0]),
    pageEnd: Number(item.querySelector(".source-proposal-range")?.textContent.match(/\d+/g)?.at(-1)),
  };
  await generateFor(proposal);
  return true;
}

async function onIndexClick(event) {
  const item = event.target.closest(".source-proposal-item");
  if (!item) return;
  const proposalId = item.dataset.proposalId;
  if (await toggleProposalExcerpt(event, item, proposalId)) return;
  if (await saveProposalTitle(event, item, proposalId)) return;
  if (await openAcceptedSummary(event)) return;
  if (await openLessonQuestionsFromIndex(event, item)) return;
  if (await openDraftFromIndex(event, item)) return;
  if (await showGenerationFromIndex(event, item, proposalId)) return;
  await generateDraftFromIndex(event, item, proposalId);
}
sourcesProposalsList?.addEventListener("click", onIndexClick);
editorialList?.addEventListener("click", onIndexClick);
