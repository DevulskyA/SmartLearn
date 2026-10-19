// Shared presentation of where content came from: a collapsed "origin" block with the source page text, so
// the student can check a claim. Used by Plano (summary origin), Estudar agora (summary origin, error card),
// the exam correction (cited page) and the draft review (summary/question source).
//
// Moved out of src/app.js unchanged in behaviour. It owns no state and reads no globals: the only thing it
// needs from the outside (the remote learning-units API) is passed in by the caller.
import { createTextElement } from "./dom-utils.js";
import { t, tn } from "./i18n/index.js";

// "3", "1–3", "1, 3–4": a compact page list for provenance labels.
export function formatPageList(pageIndexes) {
  const pages = [...new Set(pageIndexes)].sort((a, b) => a - b);
  const parts = [];
  for (let i = 0; i < pages.length;) {
    let j = i;
    while (j + 1 < pages.length && pages[j + 1] === pages[j] + 1) j += 1;
    parts.push(j > i ? `${pages[i]}–${pages[j]}` : String(pages[i]));
    i = j + 1;
  }
  return parts.join(", ");
}

// A collapsed "origin" block: which source pages a piece of content came from, with the page text
// itself so the student can check the claim. `pages` = [{pageIndex, text}] (text may be missing).
export function createSourceDetails(label, pages) {
  const details = document.createElement("details");
  details.className = "study-now-source summary-source";
  const summary = document.createElement("summary");
  summary.textContent = label;
  details.append(summary);
  for (const page of pages) {
    if (!page.text) continue;
    details.append(
      createTextElement("p", "study-now-error-label", t("sourceDetails.pageLabel", { pageIndex: page.pageIndex })),
      createTextElement("p", "study-now-source-text", page.text),
    );
    if (page.sourceId != null) details.append(originalPdfLink(page));
  }
  return details;
}

// "Abrir o PDF original, página N": the stored file of the source (owner-only route), opened by the PDF viewer at that page.
function originalPdfLink(citation) {
  const base = (typeof window !== "undefined" && window.__SMARTLEARN_API_BASE__) || "";
  const link = document.createElement("a");
  link.className = "study-now-source-open";
  link.href = `${base}/v1/sources/${citation.sourceId}/file#page=${citation.pageIndex}`;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = t("appStudyNow.openOriginal", { page: citation.pageIndex });
  return link;
}

// The exact source page(s) an exercise was drafted from (frozen at acceptance), one collapsed block per page, so the
// student can go back to the material when an answer was wrong. Citations without page text (manual exercises, edited
// versions) produce nothing: no invented explanation. `citations` = [{sourceName, pageIndex, pageText}].
export function citationDetails(citations) {
  const blocks = [];
  for (const citation of citations ?? []) {
    if (!citation.pageText) continue;
    const details = document.createElement("details");
    details.className = "study-now-source";
    const summary = document.createElement("summary");
    summary.textContent = t("appStudyNow.citation", { source: citation.sourceName, page: citation.pageIndex });
    details.append(summary, createTextElement("p", "study-now-source-text", citation.pageText));
    if (citation.sourceId != null) details.append(originalPdfLink(citation));
    blocks.push(details);
  }
  return blocks;
}

// Where an AI-generated unit's Resumo Mestre came from (frozen at acceptance). Manual units, units
// accepted before this existed, and the offline store have nothing to show — and show nothing.
// `learningUnits` is the remote learning-units API, or null/undefined when there is none (offline store):
// then nothing is shown.
export async function appendSummarySources(container, unitId, learningUnits) {
  if (!learningUnits?.summarySources || !container) return;
  let sources;
  try {
    sources = await learningUnits.summarySources(unitId);
  } catch {
    return;
  }
  container.querySelector(":scope > .summary-source")?.remove();
  if (!sources.length) return;
  const name = sources[0].sourceName;
  const pages = sources.map((s) => s.pageIndex);
  container.append(createSourceDetails(
    tn("sourceDetails.summaryOrigin", pages.length, { name, pages: formatPageList(pages) }),
    sources.map((s) => ({ pageIndex: s.pageIndex, text: s.pageText, sourceId: s.sourceId })),
  ));
}
