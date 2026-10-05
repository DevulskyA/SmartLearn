// Materiais: upload a PDF, say WHAT to study, approve the source scope, generate an AI draft and edit it as a lesson.
// The flow is topic-first (the student does not walk 165 cards): upload -> "O que você quer estudar?" -> located sections ->
// generate -> the lesson editor (Resumo / Questões / Fonte / Revisão), which REPLACES the list on screen — the rest of the
// book is never a vertical continuation of the lesson being edited. What belongs to other screens is passed in once through
// configureMaterialsUI.
import * as SourceProposalsUI from "./source-proposals-ui.js";
import * as DraftReviewUI from "./draft-review-ui.js";
import { createTextElement } from "./dom-utils.js";
import { createLessonEditor } from "./lesson-editor-ui.js";
import { elapsedLabel } from "./lesson-view-model.js";

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

// What Materiais needs from the rest of the app (set once at start-up, before any user event can fire):
//   listActiveSubjects()  -> Promise<subject[]>   disciplines offered when accepting a draft
//   getLocalDateValue()   -> "YYYY-MM-DD"         default date of the lesson
//   startStudyNow(unit, subjectName)               "Estudar agora" right after an accept
//   refreshAfterAccept()  -> Promise               refresh Disciplinas, Plano and Hoje once a unit exists
let deps = null;
export function configureMaterialsUI(next) {
  deps = next;
}

let currentSourceId = null;
let activeEditor = null;
let generating = false;
// Index sections up to this size are shown open; a whole book stays collapsed behind the topic search.
const INDEX_OPEN_UP_TO = 12;

function setSourcesMessage(message = "", isError = false) {
  if (!sourcesMessage) return;
  sourcesMessage.classList.toggle("is-error", isError);
  sourcesMessage.textContent = message;
  // An error raised far below must not be left off-screen, or the student clicks and sees nothing happen.
  if (isError && message) sourcesMessage.scrollIntoView({ block: "nearest" });
}

const nf = new Intl.NumberFormat("pt-BR");
const rangeLabel = (a, b) => (a === b ? `PDF página ${a}` : `PDF páginas ${a}–${b}`);
const KIND_LABELS = {
  FRONT_MATTER: "Página de abertura", COPYRIGHT: "Direitos autorais", DEDICATION: "Dedicatória", PREFACE: "Prefácio",
  ACKNOWLEDGMENTS: "Agradecimentos", SUMMARY: "Resumo do próprio livro", EXERCISE: "Exercícios do próprio livro",
  ANSWER_KEY: "Gabarito do próprio livro", REFERENCE: "Referências", APPENDIX: "Apêndice", OTHER: "Outro",
};
const notStudyNote = (kind) => `${KIND_LABELS[kind] ?? "Não é conteúdo de estudo"} — não gera rascunho.`;

// ---- views -------------------------------------------------------------------------------------------------------------
async function showBrowse() {
  activeEditor?.destroy();
  activeEditor = null;
  editorView?.replaceChildren();
  if (editorView) editorView.hidden = true;
  if (sourcesCard) sourcesCard.hidden = false;
  // The list must tell the truth about what exists now (a draft was just created or an accept happened).
  if (currentSourceId) {
    const refreshed = await SourceProposalsUI.listProposals(currentSourceId);
    if (refreshed.ok) renderSourceProposals(refreshed.proposals);
  }
  sourcesChooseFileButton?.focus({ preventScroll: false });
}

async function openEditor(draft, title) {
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
      getDraft: DraftReviewUI.getDraft,
      onBack: showBrowse,
      startStudyNow: (unit, subjectName) => deps.startStudyNow(unit, subjectName),
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

// ---- generation (the server reports no progress: elapsed time is the one real measure, and it is shown as such) -----------
function startGenerationProgress(label) {
  generationBox.replaceChildren();
  const title = createTextElement("p", "sources-generation-title", `Gerando rascunho com IA — ${label}`);
  const timer = createTextElement("p", "sources-generation-timer", "00:00");
  timer.setAttribute("aria-hidden", "true"); // ticks every second: not announced
  const live = createTextElement("p", "visually-hidden", "Gerando. Isso leva vários minutos.");
  live.setAttribute("role", "status");
  const note = createTextElement("p", "lesson-hint", "O servidor não informa o andamento: o tempo decorrido é a única medida real. Uma geração pode levar vários minutos; não feche o aplicativo.");
  const slow = createTextElement("p", "form-message is-error", "Está demorando mais que o normal. A geração continua no servidor; se passar de 20 minutos, algo provavelmente deu errado.");
  slow.hidden = true;
  generationBox.append(title, timer, live, note, slow);
  generationBox.hidden = false;
  const started = Date.now();
  const tick = setInterval(() => {
    const ms = Date.now() - started;
    timer.textContent = elapsedLabel(ms);
    if (ms > 10 * 60_000) slow.hidden = false;
    if (Math.floor(ms / 60_000) !== Math.floor((ms - 1000) / 60_000) && ms >= 60_000) live.textContent = `Gerando há ${Math.floor(ms / 60_000)} minutos.`;
  }, 1000);
  return () => { clearInterval(tick); generationBox.hidden = true; generationBox.replaceChildren(); };
}

async function generateFor(proposal) {
  if (generating) return;
  generating = true;
  setSourcesMessage("");
  const stop = startGenerationProgress(`${proposal.title} (${rangeLabel(proposal.pageStart, proposal.pageEnd)})`);
  setBusy(true);
  let result;
  try {
    result = await DraftReviewUI.generateDraft(proposal.id);
  } finally {
    stop();
    setBusy(false);
    generating = false;
  }
  if (!result.ok) {
    setSourcesMessage(result.message || "Não foi possível gerar o rascunho.", true);
    return;
  }
  await openEditor(result.draft, proposal.title);
  setSourcesMessage("Rascunho gerado. Revise antes de aceitar.");
}

function setBusy(busy) {
  for (const control of sourcesProposalsPanel?.querySelectorAll("button, input") ?? []) control.disabled = busy;
}

// ---- proposal index ----------------------------------------------------------------------------------------------------
function createSourceProposalItem(proposal) {
  const li = document.createElement("li");
  li.className = "source-proposal-item";
  li.dataset.proposalId = String(proposal.id);

  const rangeText = proposal.pageStart === proposal.pageEnd ? `Página ${proposal.pageStart}` : `Páginas ${proposal.pageStart}–${proposal.pageEnd}`;
  const range = createTextElement("p", "source-proposal-range", rangeText);
  range.id = `source-proposal-range-${proposal.id}`;

  const titleInput = document.createElement("input");
  titleInput.type = "text";
  titleInput.className = "source-proposal-title-input";
  titleInput.value = proposal.title;
  // The field has no visible label: its accessible name says what it edits, and which trecho (the list repeats it).
  titleInput.setAttribute("aria-label", `Título do trecho, ${rangeText.toLowerCase()}`);

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "small-button";
  saveBtn.dataset.action = "save-proposal-title";
  saveBtn.textContent = "Salvar título";

  const toggleBtn = document.createElement("button");
  toggleBtn.type = "button";
  toggleBtn.className = "text-button";
  toggleBtn.dataset.action = "toggle-proposal-excerpt";
  toggleBtn.setAttribute("aria-expanded", "false"); // a disclosure: expose whether the excerpt is open
  toggleBtn.textContent = "Ver trecho da fonte";

  const excerpt = createTextElement("p", "source-proposal-excerpt", proposal.excerpt);
  excerpt.hidden = true;

  // The same buttons repeat in every trecho: the pages of the trecho they belong to are their description.
  const described = [saveBtn, toggleBtn];
  li.append(range, titleInput, saveBtn, toggleBtn, excerpt);

  if (!proposal.generatable) {
    li.classList.add("is-editorial");
    li.append(createTextElement("p", "lesson-hint", notStudyNote(proposal.kind)));
  } else if (proposal.latestDraft?.status === "ACCEPTED") {
    li.append(createTextElement("p", "lesson-hint", "Aula já criada a partir deste trecho."));
  } else if (proposal.latestDraft) {
    const open = document.createElement("button");
    open.type = "button";
    open.className = "small-button";
    open.dataset.action = "open-draft";
    open.dataset.draftId = String(proposal.latestDraft.id);
    open.textContent = "Abrir rascunho";
    described.push(open);
    li.append(open);
  } else {
    const generate = document.createElement("button");
    generate.type = "button";
    generate.className = "small-button";
    generate.dataset.action = "generate-draft";
    generate.textContent = "Gerar rascunho com IA";
    described.push(generate);
    li.append(generate);
  }
  for (const button of described) button.setAttribute("aria-describedby", range.id);
  return li;
}

// Units with an unaccepted draft are listed apart from the (often collapsed) index: work in progress must never hide inside a 100-unit list.
function renderDraftsInProgress(proposals) {
  if (!draftsList) return;
  draftsList.replaceChildren();
  const open = proposals.filter((p) => p.generatable && p.latestDraft && p.latestDraft.status !== "ACCEPTED");
  for (const proposal of open) {
    const li = document.createElement("li");
    li.className = "source-draft-item";
    const rangeText = proposal.pageStart === proposal.pageEnd ? `página ${proposal.pageStart}` : `páginas ${proposal.pageStart}–${proposal.pageEnd}`;
    const title = createTextElement("span", "source-draft-item-title", proposal.title);
    const range = createTextElement("span", "lesson-hint", rangeText);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "small-button";
    button.dataset.action = "open-draft-in-progress";
    button.dataset.draftId = String(proposal.latestDraft.id);
    button.dataset.title = proposal.title;
    button.textContent = "Abrir rascunho";
    button.setAttribute("aria-label", `Abrir rascunho: ${proposal.title}, ${rangeText}`);
    li.append(title, range, button);
    draftsList.append(li);
  }
  if (draftsBox) draftsBox.hidden = open.length === 0;
}

draftsList?.addEventListener("click", async (event) => {
  const button = event.target.closest('[data-action="open-draft-in-progress"]');
  if (!button) return;
  button.disabled = true;
  const result = await DraftReviewUI.getDraft(button.dataset.draftId);
  button.disabled = false;
  if (!result.ok) {
    setSourcesMessage(result.message || "Não foi possível abrir o rascunho.", true);
    return;
  }
  await openEditor(result.draft, button.dataset.title ?? "Rascunho");
});

function renderSourceProposals(proposals) {
  if (!sourcesProposalsList) return;
  sourcesProposalsList.replaceChildren();
  editorialList?.replaceChildren();
  const content = proposals.filter((p) => p.generatable);
  const editorial = proposals.filter((p) => !p.generatable);
  for (const proposal of content) sourcesProposalsList.append(createSourceProposalItem(proposal));
  for (const proposal of editorial) editorialList?.append(createSourceProposalItem(proposal));
  if (indexSummary) indexSummary.textContent = `Índice do documento (${content.length} ${content.length === 1 ? "unidade" : "unidades"})`;
  if (indexDetails) indexDetails.open = content.length <= INDEX_OPEN_UP_TO;
  if (editorialDetails) {
    editorialDetails.hidden = editorial.length === 0;
    editorialDetails.open = false;
    if (editorialSummary) editorialSummary.textContent = `Páginas editoriais (${editorial.length}) — não geram conteúdo`;
  }
  if (sourcesProposalsPanel) sourcesProposalsPanel.hidden = proposals.length === 0;
  renderDraftsInProgress(proposals);
  topicResults?.replaceChildren();
}

// ---- topic search ------------------------------------------------------------------------------------------------------
function createTopicItem(candidate, query) {
  const li = document.createElement("li");
  li.className = "source-topic-item";
  li.dataset.ordinal = String(candidate.ordinal);
  li.append(createTextElement("p", "source-topic-title", candidate.title));
  li.append(createTextElement("p", "source-proposal-range", `${rangeLabel(candidate.pageStart, candidate.pageEnd)} · ${nf.format(candidate.chars)} caracteres`));
  if (candidate.excerpt) li.append(createTextElement("p", "source-topic-excerpt", candidate.excerpt));
  if (candidate.generatable) {
    const generate = document.createElement("button");
    generate.type = "button";
    generate.className = "small-button";
    generate.dataset.action = "generate-topic";
    generate.dataset.query = query;
    generate.textContent = "Gerar rascunho com IA";
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
    setSourcesMessage("Digite ao menos duas letras do assunto.", true);
    return;
  }
  setSourcesMessage("Procurando no documento…");
  const result = await SourceProposalsUI.searchTopics(currentSourceId, query);
  if (!result.ok) {
    setSourcesMessage(result.message || "Não foi possível buscar o assunto.", true);
    return;
  }
  topicResults.replaceChildren();
  if (result.candidates.length === 0) {
    setSourcesMessage("Nenhuma seção com esse assunto no índice do PDF. Tente outras palavras do título, ou use o índice do documento.", true);
    return;
  }
  for (const candidate of result.candidates) topicResults.append(createTopicItem(candidate, query));
  setSourcesMessage(`${result.candidates.length} ${result.candidates.length === 1 ? "seção encontrada" : "seções encontradas"}. Confira as páginas antes de gerar.`);
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
    setSourcesMessage(approved.message || "Não foi possível aprovar este trecho.", true);
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
    if (source.pageCount) li.append(document.createTextNode(" "), createTextElement("span", "source-existing-pages", `${nf.format(source.pageCount)} páginas`));
    const open = document.createElement("button");
    open.type = "button";
    open.className = "small-button";
    open.dataset.action = "open-source";
    open.dataset.sourceId = String(source.id);
    open.textContent = "Abrir";
    open.setAttribute("aria-label", `Abrir ${source.originalName}`);
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
  setSourcesMessage("Abrindo o documento…");
  const listed = await SourceProposalsUI.listProposals(currentSourceId);
  button.disabled = false;
  if (!listed.ok) {
    setSourcesMessage(listed.message || "Não foi possível abrir o documento.", true);
    return;
  }
  if (sourcesCoverageNote) { sourcesCoverageNote.hidden = true; sourcesCoverageNote.textContent = ""; }
  renderSourceProposals(listed.proposals);
  setSourcesMessage(`${listed.proposals.length} trecho(s) proposto(s). Diga o que você quer estudar, ou escolha no índice; revise os títulos antes de qualquer uso.`);
  topicInput?.focus({ preventScroll: true });
});

// The list is refreshed whenever the student opens Materiais (an upload elsewhere, another window, a first visit).
document.querySelector('[data-screen="materials"]')?.addEventListener("click", () => { loadExistingSources(); });

// ---- upload ------------------------------------------------------------------------------------------------------------
sourcesChooseFileButton?.addEventListener("click", () => {
  sourcesFileInput?.click();
});

async function showExistingProposals(sourceId, extraction, prefix = "") {
  const existing = await SourceProposalsUI.listProposals(sourceId);
  if (!existing.ok) return false;
  renderSourceProposals(existing.proposals);
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
    setSourcesMessage("Enviando PDF...");
    const uploadResult = await SourceProposalsUI.uploadSource(file);
    if (!uploadResult.ok) {
      setSourcesMessage(uploadResult.message || "Não foi possível enviar o arquivo.", true);
      return;
    }
    currentSourceId = uploadResult.source.id;

    setSourcesMessage("Extraindo texto do PDF...");
    const extractResult = await SourceProposalsUI.extractSource(uploadResult.source.id);
    if (!extractResult.ok) {
      setSourcesMessage(extractResult.message || "Não foi possível extrair o texto do PDF.", true);
      return;
    }
    if (extractResult.extraction.status !== "EXTRACTED") {
      setSourcesMessage(SourceProposalsUI.unreadableSourceMessage(extractResult.extraction.status), true);
      return;
    }

    setSourcesMessage("Gerando trechos propostos...");
    const chunkResult = await SourceProposalsUI.chunkSource(uploadResult.source.id);
    // The same PDF sent again: its trechos (and any rascunho or accepted content on them) already exist and are never
    // replaced silently. Land on them instead of a dead-end error.
    if (!chunkResult.ok && SourceProposalsUI.isAlreadyProcessed(chunkResult.code)) {
      if (await showExistingProposals(uploadResult.source.id, extractResult.extraction)) return;
    }
    if (!chunkResult.ok) {
      setSourcesMessage(chunkResult.message || "Não foi possível gerar propostas para este PDF.", true);
      return;
    }

    renderSourceProposals(chunkResult.proposals);
    // pages with no extractable text never became a proposal: say so, or silence reads as full coverage
    const skippedNote = SourceProposalsUI.skippedPagesNote(extractResult.extraction);
    // the status line is overwritten by the next action; the coverage note stays with the proposals it describes
    if (sourcesCoverageNote && skippedNote) { sourcesCoverageNote.textContent = skippedNote; sourcesCoverageNote.hidden = false; }
    setSourcesMessage(`${chunkResult.proposals.length} trecho(s) proposto(s). Diga o que você quer estudar, ou escolha no índice; revise os títulos antes de qualquer uso.${skippedNote ? ` ${skippedNote}` : ""}`);
    topicInput?.focus({ preventScroll: true });
    loadExistingSources();
  } catch (error) {
    setSourcesMessage("Não foi possível processar o arquivo selecionado.", true);
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
      toggleBtn.textContent = "Ocultar trecho da fonte";
    } else {
      excerptEl.hidden = true;
      toggleBtn.setAttribute("aria-expanded", "false");
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
      saveBtn.focus({ preventScroll: true }); // a disabled button drops keyboard focus
    }
    return;
  }

  const openBtn = event.target.closest('[data-action="open-draft"]');
  if (openBtn) {
    openBtn.disabled = true;
    const result = await DraftReviewUI.getDraft(openBtn.dataset.draftId);
    openBtn.disabled = false;
    if (!result.ok) {
      setSourcesMessage(result.message || "Não foi possível abrir o rascunho.", true);
      return;
    }
    await openEditor(result.draft, item.querySelector(".source-proposal-title-input")?.value ?? "Rascunho");
    return;
  }

  const generateBtn = event.target.closest('[data-action="generate-draft"]');
  if (generateBtn) {
    const proposal = {
      id: Number(proposalId),
      title: item.querySelector(".source-proposal-title-input")?.value ?? "Trecho",
      pageStart: Number(item.querySelector(".source-proposal-range")?.textContent.match(/\d+/g)?.[0]),
      pageEnd: Number(item.querySelector(".source-proposal-range")?.textContent.match(/\d+/g)?.at(-1)),
    };
    await generateFor(proposal);
    if (!activeEditor) generateBtn.focus({ preventScroll: true });
  }
}
sourcesProposalsList?.addEventListener("click", onIndexClick);
editorialList?.addEventListener("click", onIndexClick);
