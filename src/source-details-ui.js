// Shared presentation of where content came from: a collapsed "origin" block with the source page text, so
// the student can check a claim. Used by Plano (summary origin), Estudar agora (summary origin, error card),
// the exam correction (cited page) and the draft review (summary/question source).
//
// Moved out of src/app.js unchanged in behaviour. It owns no state and reads no globals: the only thing it
// needs from the outside (the remote learning-units API) is passed in by the caller.

function createTextElement(tagName, className, text) {
  const element = document.createElement(tagName);
  element.className = className;
  element.textContent = text;
  return element;
}

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
      createTextElement("p", "study-now-error-label", `Página ${page.pageIndex}`),
      createTextElement("p", "study-now-source-text", page.text),
    );
  }
  return details;
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
    `Origem do resumo · ${name}, ${pages.length > 1 ? "páginas" : "página"} ${formatPageList(pages)}`,
    sources.map((s) => ({ pageIndex: s.pageIndex, text: s.pageText })),
  ));
}
