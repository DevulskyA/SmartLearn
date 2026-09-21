// T36: source upload -> extraction -> inspectable, editable proposals.
// Self-contained and DOM-free, mirroring migration-ui.js's separation of
// concerns — src/app.js owns all button/file wiring, this module only
// knows how to talk to /v1/sources* and /v1/proposals*. No unit, exercise,
// or any other real learning-domain row is ever created by this module —
// that stays a separate, explicit acceptance step (T38), not built yet.
import { apiRequest, apiUpload, ApiError, NetworkError } from './api-client.js';

function fail(err) {
  if (err instanceof ApiError) {
    return { ok: false, code: err.code, message: err.message, field: err.field };
  }
  if (err instanceof NetworkError) {
    return { ok: false, code: 'NETWORK_ERROR', message: 'Não foi possível contatar o servidor. Verifique sua conexão e tente novamente.' };
  }
  throw err;
}

/** Step 1: upload the PDF (T34). Server-side validation (real content,
 * size, quota) happens entirely on the server; this function does not
 * duplicate any of those checks client-side. */
export async function uploadSource(file) {
  try {
    const formData = new FormData();
    formData.append('file', file, file.name);
    const { source } = await apiUpload('/v1/sources', formData);
    return { ok: true, source };
  } catch (err) { return fail(err); }
}

/** Step 2: extract text with page provenance (T35). Awaits the full
 * bounded worker run server-side — the caller sees one of EXTRACTED,
 * ENCRYPTED, TIMEOUT, IMAGE_ONLY_OR_UNREADABLE or EXTRACTION_FAILED, never
 * a silent empty document. */
export async function extractSource(sourceId) {
  try {
    const { extraction } = await apiRequest(`/v1/sources/${sourceId}/extract`, { method: 'POST' });
    return { ok: true, extraction };
  } catch (err) { return fail(err); }
}

/** Step 3: chunk the extracted pages into inspectable proposals (T36).
 * Re-running this replaces the source's prior proposal set wholesale. */
export async function chunkSource(sourceId) {
  try {
    const { proposals } = await apiRequest(`/v1/sources/${sourceId}/proposals`, { method: 'POST', body: {} });
    return { ok: true, proposals };
  } catch (err) { return fail(err); }
}

/** True when the server refused to re-chunk because this source's trechos already carry a rascunho or accepted content. */
export function isAlreadyProcessed(code) {
  return code === "HAS_EXISTING_DRAFT" || code === "HAS_ACCEPTED_CONTENT";
}

/** The same PDF sent again lands on its existing trechos; this is what the student is told. */
export function alreadyProcessedMessage(count, extraction) {
  const shown = `${count} ${count === 1 ? "trecho existente" : "trechos existentes"}`;
  const skipped = skippedPagesNote(extraction);
  return `Este PDF já foi processado: ${shown}, com o que você já fez neles.${skipped ? ` ${skipped}` : ""}`;
}

export async function listProposals(sourceId) {
  try {
    const { proposals } = await apiRequest(`/v1/sources/${sourceId}/proposals`);
    return { ok: true, proposals };
  } catch (err) { return fail(err); }
}

/** Full, untruncated excerpt for real inspection before any future
 * acceptance step exists (AC-19/AC-21: the user must be able to see
 * exactly what a proposal is attributable to). */
export async function getProposal(proposalId) {
  try {
    const { proposal } = await apiRequest(`/v1/proposals/${proposalId}`);
    return { ok: true, proposal };
  } catch (err) { return fail(err); }
}

/** Manual correction before acceptance — only the title, never the page
 * range (that is a structural fact about the source). */
export async function renameProposal(proposalId, title) {
  try {
    const { proposal } = await apiRequest(`/v1/proposals/${proposalId}`, { method: 'PATCH', body: { title } });
    return { ok: true, proposal };
  } catch (err) { return fail(err); }
}

const PAGES_SHOWN = 8;

/** "p. 2, 5" — long lists are shortened, the count in front stays exact. */
function pageList(pages) {
  const shown = pages.slice(0, PAGES_SHOWN).join(", ");
  return pages.length > PAGES_SHOWN ? `p. ${shown} e mais ${pages.length - PAGES_SHOWN}` : `p. ${shown}`;
}

/**
 * SCANNED-1: what the extraction left out. Pages with no extractable text (scans, figures) never become a
 * proposal, so without this the student cannot tell what the summary does not cover. "" when nothing was skipped.
 */
export function skippedPagesNote(extraction) {
  const empty = extraction?.emptyPages ?? [];
  const failed = extraction?.failedPages ?? [];
  const parts = [];
  if (empty.length > 0) {
    parts.push(`${empty.length} ${empty.length === 1 ? "página sem texto extraível" : "páginas sem texto extraível"} (${pageList(empty)}) ${empty.length === 1 ? "ficou" : "ficaram"} de fora dos trechos — provavelmente imagem ou digitalização. O resumo não cobre ${empty.length === 1 ? "essa página" : "essas páginas"}.`);
  }
  if (failed.length > 0) {
    parts.push(`${failed.length} ${failed.length === 1 ? "página não pôde ser lida" : "páginas não puderam ser lidas"} (${pageList(failed)}).`);
  }
  return parts.join(" ");
}

/** The message for an extraction that produced no usable text; the image-only case says what to do next. */
export function unreadableSourceMessage(status) {
  const reasons = {
    ENCRYPTED: "Este PDF está criptografado e não pode ser lido.",
    TIMEOUT: "A extração excedeu o tempo limite.",
    IMAGE_ONLY_OR_UNREADABLE: "Este PDF parece ser apenas imagem (sem texto extraível). Envie uma versão com texto selecionável (por exemplo, exportada do arquivo original) ou use Plano para criar a aula à mão.",
    EXTRACTION_FAILED: "Não foi possível extrair o texto deste PDF.",
  };
  return reasons[status] || "Não foi possível extrair o texto deste PDF.";
}
