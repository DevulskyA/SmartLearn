// LESSON EDITOR. A lesson is not one block of text: it is SUMMARY + QUESTIONS[] + SOURCE + REVIEW, each its own area and each
// saved on its own (PATCH summary / PATCH question by stable id). Editing one question never rewrites the summary or the other
// questions, and the audit findings live in their own tab instead of being poured into the content.
//
// DOM semantics matter here because people copy text out of this screen: content lives only in <textarea>s and content <p>s;
// state words, counts, buttons and findings are separate elements, always separated by real text, never glued to the content.
import { createTextElement } from "./dom-utils.js";
import { createSourceDetails, formatPageList } from "./source-details-ui.js";
import { enhanceSelect } from "./select-ui.js";
import {
  QUESTION_TYPE_LABELS, issueLabel, groupFindings, questionState, reviewOverview, keptQuestionCount, sourceLine, summaryBlocks,
} from "./lesson-view-model.js";

const TABS = [
  { key: "summary", label: "Resumo" },
  { key: "questions", label: "Questões" },
  { key: "source", label: "Fonte" },
  { key: "review", label: "Revisão" },
];

let editorSeq = 0;

function button(className, text, action, type = "button") {
  const b = document.createElement("button");
  b.type = type;
  b.className = className;
  b.textContent = text;
  if (action) b.dataset.action = action;
  return b;
}

function labelledField(idBase, labelText, tag, value, rows) {
  const wrap = document.createElement("div");
  wrap.className = "lesson-field";
  const label = document.createElement("label");
  label.htmlFor = idBase;
  label.className = "lesson-field-label";
  label.textContent = labelText;
  const input = document.createElement(tag);
  input.id = idBase;
  input.className = "lesson-field-input";
  if (tag === "textarea") input.rows = rows ?? 3;
  else input.type = "text";
  input.value = value ?? "";
  wrap.append(label, input);
  return { wrap, input };
}

const statusMessage = () => {
  const p = createTextElement("p", "form-message lesson-message", "");
  p.setAttribute("role", "status");
  return p;
};

function setMessage(el, text, isError = false) {
  el.classList.toggle("is-error", Boolean(isError));
  el.textContent = text;
}

/**
 * @param {object} options
 *   draft      the draft DTO (summary, summaryVersion, questions[{id,...}], audit, sourceScope, pages, revision)
 *   title      the unit title
 *   subjects   disciplines offered when accepting
 *   today      "YYYY-MM-DD"
 *   deps       { reviseSummary, reviseQuestion, deleteQuestion, acceptDraft, getDraft, onBack, startStudyNow, refreshAfterAccept }
 */
export function createLessonEditor({ draft: initialDraft, title, subjects = [], today, deps }) {
  const uid = `lesson-${(editorSeq += 1)}`;
  let draft = initialDraft;
  let activeTab = "summary";
  let selectedId = draft.questions[0]?.id ?? null;
  let summaryBuffer = null; // unsaved text of the summary (null = nothing typed)
  const questionBuffers = new Map(); // questionId -> { question, answer, explanation, hint } typed but not saved
  let accepted = false;

  const root = document.createElement("article");
  root.className = "lesson-editor";
  root.setAttribute("aria-labelledby", `${uid}-title`);
  root.dataset.draftId = String(draft.id);
  root.dataset.revision = String(draft.revision);

  // ---- header ---------------------------------------------------------------------------------------------------------
  const head = document.createElement("header");
  head.className = "lesson-head";
  const back = button("text-button lesson-back", "← Voltar às unidades", "lesson-back");
  const eyebrow = createTextElement("p", "eyebrow", "Rascunho gerado por IA — não verificado");
  const heading = createTextElement("h2", "lesson-title", title);
  heading.id = `${uid}-title`;
  heading.tabIndex = -1;
  const sourceEl = createTextElement("p", "lesson-source-line", "");
  head.append(back, eyebrow, heading, sourceEl);

  // ---- tabs -----------------------------------------------------------------------------------------------------------
  const tablist = document.createElement("div");
  tablist.className = "lesson-tabs";
  tablist.setAttribute("role", "tablist");
  tablist.setAttribute("aria-label", "Partes da aula");
  const tabButtons = new Map();
  const panels = new Map();
  for (const tab of TABS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "lesson-tab";
    b.id = `${uid}-tab-${tab.key}`;
    b.dataset.tab = tab.key;
    b.setAttribute("role", "tab");
    b.setAttribute("aria-controls", `${uid}-panel-${tab.key}`);
    const labelSpan = createTextElement("span", "lesson-tab-label", tab.label);
    const countSpan = createTextElement("span", "lesson-tab-count", "");
    b.append(labelSpan, document.createTextNode(" "), countSpan);
    tablist.append(b);
    tabButtons.set(tab.key, { b, countSpan });

    const panel = document.createElement("section");
    panel.className = "lesson-panel";
    panel.id = `${uid}-panel-${tab.key}`;
    panel.dataset.panel = tab.key;
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", b.id);
    panel.tabIndex = -1;
    panels.set(tab.key, panel);
  }

  // ---- SUMMARY panel ---------------------------------------------------------------------------------------------------
  const summaryPanel = panels.get("summary");
  const summaryField = labelledField(`${uid}-summary`, "Resumo Mestre", "textarea", draft.summary, 18);
  summaryField.input.classList.add("lesson-summary-input");
  summaryField.input.dataset.part = "summary";
  const summaryHint = createTextElement("p", "lesson-hint", "Só o texto do resumo fica aqui. Salvar o resumo não altera nenhuma questão. Use uma linha começando com ## para criar um título de seção.");
  const summaryActions = document.createElement("div");
  summaryActions.className = "lesson-actions";
  const summarySave = button("primary-button", "Salvar resumo", "save-summary");
  const summaryDirty = createTextElement("span", "lesson-dirty", "");
  const summaryToggle = button("secondary-button", "Ler como aula", "toggle-summary-read");
  summaryToggle.setAttribute("aria-pressed", "false");
  summaryActions.append(summarySave, document.createTextNode(" "), summaryToggle, document.createTextNode(" "), summaryDirty);
  const summaryMessage = statusMessage();
  // Reading view: the same text laid out as headings and paragraphs (a "## " line is a section title). Display only.
  const summaryRead = document.createElement("div");
  summaryRead.className = "lesson-summary-read";
  summaryRead.hidden = true;
  summaryPanel.append(summaryField.wrap, summaryRead, summaryHint, summaryActions, summaryMessage);

  // ---- QUESTIONS panel -------------------------------------------------------------------------------------------------
  const questionsPanel = panels.get("questions");
  const qLayout = document.createElement("div");
  qLayout.className = "lesson-questions";
  const qList = document.createElement("ol");
  qList.className = "lesson-qlist";
  qList.setAttribute("aria-label", "Questões da aula");
  const qEditor = document.createElement("div");
  qEditor.className = "lesson-qeditor";
  qLayout.append(qList, qEditor);
  questionsPanel.append(qLayout);

  // ---- SOURCE panel ----------------------------------------------------------------------------------------------------
  const sourcePanel = panels.get("source");
  // ---- REVIEW panel ----------------------------------------------------------------------------------------------------
  const reviewPanel = panels.get("review");

  // ---- ACCEPT footer ---------------------------------------------------------------------------------------------------
  const footer = document.createElement("section");
  footer.className = "lesson-accept";
  footer.setAttribute("aria-label", "Aceitar a aula");
  const acceptNote = createTextElement("p", "lesson-accept-note", "");
  const subjectField = document.createElement("div");
  subjectField.className = "lesson-field";
  const subjectLabel = createTextElement("label", "lesson-field-label", "Disciplina");
  subjectLabel.htmlFor = `${uid}-subject`;
  const subjectSelect = document.createElement("select");
  subjectSelect.id = `${uid}-subject`;
  subjectSelect.className = "source-draft-subject-select";
  const newOption = document.createElement("option");
  newOption.value = "";
  newOption.textContent = "Criar nova disciplina";
  subjectSelect.append(newOption);
  for (const subject of subjects) {
    const opt = document.createElement("option");
    opt.value = String(subject.id);
    opt.textContent = subject.name;
    subjectSelect.append(opt);
  }
  subjectField.append(subjectLabel, subjectSelect);
  const nameField = labelledField(`${uid}-subject-name`, "Nome da nova disciplina", "input", "");
  nameField.input.classList.add("source-draft-subject-input");
  const dateField = labelledField(`${uid}-date`, "Data da aula", "input", today);
  dateField.input.type = "date";
  dateField.input.classList.add("source-draft-date-input");
  const acceptBtn = button("primary-button", "Aceitar e criar aula", "accept-draft");
  const acceptMessage = statusMessage();
  acceptMessage.classList.add("source-draft-result");
  const afterAccept = document.createElement("div");
  afterAccept.className = "lesson-actions";
  footer.append(acceptNote, subjectField, nameField.wrap, dateField.wrap, acceptBtn, acceptMessage, afterAccept);
  subjectSelect.addEventListener("change", () => {
    const picked = subjectSelect.value !== "";
    nameField.input.disabled = picked;
    if (picked) nameField.input.value = "";
  });

  root.append(head, tablist, ...TABS.map((t) => panels.get(t.key)), footer);

  // ================================================================================================================
  // rendering
  // ================================================================================================================
  function questionById(id) {
    return draft.questions.find((q) => q.id === id) ?? null;
  }
  function findingsOfQuestion(id) {
    return groupFindings(draft).byQuestion.get(id) ?? [];
  }

  function renderHeader() {
    sourceEl.textContent = sourceLine(draft);
    sourceEl.hidden = sourceEl.textContent === "";
  }

  function renderTabs() {
    const overview = reviewOverview(draft);
    tabButtons.get("questions").countSpan.textContent = String(draft.questions.length);
    tabButtons.get("review").countSpan.textContent = overview.pending > 0 ? `⚠ ${overview.total}` : "✓";
    tabButtons.get("review").countSpan.dataset.state = overview.pending > 0 ? "flagged" : "clear";
    for (const tab of TABS) {
      const { b } = tabButtons.get(tab.key);
      const on = tab.key === activeTab;
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
      panels.get(tab.key).hidden = !on;
    }
  }

  function renderSummary() {
    if (document.activeElement !== summaryField.input && summaryBuffer === null) summaryField.input.value = draft.summary;
    // where the summary came from, with the page text one click away (read live from the proposal's own pages)
    summaryPanel.querySelector(":scope > .summary-source")?.remove();
    const spans = draft.summarySourceSpans ?? [];
    if (spans.length > 0) {
      const byIndex = new Map((draft.pages ?? []).map((p) => [p.pageIndex, p]));
      summaryPanel.insertBefore(createSourceDetails(
        `Fonte do resumo · ${spans.length > 1 ? "páginas" : "página"} ${formatPageList(spans.map((s) => s.pageIndex))}`,
        spans.map((sp) => byIndex.get(sp.pageIndex) ?? { pageIndex: sp.pageIndex, text: null }),
      ), summaryHint);
    }
    const dirty = summaryBuffer !== null && summaryBuffer !== draft.summary;
    summarySave.disabled = !dirty;
    summaryDirty.textContent = dirty ? "Alterações não salvas" : "";
  }

  function renderQuestionList() {
    qList.replaceChildren();
    draft.questions.forEach((q, index) => {
      const state = questionState(q, q.findingCount ?? findingsOfQuestion(q.id).length);
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.className = "lesson-qitem";
      b.dataset.qid = q.id;
      b.dataset.state = state.key;
      if (q.id === selectedId) b.setAttribute("aria-current", "true");
      b.append(createTextElement("span", "lesson-qitem-name", `Questão ${index + 1}`), document.createTextNode(" "));
      const chip = createTextElement("span", "lesson-qchip", "");
      chip.append(createTextElement("span", "lesson-qchip-symbol", state.symbol), document.createTextNode(" "), createTextElement("span", "lesson-qchip-word", state.label));
      if (state.count > 0) chip.append(document.createTextNode(" "), createTextElement("span", "lesson-qchip-count", `${state.count} ${state.count === 1 ? "ponto" : "pontos"}`));
      if (questionBuffers.has(q.id)) chip.append(document.createTextNode(" "), createTextElement("span", "lesson-qchip-dirty", "não salva"));
      b.append(chip);
      li.append(b);
      qList.append(li);
    });
  }

  function renderQuestionEditor() {
    qEditor.replaceChildren();
    const q = questionById(selectedId);
    if (!q) {
      qEditor.append(createTextElement("p", "lesson-hint", "Esta aula não tem mais questões."));
      return;
    }
    const buffer = questionBuffers.get(q.id) ?? {};
    const value = (key) => (buffer[key] !== undefined ? buffer[key] : (q[key] ?? ""));
    const index = draft.questions.indexOf(q);
    const idBase = `${uid}-q-${q.id}`;

    const titleRow = document.createElement("div");
    titleRow.className = "lesson-qtitle";
    titleRow.append(createTextElement("h3", "lesson-qheading", `Questão ${index + 1}`));
    if (q.questionType && QUESTION_TYPE_LABELS[q.questionType]) {
      titleRow.append(document.createTextNode(" "), createTextElement("span", "study-now-chip lesson-qtype", QUESTION_TYPE_LABELS[q.questionType]));
    }

    const fPrompt = labelledField(`${idBase}-prompt`, "Pergunta", "textarea", value("question"), 3);
    const fAnswer = labelledField(`${idBase}-answer`, "Resposta", "textarea", value("answer"), 3);
    const fExplanation = labelledField(`${idBase}-explanation`, "Explicação (por quê)", "textarea", value("explanation"), 4);
    const fHint = labelledField(`${idBase}-hint`, "Dica (opcional)", "input", value("hint"));
    const inputs = { question: fPrompt.input, answer: fAnswer.input, explanation: fExplanation.input, hint: fHint.input };
    for (const input of Object.values(inputs)) input.dataset.part = q.id;
    for (const [key, input] of Object.entries(inputs)) {
      input.addEventListener("input", () => {
        const current = questionBuffers.get(q.id) ?? {};
        current[key] = input.value;
        questionBuffers.set(q.id, current);
        save.disabled = false;
        dirtyEl.textContent = "Alterações não salvas";
        renderQuestionList();
      });
    }

    const sourceBlock = document.createElement("div");
    sourceBlock.className = "lesson-qsource";
    const spans = q.sourceSpans ?? [];
    if (spans.length > 0) {
      const byIndex = new Map((draft.pages ?? []).map((p) => [p.pageIndex, p]));
      sourceBlock.append(createSourceDetails(
        `Fonte desta questão · ${spans.length > 1 ? "páginas" : "página"} ${formatPageList(spans.map((s) => s.pageIndex))}`,
        spans.map((s) => byIndex.get(s.pageIndex) ?? { pageIndex: s.pageIndex, text: null }),
      ));
    }

    const actions = document.createElement("div");
    actions.className = "lesson-actions";
    const save = button("primary-button", "Salvar questão", "save-question");
    save.disabled = !questionBuffers.has(q.id);
    const acceptQ = button("secondary-button", q.status === "ACCEPTED" ? "Questão aceita ✓" : "Aceitar questão", "accept-question");
    acceptQ.disabled = q.status === "ACCEPTED";
    const rejectQ = button("secondary-button", q.status === "REJECTED" ? "Restaurar questão" : "Rejeitar questão", "toggle-reject-question");
    const del = button("text-button lesson-danger", "Excluir questão", "delete-question");
    const dirtyEl = createTextElement("span", "lesson-dirty", questionBuffers.has(q.id) ? "Alterações não salvas" : "");
    actions.append(save, acceptQ, rejectQ, del, document.createTextNode(" "), dirtyEl);
    const message = statusMessage();
    message.id = `${idBase}-message`;

    const findings = findingsOfQuestion(q.id);
    const findingsBlock = renderFindingList(findings, "Pontos para verificar nesta questão");

    const run = async (fn, okText) => {
      for (const b of actions.querySelectorAll("button")) b.disabled = true;
      setMessage(message, "Salvando…");
      const result = await fn();
      if (!result.ok) {
        setMessage(message, result.message || "Não foi possível salvar.", true);
        for (const b of actions.querySelectorAll("button")) b.disabled = false;
        acceptQ.disabled = q.status === "ACCEPTED";
        save.disabled = !questionBuffers.has(q.id);
        return;
      }
      questionBuffers.delete(q.id);
      applyDraft(result.draft, { keepSelection: result.keepId ?? q.id });
      const live = qEditor.querySelector(".lesson-message");
      if (live) setMessage(live, okText);
    };
    const editedFields = () => ({
      question: inputs.question.value.trim(),
      answer: inputs.answer.value.trim(),
      explanation: inputs.explanation.value.trim() || null,
      hint: inputs.hint.value.trim() || null,
    });
    save.addEventListener("click", () => run(() => deps.reviseQuestion(draft.id, q.id, { ...editedFields(), expectedVersion: q.version }), "Questão salva."));
    acceptQ.addEventListener("click", () => run(() => deps.reviseQuestion(draft.id, q.id, { ...editedFields(), status: "ACCEPTED", expectedVersion: q.version }), "Questão aceita."));
    rejectQ.addEventListener("click", () => run(() => deps.reviseQuestion(draft.id, q.id, { ...editedFields(), status: q.status === "REJECTED" ? "PROPOSED" : "REJECTED", expectedVersion: q.version }), q.status === "REJECTED" ? "Questão restaurada." : "Questão rejeitada: não vira exercício."));
    del.addEventListener("click", () => {
      if (!window.confirm(`Excluir a questão ${index + 1} de vez? As outras questões e o resumo não mudam.`)) return;
      const next = draft.questions[index + 1]?.id ?? draft.questions[index - 1]?.id ?? null;
      run(async () => ({ ...(await deps.deleteQuestion(draft.id, q.id)), keepId: next }), "Questão excluída.");
    });

    qEditor.append(titleRow, fPrompt.wrap, fAnswer.wrap, fExplanation.wrap, fHint.wrap, sourceBlock, actions, message, findingsBlock);
  }

  function renderFindingList(findings, heading) {
    const block = document.createElement("section");
    block.className = "lesson-findings";
    block.setAttribute("aria-label", heading);
    if (findings.length === 0) {
      block.append(createTextElement("p", "lesson-hint", "Nenhum ponto sinalizado pela conferência automática."));
      return block;
    }
    block.append(createTextElement("h4", "lesson-findings-title", `${heading} (${findings.length})`));
    const list = document.createElement("ul");
    list.className = "lesson-findings-list";
    for (const f of findings) {
      const li = document.createElement("li");
      li.append(createTextElement("p", "lesson-finding-issue", issueLabel(f.issue)));
      if (f.generatedClaim) li.append(createTextElement("p", "lesson-finding-claim", `No rascunho: ${f.generatedClaim}`));
      if (f.sourceEvidence) li.append(createTextElement("p", "lesson-finding-evidence", `Na fonte: ${f.sourceEvidence}`));
      if (f.repair) li.append(createTextElement("p", "lesson-finding-repair", f.repair));
      list.append(li);
    }
    block.append(list);
    return block;
  }

  function renderSource() {
    sourcePanel.replaceChildren();
    const scope = draft.sourceScope;
    const dl = document.createElement("dl");
    dl.className = "lesson-facts";
    const fact = (label, text) => {
      if (text === null || text === undefined || text === "") return;
      dl.append(createTextElement("dt", "lesson-fact-label", label), createTextElement("dd", "lesson-fact-value", text));
    };
    const nf = new Intl.NumberFormat("pt-BR");
    if (scope) {
      fact("Documento", scope.documentName);
      fact("Tema", scope.topic);
      const [a, b] = scope.approvedPages ?? [];
      fact("Páginas aprovadas", a === undefined ? null : (a === b ? `PDF página ${a}` : `PDF páginas ${a}–${b}`));
      fact("Texto da fonte aprovada", Number.isFinite(scope.sourceChars) ? `${nf.format(scope.sourceChars)} caracteres` : null);
      fact("Enviado ao modelo", Number.isFinite(scope.payloadChars) ? `${nf.format(scope.payloadChars)} caracteres${scope.payloadChars === scope.sourceChars ? " — exatamente a fonte aprovada" : ""}` : null);
    } else {
      sourcePanel.append(createTextElement("p", "lesson-hint", "Este rascunho foi gerado antes de o escopo da fonte ser registrado."));
    }
    sourcePanel.append(dl);
    const pages = (draft.pages ?? []).filter((p) => p.text);
    if (pages.length > 0) {
      sourcePanel.append(createTextElement("h3", "lesson-subheading", "Páginas citadas neste rascunho"));
      sourcePanel.append(createSourceDetails(`Trechos de ${pages.length} ${pages.length === 1 ? "página" : "páginas"} (até 1.500 caracteres cada)`, pages));
    }
    if (draft.sourceStale) sourcePanel.append(createTextElement("p", "form-message is-error", "O texto da fonte mudou depois que este rascunho foi gerado."));
  }

  function renderReview() {
    reviewPanel.replaceChildren();
    const overview = reviewOverview(draft);
    const groups = groupFindings(draft);
    reviewPanel.append(createTextElement("p", "lesson-hint", "A conferência automática é um filtro que mostra onde olhar. Ausência de pontos não é validação médica: confira a fonte."));
    if (draft.audit?.repaired) reviewPanel.append(createTextElement("p", "lesson-hint", "O rascunho foi corrigido automaticamente uma vez antes de chegar aqui."));
    const skipped = (draft.audit?.findings ?? []).find((f) => f.issue === "LEXICAL_CHECK_SKIPPED_CROSS_LANGUAGE");
    if (skipped) {
      reviewPanel.append(createTextElement("p", "lesson-hint lesson-cross-language", `${skipped.generatedClaim} ${skipped.sourceEvidence} ${skipped.repair}`));
    }
    if (overview.total === 0) {
      reviewPanel.append(createTextElement("p", "lesson-review-clear", "Nada sinalizado."));
      return;
    }
    reviewPanel.append(createTextElement("p", "lesson-review-total", `${overview.total} ${overview.total === 1 ? "ponto" : "pontos"} em ${overview.flagged + (overview.summaryFindings > 0 ? 1 : 0)} ${overview.flagged + (overview.summaryFindings > 0 ? 1 : 0) === 1 ? "item" : "itens"}`));
    const list = document.createElement("ul");
    list.className = "lesson-review-list";
    const addRow = (labelText, findings, open) => {
      const li = document.createElement("li");
      const details = document.createElement("details");
      details.className = "lesson-review-item";
      const sum = document.createElement("summary");
      sum.append(createTextElement("span", "lesson-review-name", labelText), document.createTextNode(" "), createTextElement("span", "lesson-qchip-count", `⚠ ${findings.length}`));
      details.append(sum, renderFindingList(findings, `Pontos de ${labelText.toLowerCase()}`));
      const goto = button("text-button", `Abrir ${labelText.toLowerCase()}`, "goto-entity");
      goto.dataset.target = open;
      details.append(goto);
      li.append(details);
      list.append(li);
    };
    if (groups.summary.length > 0) addRow("Resumo", groups.summary, "summary");
    draft.questions.forEach((q, index) => {
      const findings = groups.byQuestion.get(q.id);
      if (findings && q.status !== "REJECTED") addRow(`Questão ${index + 1}`, findings, q.id);
    });
    reviewPanel.append(list);
    if (groups.other.length > 0) reviewPanel.append(renderFindingList(groups.other, "Outros pontos"));
  }

  function renderAccept() {
    const kept = keptQuestionCount(draft);
    const rejected = draft.questions.length - kept;
    acceptNote.textContent = `${kept} ${kept === 1 ? "questão vira exercício" : "questões viram exercícios"}${rejected > 0 ? `; ${rejected} rejeitada${rejected === 1 ? "" : "s"} não entra${rejected === 1 ? "" : "m"}` : ""}. Revisões são agendadas ao aceitar.`;
    acceptBtn.disabled = accepted || kept === 0;
  }

  function renderAll() {
    renderHeader();
    renderTabs();
    renderSummary();
    renderQuestionList();
    renderQuestionEditor();
    renderSource();
    renderReview();
    renderAccept();
  }

  function applyDraft(next, { keepSelection } = {}) {
    draft = next;
    if (summaryBuffer !== null && summaryBuffer === draft.summary) summaryBuffer = null;
    if (!questionById(selectedId) || keepSelection) selectedId = questionById(keepSelection) ? keepSelection : (draft.questions[0]?.id ?? null);
    summaryField.input.value = summaryBuffer !== null ? summaryBuffer : draft.summary;
    root.dataset.revision = String(draft.revision);
    renderAll();
  }

  // ================================================================================================================
  // behaviour
  // ================================================================================================================
  function showTab(key, { focus = false } = {}) {
    activeTab = key;
    renderTabs();
    if (focus) tabButtons.get(key).b.focus();
  }
  tablist.addEventListener("click", (event) => {
    const b = event.target.closest("[data-tab]");
    if (b) showTab(b.dataset.tab);
  });
  tablist.addEventListener("keydown", (event) => {
    const keys = TABS.map((t) => t.key);
    const at = keys.indexOf(activeTab);
    let to = null;
    if (event.key === "ArrowRight") to = keys[(at + 1) % keys.length];
    else if (event.key === "ArrowLeft") to = keys[(at - 1 + keys.length) % keys.length];
    else if (event.key === "Home") to = keys[0];
    else if (event.key === "End") to = keys[keys.length - 1];
    if (to) { event.preventDefault(); showTab(to, { focus: true }); }
  });

  qList.addEventListener("click", (event) => {
    const b = event.target.closest("[data-qid]");
    if (!b) return;
    selectedId = b.dataset.qid;
    renderQuestionList();
    renderQuestionEditor();
    qEditor.querySelector("textarea")?.focus({ preventScroll: true });
  });

  reviewPanel.addEventListener("click", (event) => {
    const goto = event.target.closest('[data-action="goto-entity"]');
    if (!goto) return;
    if (goto.dataset.target === "summary") {
      showTab("summary", { focus: false });
      summaryField.input.focus();
    } else {
      selectedId = goto.dataset.target;
      showTab("questions");
      renderQuestionList();
      renderQuestionEditor();
      qEditor.querySelector("textarea")?.focus();
    }
  });

  summaryToggle.addEventListener("click", () => {
    const reading = summaryRead.hidden;
    if (reading) {
      summaryRead.replaceChildren();
      for (const block of summaryBlocks(summaryBuffer !== null ? summaryBuffer : draft.summary)) {
        summaryRead.append(block.type === "heading"
          ? createTextElement(block.level === 1 ? "h3" : "h4", "lesson-summary-heading", block.text)
          : createTextElement("p", "lesson-summary-paragraph", block.text));
      }
    }
    summaryRead.hidden = !reading;
    summaryField.wrap.hidden = reading;
    summaryToggle.textContent = reading ? "Voltar a editar" : "Ler como aula";
    summaryToggle.setAttribute("aria-pressed", String(reading));
  });

  summaryField.input.addEventListener("input", () => {
    summaryBuffer = summaryField.input.value;
    renderSummary();
  });
  summarySave.addEventListener("click", async () => {
    if (summaryBuffer === null) return;
    summarySave.disabled = true;
    setMessage(summaryMessage, "Salvando…");
    const result = await deps.reviseSummary(draft.id, { summary: summaryBuffer.trim(), expectedVersion: draft.summaryVersion });
    if (!result.ok) {
      setMessage(summaryMessage, result.message || "Não foi possível salvar o resumo.", true);
      summarySave.disabled = false;
      return;
    }
    summaryBuffer = null;
    applyDraft(result.draft);
    setMessage(summaryMessage, "Resumo salvo. As questões não foram alteradas.");
  });

  back.addEventListener("click", () => {
    const unsaved = summaryBuffer !== null || questionBuffers.size > 0;
    if (unsaved && !window.confirm("Há alterações não salvas nesta aula. Sair mesmo assim?")) return;
    deps.onBack();
  });

  acceptBtn.addEventListener("click", async () => {
    if (summaryBuffer !== null || questionBuffers.size > 0) {
      setMessage(acceptMessage, "Salve as alterações pendentes (resumo ou questões) antes de aceitar a aula.", true);
      return;
    }
    const pickedSubjectId = subjectSelect.value ? Number(subjectSelect.value) : null;
    acceptBtn.disabled = true;
    const result = await deps.acceptDraft(draft.id, {
      subjectId: pickedSubjectId ?? undefined,
      newSubjectName: pickedSubjectId ? undefined : nameField.input.value,
      studyDate: dateField.input.value,
      expectedRevision: draft.revision,
    });
    if (!result.ok) {
      setMessage(acceptMessage, result.message || "Não foi possível aceitar o rascunho.", true);
      acceptBtn.disabled = false;
      acceptBtn.focus({ preventScroll: true });
      return;
    }
    accepted = true;
    acceptBtn.textContent = "Aceito";
    setMessage(acceptMessage, `Aula criada: ${result.acceptance.exerciseCount} exercício(s), ${result.acceptance.reviewCount} revisões agendadas.`);
    const study = button("primary-button", "Estudar agora", "study-now");
    study.addEventListener("click", () => deps.startStudyNow(result.acceptance.unit, result.acceptance.subject?.name));
    afterAccept.replaceChildren(study);
    study.focus();
    await deps.refreshAfterAccept();
  });

  // Another window or device may have edited this lesson: when the user comes back, pick up the newer revision — unless
  // they have unsaved typing here, which is never overwritten.
  async function refreshIfNewer() {
    if (accepted || summaryBuffer !== null || questionBuffers.size > 0 || !deps.getDraft) return;
    const result = await deps.getDraft(draft.id);
    if (result.ok && result.draft.revision > draft.revision) applyDraft(result.draft);
  }
  const onVisible = () => { if (document.visibilityState === "visible") refreshIfNewer(); };
  window.addEventListener("focus", refreshIfNewer);
  document.addEventListener("visibilitychange", onVisible);

  renderAll();
  enhanceSelect(subjectSelect);

  return {
    element: root,
    focusTitle: () => heading.focus(),
    getDraft: () => draft,
    destroy: () => {
      window.removeEventListener("focus", refreshIfNewer);
      document.removeEventListener("visibilitychange", onVisible);
    },
  };
}
