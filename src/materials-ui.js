// Materiais: upload a PDF, review the proposed trechos, generate/inspect/correct an AI draft and accept it into
// normal study. Moved out of src/app.js unchanged in behaviour (DECOMP-2): the DOM, the events and the rendering
// of this screen live here; what belongs to other screens is passed in once through configureMaterialsUI.
import * as SourceProposalsUI from "./source-proposals-ui.js";
import * as DraftReviewUI from "./draft-review-ui.js";
import { formatPageList, createSourceDetails } from "./source-details-ui.js";
import { createTextElement } from "./dom-utils.js";
import { enhanceSelect } from "./select-ui.js";

const sourcesChooseFileButton = document.querySelector("#sources-choose-file");
const sourcesFileInput = document.querySelector("#sources-file-input");
const sourcesMessage = document.querySelector("#sources-message");
const sourcesProposalsPanel = document.querySelector("#sources-proposals-panel");
const sourcesProposalsList = document.querySelector("#sources-proposals-list");
const sourcesCoverageNote = document.querySelector("#sources-coverage-note");

// What Materiais needs from the rest of the app (set once at start-up, before any user event can fire):
//   listActiveSubjects()  -> Promise<subject[]>   disciplines offered when accepting a draft
//   getLocalDateValue()   -> "YYYY-MM-DD"         default date of the lesson
//   startStudyNow(unit, subjectName)               "Estudar agora" right after an accept
//   refreshAfterAccept()  -> Promise               refresh Disciplinas, Plano and Hoje once a unit exists
let deps = null;
export function configureMaterialsUI(next) {
  deps = next;
}

function setSourcesMessage(message = "", isError = false) {
  if (!sourcesMessage) return;
  sourcesMessage.classList.toggle("is-error", isError);
  sourcesMessage.textContent = message;
  // The list of proposals can be long (a 150-page PDF = 15 items): an error raised far below must not be
  // left off-screen, or the student clicks and sees nothing happen.
  if (isError && message) sourcesMessage.scrollIntoView({ block: "nearest" });
}

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

  const generateDraftBtn = document.createElement("button");
  generateDraftBtn.type = "button";
  generateDraftBtn.className = "small-button";
  generateDraftBtn.dataset.action = "generate-draft";
  generateDraftBtn.textContent = "Gerar rascunho com IA";

  const draftPanel = document.createElement("div");
  draftPanel.className = "source-draft-panel";
  // A focus target for when the draft appears or is re-rendered (the button that was pressed is gone or disabled).
  draftPanel.tabIndex = -1;
  draftPanel.setAttribute("role", "group");
  draftPanel.setAttribute("aria-label", "Rascunho para revisar");
  draftPanel.hidden = true;

  // The same three buttons repeat in every trecho: the pages of the trecho they belong to are their description.
  for (const button of [saveBtn, toggleBtn, generateDraftBtn]) button.setAttribute("aria-describedby", range.id);

  li.append(range, titleInput, saveBtn, toggleBtn, excerpt, generateDraftBtn, draftPanel);
  return li;
}

const DRAFT_ISSUE_LABELS = {
  SUMMARY_UNSUPPORTED_VALUE: "Valor que a fonte não traz",
  SUMMARY_UNSUPPORTED_TERM: "Termo que não aparece na fonte",
  SUMMARY_OMITS_CENTRAL_CONCEPT: "Pode omitir um conceito central",
  SUMMARY_TOO_THIN: "Resumo curto demais para a fonte",
  QUESTION_ANSWER_TOO_THIN: "Resposta sem explicação suficiente",
  QUESTION_NO_EXPLANATION: "Falta explicar por quê",
  QUESTION_ANSWER_LEAKED: "O enunciado já dá a resposta",
  HINT_REVEALS_ANSWER: "A dica entrega a resposta",
  QUESTION_UNSUPPORTED_VALUE: "Valor que a página citada não traz",
  QUESTION_UNSUPPORTED_TERM: "Termo que não aparece na página citada",
  QUESTION_LOW_SOURCE_SUPPORT: "Pouco apoio na página citada",
  QUESTION_DUPLICATE: "Questão repetida",
  QUESTION_LITERAL_COPY: "Resposta copiada da fonte",
};

const DRAFT_QUESTION_TYPE_LABELS = {
  RECALL: "Recordação",
  CONCEPT: "Conceito",
  MECHANISM: "Mecanismo",
  APPLICATION: "Aplicação",
  DISCRIMINATION: "Discriminação",
  CLINICAL_REASONING: "Raciocínio clínico",
  TRANSFER: "Transferência",
};

function draftFindingScopeLabel(scope) {
  if (scope === "summary") return "Resumo";
  const m = /^question:(\d+)$/.exec(scope ?? "");
  return m ? `Questão ${Number(m[1]) + 1}` : "Rascunho";
}

// The automatic check is a screen, not a verdict: it says where to look. "No flags" is never "verified".
function createDraftAudit(audit) {
  const box = document.createElement("div");
  box.className = "source-draft-audit";
  const flagged = (audit.findings ?? []).filter((f) => f.severity !== "LOW");
  box.dataset.result = flagged.length > 0 ? "REPAIR" : "PASS";
  const head = flagged.length > 0
    ? `Conferência automática: ${flagged.length} ${flagged.length === 1 ? "ponto" : "pontos"} para verificar antes de aceitar`
    : "Conferência automática: nada sinalizado. Isso não é validação médica — confira a fonte.";
  box.append(createTextElement("p", "source-draft-audit-head", head));
  if (audit.repaired) {
    box.append(createTextElement("p", "source-draft-audit-note", "O rascunho foi corrigido uma vez automaticamente a partir dos pontos apontados."));
  }
  if (audit.modelAudit === "UNAVAILABLE" || audit.modelAudit === "MALFORMED") {
    box.append(createTextElement("p", "source-draft-audit-note", "A auditoria por modelo não pôde ser concluída; só a conferência automática básica foi feita."));
  }
  const list = document.createElement("ul");
  list.className = "source-draft-audit-list";
  for (const f of flagged) {
    const item = document.createElement("li");
    item.append(createTextElement("p", "source-draft-audit-issue", `${draftFindingScopeLabel(f.scope)} · ${DRAFT_ISSUE_LABELS[f.issue] ?? f.issue}`));
    if (f.generatedClaim) item.append(createTextElement("p", "source-draft-audit-claim", `No rascunho: ${f.generatedClaim}`));
    if (f.sourceEvidence) item.append(createTextElement("p", "source-draft-audit-evidence", `Na fonte: ${f.sourceEvidence}`));
    if (f.repair) item.append(createTextElement("p", "source-draft-audit-repair", f.repair));
    // In a long draft the reviewer must reach the flagged item in one step, not hunt through 50 blocks.
    const target = /^question:(\d+)$/.exec(f.scope ?? "");
    const goto = document.createElement("button");
    goto.type = "button";
    goto.className = "text-button source-draft-goto";
    goto.dataset.action = "goto-draft-question";
    goto.dataset.index = target ? target[1] : "summary";
    goto.textContent = target ? `Corrigir a questão ${Number(target[1]) + 1}` : "Corrigir o resumo";
    item.append(goto);
    list.append(item);
  }
  if (flagged.length > 0) box.append(list);
  return box;
}

// The reviewer's own corrections to a flagged draft (CQ-6). One collapsed block: summary plus, per question,
// the wording, answer, explanation and hint — exactly the fields the screen can flag. Saving re-runs the
// screen on the server, so a fixed point disappears and a remaining one stays visible.
function createDraftEditor(draft) {
  const details = document.createElement("details");
  details.className = "source-draft-editor";
  const summaryEl = document.createElement("summary");
  summaryEl.textContent = "Corrigir o rascunho";
  details.append(summaryEl);

  const field = (labelText, tag, className, value, rows) => {
    const label = document.createElement("label");
    label.className = "source-draft-edit-field";
    label.append(createTextElement("span", "source-draft-edit-label", labelText));
    const input = document.createElement(tag);
    input.className = className;
    if (tag === "textarea") input.rows = rows ?? 3;
    else input.type = "text";
    input.value = value ?? "";
    label.append(input);
    return label;
  };

  details.append(field("Resumo Mestre", "textarea", "source-draft-edit-summary", draft.summary, 7));
  (draft.questions ?? []).forEach((q, index) => {
    const group = document.createElement("div");
    group.className = "source-draft-edit-question";
    group.dataset.index = String(index);
    group.append(
      createTextElement("p", "source-draft-edit-label", `Questão ${index + 1}`),
      field("Enunciado", "textarea", "source-draft-edit-q", q.question, 2),
      field("Resposta", "textarea", "source-draft-edit-a", q.answer, 2),
      field("Por quê (explicação)", "textarea", "source-draft-edit-e", q.explanation, 3),
      field("Dica (opcional)", "input", "source-draft-edit-h", q.hint),
    );
    details.append(group);
  });

  const save = document.createElement("button");
  save.type = "button";
  save.className = "primary-button";
  save.dataset.action = "save-draft";
  save.textContent = "Salvar correções";
  const editMessage = createTextElement("p", "source-draft-edit-message", "");
  editMessage.setAttribute("role", "status"); // an error on save is announced, not only painted
  details.append(save, editMessage);
  return details;
}

// The draft object each panel currently shows (spans, types and pages are not editable, so a save sends them back untouched).
const draftByPanel = new WeakMap();

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
  draftByPanel.set(draftPanel, draft);
  draftPanel.replaceChildren();

  const caveat = createTextElement(
    "p",
    "source-draft-caveat",
    "Rascunho gerado por IA — não verificado. Revise cada questão antes de aceitar; isto não é uma validação científica ou médica do conteúdo.",
  );
  const summary = createTextElement("p", "source-draft-summary", draft.summary);
  const pagesByIndex = new Map((draft.pages ?? []).map((p) => [p.pageIndex, p]));
  const pagesFor = (spans) => (spans ?? []).map((s) => pagesByIndex.get(s.pageIndex) ?? { pageIndex: s.pageIndex, text: null });
  const summaryOrigin = draft.summarySourceSpans?.length
    ? createSourceDetails(`Fonte do resumo · ${draft.summarySourceSpans.length > 1 ? "páginas" : "página"} ${formatPageList(draft.summarySourceSpans.map((s) => s.pageIndex))}`, pagesFor(draft.summarySourceSpans))
    : null;
  const auditBox = draft.audit ? createDraftAudit(draft.audit) : null;
  const flaggedQuestions = new Set();
  for (const f of draft.audit?.findings ?? []) {
    const m = f.severity !== "LOW" ? /^question:(\d+)$/.exec(f.scope ?? "") : null;
    if (m) flaggedQuestions.add(Number(m[1]));
  }

  const questionsList = document.createElement("ul");
  questionsList.className = "source-draft-questions";
  for (const question of draft.questions ?? []) {
    const item = document.createElement("li");
    item.append(
      createTextElement("p", "source-draft-question", question.question),
      createTextElement("p", "source-draft-answer", question.answer),
    );
    if (question.explanation) item.append(createTextElement("p", "source-draft-explanation", `Por quê: ${question.explanation}`));
    if (flaggedQuestions.has(draft.questions.indexOf(question))) {
      item.classList.add("is-flagged");
      item.prepend(createTextElement("span", "study-now-chip source-draft-flag-chip", "Sinalizada"));
    }
    if (question.questionType && DRAFT_QUESTION_TYPE_LABELS[question.questionType]) {
      item.prepend(createTextElement("span", "study-now-chip source-draft-question-type", DRAFT_QUESTION_TYPE_LABELS[question.questionType]));
    }
    if (question.sourceSpans?.length) {
      item.append(createSourceDetails(
        `Fonte da questão · ${question.sourceSpans.length > 1 ? "páginas" : "página"} ${formatPageList(question.sourceSpans.map((s) => s.pageIndex))}`,
        pagesFor(question.sourceSpans),
      ));
    }
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
  dateInput.value = deps.getLocalDateValue();
  dateInput.setAttribute("aria-label", "Data da aula");

  const acceptBtn = document.createElement("button");
  acceptBtn.type = "button";
  acceptBtn.className = "primary-button";
  acceptBtn.dataset.action = "accept-draft";
  acceptBtn.textContent = "Aceitar e criar aula";

  const resultMessage = createTextElement("p", "source-draft-result", "");
  resultMessage.setAttribute("role", "status"); // "Aula criada" / an accept error is announced, not only painted

  draftPanel.append(caveat, ...(auditBox ? [auditBox] : []), summary, ...(summaryOrigin ? [summaryOrigin] : []), questionsList, ...(draft.status === "DRAFT" ? [createDraftEditor(draft)] : []), subjectSelect, subjectInput, dateInput, acceptBtn, resultMessage);
  draftPanel.hidden = false;
  enhanceSelect(subjectSelect);
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
  if (sourcesCoverageNote) { sourcesCoverageNote.hidden = true; sourcesCoverageNote.textContent = ""; } // never leave a warning from the previous PDF

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
      setSourcesMessage(SourceProposalsUI.unreadableSourceMessage(extractResult.extraction.status), true);
      return;
    }

    setSourcesMessage("Gerando trechos propostos...");
    const chunkResult = await SourceProposalsUI.chunkSource(uploadResult.source.id);
    // The same PDF sent again: its trechos (and any rascunho or accepted content on them) already exist and are never
    // replaced silently. Land on them instead of a dead-end error.
    if (!chunkResult.ok && SourceProposalsUI.isAlreadyProcessed(chunkResult.code)) {
      const existing = await SourceProposalsUI.listProposals(uploadResult.source.id);
      if (existing.ok) {
        renderSourceProposals(existing.proposals);
        setSourcesMessage(SourceProposalsUI.alreadyProcessedMessage(existing.proposals.length, extractResult.extraction));
        return;
      }
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
    setSourcesMessage(`${chunkResult.proposals.length} trecho(s) proposto(s). Revise e ajuste os títulos antes de qualquer uso.${skippedNote ? ` ${skippedNote}` : ""}`);
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

  const generateDraftBtn = event.target.closest('[data-action="generate-draft"]');
  if (generateDraftBtn) {
    const draftPanel = item.querySelector(".source-draft-panel");
    if (!draftPanel) return;
    generateDraftBtn.disabled = true; // a disabled button drops keyboard focus: it is put back below
    setSourcesMessage("Gerando rascunho com IA...");
    let generated = false;
    try {
      const result = await DraftReviewUI.generateDraft(proposalId);
      if (!result.ok) {
        setSourcesMessage(result.message || "Não foi possível gerar o rascunho.", true);
        return;
      }
      // P1_PRODUCT A: existing subjects, so the accept form can offer
      // reusing one instead of only ever creating a new one.
      const existingSubjects = await deps.listActiveSubjects().catch(() => []);
      renderDraftPanel(draftPanel, result.draft, existingSubjects);
      setSourcesMessage("Rascunho gerado. Revise antes de aceitar.");
      generated = true;
    } finally {
      generateDraftBtn.disabled = false;
      // success: keyboard/screen-reader focus goes to the draft to review; failure: back to the button that was pressed
      // (on failure the button was just pressed, so it is on screen: do not scroll, or the error message scrolls away)
      if (generated) draftPanel.focus(); else generateDraftBtn.focus({ preventScroll: true });
    }
    return;
  }

  const gotoBtn = event.target.closest('[data-action="goto-draft-question"]');
  if (gotoBtn) {
    const draftPanel = item.querySelector(".source-draft-panel");
    const editor = draftPanel?.querySelector(".source-draft-editor");
    if (!draftPanel || !editor) return;
    editor.open = true;
    const target = gotoBtn.dataset.index === "summary"
      ? editor.querySelector(".source-draft-edit-summary")
      : editor.querySelector(`.source-draft-edit-question[data-index="${gotoBtn.dataset.index}"] .source-draft-edit-a`);
    if (target) {
      target.scrollIntoView({ block: "center" });
      target.focus({ preventScroll: true });
    }
    return;
  }

  const saveDraftBtn = event.target.closest('[data-action="save-draft"]');
  if (saveDraftBtn) {
    const draftPanel = item.querySelector(".source-draft-panel");
    const current = draftPanel ? draftByPanel.get(draftPanel) : null;
    if (!draftPanel || !current) return;
    const message = draftPanel.querySelector(".source-draft-edit-message");
    const questions = (current.questions ?? []).map((q, index) => {
      const group = draftPanel.querySelector(`.source-draft-edit-question[data-index="${index}"]`);
      const read = (selector) => group?.querySelector(selector)?.value.trim() ?? "";
      return {
        question: read(".source-draft-edit-q"),
        answer: read(".source-draft-edit-a"),
        explanation: read(".source-draft-edit-e") || null,
        questionType: q.questionType ?? null,
        hint: read(".source-draft-edit-h") || null,
        sourceSpans: q.sourceSpans,
      };
    });
    const summary = draftPanel.querySelector(".source-draft-edit-summary")?.value.trim() ?? "";
    // keep what the student already typed in the accept form across the re-render
    const kept = {
      subjectId: draftPanel.querySelector(".source-draft-subject-select")?.value ?? "",
      subjectName: draftPanel.querySelector(".source-draft-subject-input")?.value ?? "",
      date: draftPanel.querySelector(".source-draft-date-input")?.value ?? "",
    };
    saveDraftBtn.disabled = true;
    let saved = false;
    try {
      const result = await DraftReviewUI.reviseDraft(draftPanel.dataset.draftId, { summary, questions });
      if (!result.ok) {
        if (message) { message.classList.add("is-error"); message.textContent = result.message || "Não foi possível salvar as correções."; }
        return;
      }
      const existingSubjects = await deps.listActiveSubjects().catch(() => []);
      renderDraftPanel(draftPanel, result.draft, existingSubjects);
      const select = draftPanel.querySelector(".source-draft-subject-select");
      const nameInput = draftPanel.querySelector(".source-draft-subject-input");
      const dateInput = draftPanel.querySelector(".source-draft-date-input");
      if (select && kept.subjectId) { select.value = kept.subjectId; select.dispatchEvent(new Event("change")); }
      if (nameInput && !kept.subjectId) nameInput.value = kept.subjectName;
      if (dateInput && kept.date) dateInput.value = kept.date;
      setSourcesMessage("Correções salvas. A conferência automática foi refeita.");
      saved = true;
    } finally {
      saveDraftBtn.disabled = false;
      // the panel was re-rendered on success (the button no longer exists): focus the draft, whose check just re-ran
      if (saved) draftPanel.focus(); else saveDraftBtn.focus({ preventScroll: true });
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
        acceptDraftBtn.focus({ preventScroll: true });
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
          deps.startStudyNow(result.acceptance.unit, result.acceptance.subject?.name);
        });
        draftPanel.append(studyNowBtn);
      }
      // the pressed button is now disabled ("Aceito"): the one obvious next action takes the focus
      draftPanel.querySelector('[data-action="study-now"]')?.focus();
      await deps.refreshAfterAccept();
    } catch (error) {
      if (resultMessage) { resultMessage.classList.add("is-error"); resultMessage.textContent = "Não foi possível aceitar o rascunho."; }
      console.error("Falha ao aceitar rascunho.", error);
      acceptDraftBtn.disabled = false;
      acceptDraftBtn.focus({ preventScroll: true });
    }
  }
});
