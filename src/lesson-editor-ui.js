// LESSON EDITOR. A lesson is not one block of text: it is SUMMARY + QUESTIONS[] + SOURCE + REVIEW, each its own area and each
// saved on its own (PATCH summary / PATCH question by stable id). Editing one question never rewrites the summary or the other
// questions, and the audit findings live in their own tab instead of being poured into the content.
//
// DOM semantics matter here because people copy text out of this screen: content lives only in <textarea>s and content <p>s;
// state words, counts, buttons and findings are separate elements, always separated by real text, never glued to the content.
import { createTextElement } from "./dom-utils.js";
import { renderSummary as renderSummaryBody } from "./summary-render.js";
import { createSummaryAuthoring } from "./summary-toolbar.js";
import { formatNumber } from "./i18n/format.js";
import { t, tn } from "./i18n/index.js";
import { createSourceDetails, formatPageList } from "./source-details-ui.js";
import { enhanceSelect } from "./select-ui.js";
import {
  QUESTION_TYPE_LABELS, issueLabel, groupFindings, questionState, reviewOverview, keptQuestionCount, sourceLine, groundingLine,
} from "./lesson-view-model.js";

// The label is read when used (not once at import), so the active locale applies.
const TABS = [
  { key: "summary", get label() { return t("editor.tab.summary"); } },
  { key: "questions", get label() { return t("editor.tab.questions"); } },
  { key: "source", get label() { return t("editor.tab.source"); } },
  { key: "review", get label() { return t("editor.tab.review"); } },
];

// Counts that can be 0 ("0 pontos"): only 1 is singular, so these pick the form by hand instead of using tn(), whose pt-BR category
// reads 0 as singular. tn() is used below only where the count is provably >= 1.
const pointsText = (n) => (n === 1 ? t("editor.points.one", { count: n }) : t("editor.points.other", { count: n }));
const itemsText = (n) => (n === 1 ? t("editor.items.one", { count: n }) : t("editor.items.other", { count: n }));
const exercisesText = (n) => (n === 1 ? t("editor.exercises.one", { count: n }) : t("editor.exercises.other", { count: n }));
const addedPointsText = (n) => (n === 1 ? t("editor.reaudit.added.one", { count: n }) : t("editor.reaudit.added.other", { count: n }));
const removedPointsText = (n) => (n === 1 ? t("editor.reaudit.removed.one", { count: n }) : t("editor.reaudit.removed.other", { count: n }));

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
 *   deps       { reviseSummary, reviseQuestion, deleteQuestion, acceptDraft, previewAcceptance, getDraft, onBack, startStudyNow, refreshAfterAccept }
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
  const back = button("text-button lesson-back", `← ${t("editor.back")}`, "lesson-back");
  const eyebrow = createTextElement("p", "eyebrow", t("editor.eyebrow"));
  const heading = createTextElement("h2", "lesson-title", title);
  heading.id = `${uid}-title`;
  heading.tabIndex = -1;
  const sourceEl = createTextElement("p", "lesson-source-line", "");
  head.append(back, eyebrow, heading, sourceEl);

  // ---- tabs -----------------------------------------------------------------------------------------------------------
  const tablist = document.createElement("div");
  tablist.className = "lesson-tabs";
  tablist.setAttribute("role", "tablist");
  tablist.setAttribute("aria-label", t("editor.tabs.label"));
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
  const summaryField = labelledField(`${uid}-summary`, t("editor.summary.label"), "textarea", draft.summary, 18);
  summaryField.input.classList.add("lesson-summary-input");
  summaryField.input.dataset.part = "summary";
  const summaryHint = createTextElement("p", "lesson-hint", t("editor.summary.hint"));
  const summaryActions = document.createElement("div");
  summaryActions.className = "lesson-actions";
  const summarySave = button("primary-button", t("editor.summary.save"), "save-summary");
  const summaryDirty = createTextElement("span", "lesson-dirty", "");
  const summaryToggle = button("secondary-button", t("editor.summary.read"), "toggle-summary-read");
  summaryToggle.setAttribute("aria-pressed", "false");
  summaryActions.append(summarySave, document.createTextNode(" "), summaryToggle, document.createTextNode(" "), summaryDirty);
  const summaryMessage = statusMessage();
  // Reading view: the same text laid out as headings and paragraphs (a "## " line is a section title). Display only.
  const summaryRead = document.createElement("div");
  summaryRead.className = "lesson-summary-read";
  summaryRead.hidden = true;
  const summaryAuthoring = createSummaryAuthoring(summaryField.input);
  summaryField.wrap.insertBefore(summaryAuthoring.bar, summaryField.input);
  summaryField.wrap.append(summaryAuthoring.preview);
  summaryPanel.append(summaryField.wrap, summaryRead, summaryHint, summaryActions, summaryMessage);

  // ---- QUESTIONS panel -------------------------------------------------------------------------------------------------
  const questionsPanel = panels.get("questions");
  const qLayout = document.createElement("div");
  qLayout.className = "lesson-questions";
  const qList = document.createElement("ol");
  qList.className = "lesson-qlist";
  qList.setAttribute("aria-label", t("editor.questions.label"));
  const qEditor = document.createElement("div");
  qEditor.className = "lesson-qeditor";
  // The form and the findings are redrawn on every save; the message between them is NOT: a live region that is replaced together with
  // its text is not announced, so this one node lives for as long as the editor does and only its text changes.
  const qForm = document.createElement("div");
  const qMessage = statusMessage();
  const qFindings = document.createElement("div");
  qEditor.append(qForm, qMessage, qFindings);
  let qMessageFor = null; // the question the message is about: another question never shows it
  qLayout.append(qList, qEditor);
  questionsPanel.append(qLayout);

  // ---- SOURCE panel ----------------------------------------------------------------------------------------------------
  const sourcePanel = panels.get("source");
  // ---- REVIEW panel ----------------------------------------------------------------------------------------------------
  const reviewPanel = panels.get("review");
  // one live region for the whole life of the editor (the panel is redrawn after a re-audit; this node is re-attached, never recreated)
  const reauditMessage = statusMessage();
  reauditMessage.tabIndex = -1;
  reviewPanel.addEventListener("click", async (event) => {
    const trigger = event.target.closest?.('[data-action="reaudit"]');
    if (!trigger || !deps.reauditDraft) return;
    trigger.disabled = true;
    setMessage(reauditMessage, t("editor.review.reauditing"));
    const result = await deps.reauditDraft(draft.id);
    if (!result.ok) {
      setMessage(reauditMessage, result.message || t("editor.review.reauditFailed"), true);
      trigger.disabled = false;
      trigger.focus({ preventScroll: true });
      return;
    }
    applyDraft(result.draft, { keepSelection: selectedId });
    const { added, removed, after } = result.reaudit;
    const changed = added + removed;
    setMessage(reauditMessage, changed === 0
      ? t("editor.reaudit.unchanged", { points: pointsText(after) })
      : t("editor.reaudit.changed", { added: addedPointsText(added), removed: removedPointsText(removed), points: pointsText(after) }));
    reauditMessage.focus({ preventScroll: true });
  });

  // ---- ACCEPT footer ---------------------------------------------------------------------------------------------------
  const footer = document.createElement("section");
  footer.className = "lesson-accept";
  footer.setAttribute("aria-label", t("editor.accept.label"));
  const acceptNote = createTextElement("p", "lesson-accept-note", "");
  const subjectField = document.createElement("div");
  subjectField.className = "lesson-field";
  const subjectLabel = createTextElement("label", "lesson-field-label", t("editor.accept.subject"));
  subjectLabel.htmlFor = `${uid}-subject`;
  const subjectSelect = document.createElement("select");
  subjectSelect.id = `${uid}-subject`;
  subjectSelect.className = "source-draft-subject-select";
  // The editor is not in the document yet when the custom select is mounted, so it cannot find its <label for>: name it directly.
  subjectSelect.setAttribute("aria-label", t("editor.accept.subject"));
  const newOption = document.createElement("option");
  newOption.value = "";
  newOption.textContent = t("editor.accept.newSubject");
  subjectSelect.append(newOption);
  for (const subject of subjects) {
    const opt = document.createElement("option");
    opt.value = String(subject.id);
    opt.textContent = subject.name;
    subjectSelect.append(opt);
  }
  subjectField.append(subjectLabel, subjectSelect);
  const nameField = labelledField(`${uid}-subject-name`, t("editor.accept.newSubjectName"), "input", "");
  nameField.input.classList.add("source-draft-subject-input");
  const dateField = labelledField(`${uid}-date`, t("editor.accept.date"), "input", today);
  dateField.input.type = "date";
  dateField.input.classList.add("source-draft-date-input");
  // Read-only preview of what accepting creates, shown BEFORE the final button; it writes nothing and is dropped as soon as the lesson changes.
  const previewBtn = button("secondary-button", t("editor.accept.preview"), "preview-accept");
  const previewPanel = document.createElement("div");
  previewPanel.className = "lesson-accept-preview";
  previewPanel.setAttribute("role", "region");
  previewPanel.setAttribute("aria-label", t("editor.accept.previewLabel"));
  previewPanel.tabIndex = -1;
  previewPanel.hidden = true;
  // Critical findings on the SUMMARY have no per-claim state to resolve: the reviewer confirms, explicitly, that they checked them against the source.
  const ackWrap = document.createElement("label");
  ackWrap.className = "lesson-accept-ack";
  ackWrap.hidden = true;
  const ackBox = document.createElement("input");
  ackBox.type = "checkbox";
  ackBox.dataset.action = "ack-summary-findings";
  ackWrap.append(ackBox, document.createTextNode(` ${t("editor.accept.ack")}`));
  const acceptBtn = button("primary-button", t("editor.accept.submit"), "accept-draft");
  const acceptMessage = statusMessage();
  acceptMessage.classList.add("source-draft-result");
  const afterAccept = document.createElement("div");
  afterAccept.className = "lesson-actions";
  footer.append(acceptNote, subjectField, nameField.wrap, dateField.wrap, previewBtn, previewPanel, ackWrap, acceptBtn, acceptMessage, afterAccept);
  subjectSelect.addEventListener("change", () => {
    const picked = subjectSelect.value !== "";
    nameField.input.disabled = picked;
    if (picked) nameField.input.value = "";
  });

  root.append(head, tablist, ...TABS.map((tab) => panels.get(tab.key)), footer);

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

  // Which sentences of the summary point at a real passage of the approved source (confirmed by the server, recomputed on every read).
  function renderGrounding() {
    summaryPanel.querySelector(":scope > .summary-grounding")?.remove();
    const g = draft.summaryGrounding;
    if (!g || g.total === 0) return;
    const box = document.createElement("div");
    box.className = "summary-grounding";
    box.dataset.part = "summary-grounding";
    box.append(createTextElement("p", "summary-grounding-line", groundingLine(g)));
    const unconfirmed = g.sentences.filter((sentence) => sentence.status !== "SOURCE_LINKED");
    if (unconfirmed.length > 0) {
      const details = document.createElement("details");
      details.className = "summary-grounding-list";
      const label = document.createElement("summary");
      label.textContent = t("editor.grounding.unconfirmed", { count: unconfirmed.length });
      const list = document.createElement("ul");
      for (const sentence of unconfirmed) list.append(createTextElement("li", "summary-grounding-item", sentence.text));
      details.append(label, list);
      box.append(details);
    }
    summaryPanel.insertBefore(box, summaryHint);
  }

  function renderSummary() {
    if (document.activeElement !== summaryField.input && summaryBuffer === null) summaryField.input.value = draft.summary;
    // where the summary came from, with the page text one click away (read live from the proposal's own pages)
    summaryPanel.querySelector(":scope > .summary-source")?.remove();
    const spans = draft.summarySourceSpans ?? [];
    if (spans.length > 0) {
      const byIndex = new Map((draft.pages ?? []).map((p) => [p.pageIndex, p]));
      summaryPanel.insertBefore(createSourceDetails(
        tn("editor.summary.source", spans.length, { pages: formatPageList(spans.map((s) => s.pageIndex)) }), // spans.length >= 1 here
        spans.map((sp) => byIndex.get(sp.pageIndex) ?? { pageIndex: sp.pageIndex, text: null }),
      ), summaryHint);
    }
    renderGrounding();
    const dirty = summaryBuffer !== null && summaryBuffer !== draft.summary;
    summarySave.disabled = !dirty;
    summaryDirty.textContent = dirty ? t("editor.dirty") : "";
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
      // One clean name instead of the symbol + word + count read one by one: "Questão 3, sinalizada, 2 pontos". The visible label stays inside it.
      b.setAttribute("aria-label", [t("editor.question.name", { number: index + 1 }), state.label.toLowerCase(), state.count > 0 ? pointsText(state.count) : null, questionBuffers.has(q.id) ? t("editor.question.unsaved") : null].filter(Boolean).join(", "));
      b.append(createTextElement("span", "lesson-qitem-name", t("editor.question.name", { number: index + 1 })), document.createTextNode(" "));
      const chip = createTextElement("span", "lesson-qchip", "");
      chip.append(createTextElement("span", "lesson-qchip-symbol", state.symbol), document.createTextNode(" "), createTextElement("span", "lesson-qchip-word", state.label));
      if (state.count > 0) chip.append(document.createTextNode(" "), createTextElement("span", "lesson-qchip-count", pointsText(state.count)));
      if (questionBuffers.has(q.id)) chip.append(document.createTextNode(" "), createTextElement("span", "lesson-qchip-dirty", t("editor.question.unsaved")));
      b.append(chip);
      li.append(b);
      qList.append(li);
    });
  }

  function renderQuestionEditor() {
    qForm.replaceChildren();
    qFindings.replaceChildren();
    const q = questionById(selectedId);
    if (q?.id !== qMessageFor) { setMessage(qMessage, ""); qMessageFor = q?.id ?? null; }
    if (!q) {
      qForm.append(createTextElement("p", "lesson-hint", t("editor.questions.none")));
      return;
    }
    const buffer = questionBuffers.get(q.id) ?? {};
    const value = (key) => (buffer[key] !== undefined ? buffer[key] : (q[key] ?? ""));
    const index = draft.questions.indexOf(q);
    const idBase = `${uid}-q-${q.id}`;

    // Only shown when the list is stacked above the editor (narrow windows, see styles.css): it takes the student back to the list
    // at the question they were editing, instead of scrolling up through the whole editor.
    const toList = button("text-button lesson-qback", t("editor.questions.backToList"), "back-to-question-list");
    toList.addEventListener("click", () => {
      const item = qList.querySelector(`[data-qid="${CSS.escape(q.id)}"]`);
      item?.scrollIntoView({ block: "nearest" });
      item?.focus();
    });

    const titleRow = document.createElement("div");
    titleRow.className = "lesson-qtitle";
    const qHeading = createTextElement("h3", "lesson-qheading", t("editor.question.name", { number: index + 1 }));
    qHeading.tabIndex = -1; // where the focus lands when the button that was pressed has nothing left to do (saved, accepted, deleted)
    titleRow.append(qHeading);
    if (q.questionType && QUESTION_TYPE_LABELS[q.questionType]) {
      titleRow.append(document.createTextNode(" "), createTextElement("span", "study-now-chip lesson-qtype", QUESTION_TYPE_LABELS[q.questionType]));
    }

    const fPrompt = labelledField(`${idBase}-prompt`, t("editor.question.prompt"), "textarea", value("question"), 3);
    const fAnswer = labelledField(`${idBase}-answer`, t("editor.question.answer"), "textarea", value("answer"), 3);
    const fExplanation = labelledField(`${idBase}-explanation`, t("editor.question.explanation"), "textarea", value("explanation"), 4);
    const fHint = labelledField(`${idBase}-hint`, t("editor.question.hint"), "input", value("hint"));
    const inputs = { question: fPrompt.input, answer: fAnswer.input, explanation: fExplanation.input, hint: fHint.input };
    for (const input of Object.values(inputs)) input.dataset.part = q.id;
    for (const [key, input] of Object.entries(inputs)) {
      input.addEventListener("input", () => {
        const current = questionBuffers.get(q.id) ?? {};
        current[key] = input.value;
        questionBuffers.set(q.id, current);
        save.disabled = false;
        dirtyEl.textContent = t("editor.dirty");
        renderQuestionList();
      });
    }

    const sourceBlock = document.createElement("div");
    sourceBlock.className = "lesson-qsource";
    const spans = q.sourceSpans ?? [];
    if (spans.length > 0) {
      const byIndex = new Map((draft.pages ?? []).map((p) => [p.pageIndex, p]));
      sourceBlock.append(createSourceDetails(
        tn("editor.question.source", spans.length, { pages: formatPageList(spans.map((s) => s.pageIndex)) }), // spans.length >= 1 here
        spans.map((s) => byIndex.get(s.pageIndex) ?? { pageIndex: s.pageIndex, text: null }),
      ));
    }

    const actions = document.createElement("div");
    actions.className = "lesson-actions";
    const save = button("primary-button", t("editor.question.save"), "save-question");
    save.disabled = !questionBuffers.has(q.id);
    const acceptQ = button("secondary-button", q.status === "ACCEPTED" ? `${t("editor.question.accepted")} ✓` : t("editor.question.accept"), "accept-question");
    acceptQ.disabled = q.status === "ACCEPTED";
    const rejectQ = button("secondary-button", q.status === "REJECTED" ? t("editor.question.restore") : t("editor.question.reject"), "toggle-reject-question");
    const del = button("text-button lesson-danger", t("editor.question.delete"), "delete-question");
    const dirtyEl = createTextElement("span", "lesson-dirty", questionBuffers.has(q.id) ? t("editor.dirty") : "");
    actions.append(save, acceptQ, rejectQ, del, document.createTextNode(" "), dirtyEl);
    const message = qMessage;

    const findings = findingsOfQuestion(q.id);
    const findingsBlock = renderFindingList(findings, t("editor.findings.ofQuestion"));

    // `pressed` is the data-action of the button the student used. While the request runs the buttons are disabled (the focus leaves them),
    // so afterwards the focus is put back: on the same button when it still has something to do, otherwise on the question itself.
    const run = async (fn, okText, pressed, { toQuestion = false } = {}) => {
      for (const b of actions.querySelectorAll("button")) b.disabled = true;
      setMessage(message, t("editor.saving"));
      const result = await fn();
      if (!result.ok) {
        setMessage(message, result.message || t("editor.question.saveFailed"), true);
        for (const b of actions.querySelectorAll("button")) b.disabled = false;
        acceptQ.disabled = q.status === "ACCEPTED";
        save.disabled = !questionBuffers.has(q.id);
        actions.querySelector(`[data-action="${pressed}"]:not(:disabled)`)?.focus({ preventScroll: true });
        return;
      }
      questionBuffers.delete(q.id);
      applyDraft(result.draft, { keepSelection: result.keepId ?? q.id });
      qMessageFor = selectedId; // a message about the question that stays (or the next one after a delete) is shown, not cleared
      setMessage(qMessage, okText);
      const same = toQuestion ? null : qForm.querySelector(`[data-action="${pressed}"]:not(:disabled)`);
      (same ?? qForm.querySelector(".lesson-qheading"))?.focus({ preventScroll: true });
    };
    const editedFields = () => ({
      question: inputs.question.value.trim(),
      answer: inputs.answer.value.trim(),
      explanation: inputs.explanation.value.trim() || null,
      hint: inputs.hint.value.trim() || null,
    });
    save.addEventListener("click", () => run(() => deps.reviseQuestion(draft.id, q.id, { ...editedFields(), expectedVersion: q.version }), t("editor.question.msg.saved"), "save-question"));
    acceptQ.addEventListener("click", () => run(() => deps.reviseQuestion(draft.id, q.id, { ...editedFields(), status: "ACCEPTED", expectedVersion: q.version }), t("editor.question.msg.accepted"), "accept-question"));
    rejectQ.addEventListener("click", () => run(() => deps.reviseQuestion(draft.id, q.id, { ...editedFields(), status: q.status === "REJECTED" ? "PROPOSED" : "REJECTED", expectedVersion: q.version }), q.status === "REJECTED" ? t("editor.question.msg.restored") : t("editor.question.msg.rejected"), "toggle-reject-question"));
    del.addEventListener("click", () => {
      if (!window.confirm(t("editor.question.confirmDelete", { number: index + 1 }))) return;
      const next = draft.questions[index + 1]?.id ?? draft.questions[index - 1]?.id ?? null;
      run(async () => ({ ...(await deps.deleteQuestion(draft.id, q.id)), keepId: next }), t("editor.question.msg.deleted"), "delete-question", { toQuestion: true });
    });

    qForm.append(toList, titleRow, fPrompt.wrap, fAnswer.wrap, fExplanation.wrap, fHint.wrap, sourceBlock, actions);
    qFindings.append(findingsBlock);
  }

  function renderFindingList(findings, heading) {
    const block = document.createElement("section");
    block.className = "lesson-findings";
    block.setAttribute("aria-label", heading);
    if (findings.length === 0) {
      block.append(createTextElement("p", "lesson-hint", t("editor.findings.none")));
      return block;
    }
    block.append(createTextElement("h4", "lesson-findings-title", t("editor.findings.title", { heading, count: findings.length })));
    const list = document.createElement("ul");
    list.className = "lesson-findings-list";
    for (const f of findings) {
      const li = document.createElement("li");
      li.append(createTextElement("p", "lesson-finding-issue", issueLabel(f.issue)));
      if (f.generatedClaim) li.append(createTextElement("p", "lesson-finding-claim", t("editor.finding.claim", { text: f.generatedClaim })));
      if (f.sourceEvidence) li.append(createTextElement("p", "lesson-finding-evidence", t("editor.finding.evidence", { text: f.sourceEvidence })));
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
    const nf = { format: (value) => formatNumber(value) };
    if (scope) {
      fact(t("editor.source.document"), scope.documentName);
      fact(t("editor.source.topic"), scope.topic);
      const [a, b] = scope.approvedPages ?? [];
      fact(t("editor.source.approvedPages"), a === undefined ? null : (a === b ? t("lesson.source.page", { page: a }) : t("lesson.source.pages", { from: a, to: b })));
      fact(t("editor.source.approvedText"), Number.isFinite(scope.sourceChars) ? t("lesson.source.chars", { count: nf.format(scope.sourceChars) }) : null);
      fact(t("editor.source.sentToModel"), Number.isFinite(scope.payloadChars)
        ? (scope.payloadChars === scope.sourceChars ? t("editor.source.sentExact", { count: nf.format(scope.payloadChars) }) : t("lesson.source.chars", { count: nf.format(scope.payloadChars) }))
        : null);
    } else {
      sourcePanel.append(createTextElement("p", "lesson-hint", t("editor.source.noScope")));
      const unit = draft.sourceUnit;
      if (unit) {
        fact(t("editor.source.document"), unit.documentName);
        fact(t("editor.source.unit"), unit.title);
        fact(t("editor.source.unitPages"), unit.pageStart === unit.pageEnd ? t("lesson.source.page", { page: unit.pageStart }) : t("lesson.source.pages", { from: unit.pageStart, to: unit.pageEnd }));
      }
    }
    sourcePanel.append(dl);
    const pages = (draft.pages ?? []).filter((p) => p.text);
    if (pages.length > 0) {
      sourcePanel.append(createTextElement("h3", "lesson-subheading", t("editor.source.citedPages")));
      sourcePanel.append(createSourceDetails(tn("editor.source.excerpts", pages.length), pages)); // pages.length >= 1 here
    }
    if (draft.sourceStale) sourcePanel.append(createTextElement("p", "form-message is-error", t("editor.source.stale")));
  }

  function renderReview() {
    reviewPanel.replaceChildren();
    const overview = reviewOverview(draft);
    const groups = groupFindings(draft);
    // T-F2-03: opening never recalculates; an audit written by older rules is only SAID to be old, and re-running it is an explicit action.
    if (draft.auditStale && !accepted && deps.reauditDraft) {
      const stale = document.createElement("div");
      stale.className = "lesson-audit-stale";
      stale.append(createTextElement("p", "lesson-hint", t("editor.review.stale")));
      stale.append(button("secondary-button lesson-reaudit", t("editor.review.reaudit"), "reaudit"));
      reviewPanel.append(stale);
    }
    reviewPanel.append(reauditMessage);
    reviewPanel.append(createTextElement("p", "lesson-hint", t("editor.review.filter")));
    if (draft.audit?.repaired) reviewPanel.append(createTextElement("p", "lesson-hint", t("editor.review.repaired")));
    const skipped = (draft.audit?.findings ?? []).find((f) => f.issue === "LEXICAL_CHECK_SKIPPED_CROSS_LANGUAGE");
    if (skipped) {
      reviewPanel.append(createTextElement("p", "lesson-hint lesson-cross-language", `${skipped.generatedClaim} ${skipped.sourceEvidence} ${skipped.repair}`));
    }
    if (overview.total === 0) {
      reviewPanel.append(createTextElement("p", "lesson-review-clear", t("editor.review.clear")));
      return;
    }
    reviewPanel.append(createTextElement("p", "lesson-review-total", t("editor.review.total", { points: pointsText(overview.total), items: itemsText(overview.flagged + (overview.summaryFindings > 0 ? 1 : 0)) })));
    const list = document.createElement("ul");
    list.className = "lesson-review-list";
    const addRow = (labelText, findings, open) => {
      const li = document.createElement("li");
      const details = document.createElement("details");
      details.className = "lesson-review-item";
      const sum = document.createElement("summary");
      sum.append(createTextElement("span", "lesson-review-name", labelText), document.createTextNode(" "), createTextElement("span", "lesson-qchip-count", `⚠ ${findings.length}`));
      details.append(sum, renderFindingList(findings, t("editor.findings.of", { name: labelText.toLowerCase() })));
      const goto = button("text-button", t("editor.review.open", { name: labelText.toLowerCase() }), "goto-entity");
      goto.dataset.target = open;
      details.append(goto);
      li.append(details);
      list.append(li);
    };
    if (groups.summary.length > 0) addRow(t("editor.review.summaryName"), groups.summary, "summary");
    draft.questions.forEach((q, index) => {
      const findings = groups.byQuestion.get(q.id);
      if (findings && q.status !== "REJECTED") addRow(t("editor.question.name", { number: index + 1 }), findings, q.id);
    });
    reviewPanel.append(list);
    if (groups.other.length > 0) reviewPanel.append(renderFindingList(groups.other, t("editor.findings.other")));
  }

  function renderAccept() {
    const kept = keptQuestionCount(draft);
    const rejected = draft.questions.length - kept;
    const keptText = kept === 1 ? t("editor.accept.kept.one", { count: kept }) : t("editor.accept.kept.other", { count: kept });
    acceptNote.textContent = rejected > 0
      ? t("editor.accept.noteRejected", { kept: keptText, rejected: rejected === 1 ? t("editor.accept.rejected.one", { count: rejected }) : t("editor.accept.rejected.other", { count: rejected }) })
      : t("editor.accept.note", { kept: keptText });
    const summaryBlockers = draft.acceptanceBlockers?.summary ?? 0;
    ackWrap.hidden = accepted || summaryBlockers === 0;
    if (ackWrap.hidden) ackBox.checked = false;
    acceptBtn.disabled = accepted || kept === 0;
    previewBtn.disabled = accepted || kept === 0 || !deps.previewAcceptance;
    previewPanel.hidden = true;
    previewPanel.replaceChildren();
  }

  const clip = (text, max = 110) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);
  const pagesLabel = (pages) => {
    if (pages.length === 0) return "";
    return ` ${pages.length === 1 ? t("editor.preview.pages.one", { pages: pages.join(", ") }) : t("editor.preview.pages.other", { pages: pages.join(", ") })}`;
  };

  function renderPreview(preview) {
    const summary = document.createElement("ul");
    summary.className = "lesson-accept-preview-summary";
    for (const line of [
      preview.subject.isNew ? t("editor.preview.subjectNew", { name: preview.subject.name }) : t("editor.preview.subject", { name: preview.subject.name }),
      t("editor.preview.lesson", { title: preview.unit.title, date: preview.unit.studyDate }),
      t("editor.preview.counts", { exercises: exercisesText(preview.exercises.length), reviews: preview.reviews.count }),
    ]) summary.append(createTextElement("li", "", line));
    const exercises = document.createElement("ol");
    exercises.className = "lesson-accept-preview-exercises";
    for (const e of preview.exercises) {
      const tag = e.origin === "HUMAN_ADDED" ? ` ${t("editor.preview.addedByYou")}` : e.origin === "HUMAN_EDITED" ? ` ${t("editor.preview.editedByYou")}` : "";
      exercises.append(createTextElement("li", "", `${clip(e.question)}${tag}${pagesLabel(e.pages)}`));
    }
    const parts = [createTextElement("p", "lesson-accept-preview-title", t("editor.preview.title")), summary, exercises];
    if (preview.excluded.length > 0) {
      parts.push(createTextElement("p", "lesson-accept-preview-excluded", t("editor.preview.excluded", { count: preview.excluded.length })));
      const excluded = document.createElement("ul");
      for (const e of preview.excluded) excluded.append(createTextElement("li", "", clip(e.question)));
      parts.push(excluded);
    }
    previewPanel.replaceChildren(...parts);
    previewPanel.hidden = false;
    previewPanel.focus();
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
    const keys = TABS.map((tab) => tab.key);
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
      renderSummaryBody(summaryRead, summaryBuffer !== null ? summaryBuffer : draft.summary);
    }
    summaryRead.hidden = !reading;
    summaryField.wrap.hidden = reading;
    summaryToggle.textContent = reading ? t("editor.summary.edit") : t("editor.summary.read");
    summaryToggle.setAttribute("aria-pressed", String(reading));
  });

  summaryField.input.addEventListener("input", () => {
    summaryBuffer = summaryField.input.value;
    renderSummary();
  });
  summarySave.addEventListener("click", async () => {
    if (summaryBuffer === null) return;
    summarySave.disabled = true;
    setMessage(summaryMessage, t("editor.saving"));
    const result = await deps.reviseSummary(draft.id, { summary: summaryBuffer.trim(), expectedVersion: draft.summaryVersion });
    if (!result.ok) {
      setMessage(summaryMessage, result.message || t("editor.summary.saveFailed"), true);
      summarySave.disabled = false;
      summarySave.focus({ preventScroll: true }); // a disabled button dropped the focus while the request ran
      return;
    }
    summaryBuffer = null;
    applyDraft(result.draft);
    setMessage(summaryMessage, t("editor.summary.saved"));
    // "Salvar resumo" is disabled now (nothing left to save): the focus goes back to the text the student was working on
    (summaryField.wrap.hidden ? summaryToggle : summaryField.input).focus({ preventScroll: true });
  });

  back.addEventListener("click", () => {
    const unsaved = summaryBuffer !== null || questionBuffers.size > 0;
    if (unsaved && !window.confirm(t("editor.confirmLeave"))) return;
    deps.onBack();
  });

  previewBtn.addEventListener("click", async () => {
    if (summaryBuffer !== null || questionBuffers.size > 0) {
      setMessage(acceptMessage, t("editor.accept.savePendingPreview"), true);
      return;
    }
    const pickedSubjectId = subjectSelect.value ? Number(subjectSelect.value) : null;
    previewBtn.disabled = true;
    const result = await deps.previewAcceptance(draft.id, {
      subjectId: pickedSubjectId ?? undefined,
      newSubjectName: pickedSubjectId ? undefined : nameField.input.value,
      studyDate: dateField.input.value,
      expectedRevision: draft.revision,
      acknowledgeSummaryFindings: ackBox.checked,
    });
    previewBtn.disabled = accepted;
    if (!result.ok) {
      previewPanel.hidden = true;
      setMessage(acceptMessage, result.message || t("editor.accept.previewFailed"), true);
      return;
    }
    setMessage(acceptMessage, "");
    renderPreview(result.preview);
  });

  acceptBtn.addEventListener("click", async () => {
    if (summaryBuffer !== null || questionBuffers.size > 0) {
      setMessage(acceptMessage, t("editor.accept.savePendingAccept"), true);
      return;
    }
    const pickedSubjectId = subjectSelect.value ? Number(subjectSelect.value) : null;
    acceptBtn.disabled = true;
    const result = await deps.acceptDraft(draft.id, {
      subjectId: pickedSubjectId ?? undefined,
      newSubjectName: pickedSubjectId ? undefined : nameField.input.value,
      studyDate: dateField.input.value,
      expectedRevision: draft.revision,
      acknowledgeSummaryFindings: ackBox.checked,
    });
    if (!result.ok) {
      setMessage(acceptMessage, result.message || t("editor.accept.failed"), true);
      acceptBtn.disabled = false;
      acceptBtn.focus({ preventScroll: true });
      return;
    }
    accepted = true;
    acceptBtn.textContent = t("editor.accept.done");
    const reviewCount = result.acceptance.reviewCount;
    setMessage(acceptMessage, t("editor.accept.created", {
      exercises: exercisesText(result.acceptance.exerciseCount),
      reviews: t(reviewCount === 1 ? "editor.accept.reviews.one" : "editor.accept.reviews.other", { count: reviewCount }),
    }));
    const study = button("primary-button", t("editor.accept.studyNow"), "study-now");
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
