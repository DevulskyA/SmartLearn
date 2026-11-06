// QUESTION CORPUS: the normalized item. Raw files (JSONL or JSON) stay exactly as they are; this is the DERIVED shape the index reads.
// Nothing here is required beyond a stem: a corpus grows progressively (metadata is filled in as it becomes known), and an item with
// little metadata is still searchable.
import { createHash } from 'node:crypto';

/**
 * What may be done with an item's TEXT. Only OFFICIAL_PUBLIC and LICENSED are candidates for textual reuse. REFERENCE_ONLY may teach
 * structure and patterns but is never republished automatically. UNKNOWN (the default) fails closed for textual reuse.
 */
export const USAGE_STATUS = Object.freeze(['OFFICIAL_PUBLIC', 'LICENSED', 'REFERENCE_ONLY', 'UNKNOWN']);
export const ORIGINS = Object.freeze(['original', 'generated', 'derived']);
const TEXT_REUSABLE = new Set(['OFFICIAL_PUBLIC', 'LICENSED']);

const str = (v) => (typeof v === 'string' && v.trim().length > 0 ? v.trim() : null);
const int = (v) => (Number.isInteger(v) ? v : (typeof v === 'string' && /^\d{4}$/.test(v.trim()) ? Number(v) : null));

/** Whether the item's text may be handed to a student as it is: an allowed right AND an answer key to grade against. */
export function canReuseText(item) {
  return TEXT_REUSABLE.has(item.usage_status) && item.key !== null;
}

function normalizeOptions(raw) {
  if (!Array.isArray(raw)) return null;
  const out = [];
  for (const [i, o] of raw.entries()) {
    if (typeof o === 'string' && o.trim()) out.push({ label: String.fromCharCode(65 + i), text: o.trim() });
    else if (o && typeof o === 'object' && str(o.text)) out.push({ label: str(o.label) ?? String.fromCharCode(65 + i), text: str(o.text) });
  }
  return out.length > 0 ? out : null;
}

/**
 * @returns {{ ok: true, item: object } | { ok: false, error: string }}
 */
export function normalizeItem(raw, { sourceFile = null } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'not an object' };
  const stem = str(raw.stem);
  if (!stem) return { ok: false, error: 'missing stem' };
  const origin = ORIGINS.includes(raw.origin) ? raw.origin : 'original';
  const usage = USAGE_STATUS.includes(raw.usage_status) ? raw.usage_status : 'UNKNOWN';
  const parentId = str(raw.parent_id);
  const relationship = str(raw.relationship);
  if (origin === 'derived' && (!parentId || !relationship)) return { ok: false, error: 'a derived item needs parent_id and relationship' };
  const file = str(raw.source_file) ?? sourceFile;
  const id = str(raw.id) ?? createHash('sha256').update(`${file ?? ''}\n${stem}`).digest('hex').slice(0, 16);
  return {
    ok: true,
    item: {
      id,
      source: str(raw.source),
      source_file: file,
      usage_status: usage,
      exam: str(raw.exam),
      year: int(raw.year),
      topic: str(raw.topic),
      competency: str(raw.competency),
      subcompetency: str(raw.subcompetency),
      item_type: str(raw.item_type),
      stem,
      options: normalizeOptions(raw.options),
      key: str(raw.key),
      explanation: str(raw.explanation),
      source_evidence: str(raw.source_evidence),
      provenance: str(raw.provenance),
      origin,
      parent_id: parentId,
      relationship,
      target_complexity: str(raw.target_complexity),
      observed_difficulty: Number.isFinite(raw.observed_difficulty) ? raw.observed_difficulty : null,
      status: str(raw.status) ?? 'ACTIVE',
    },
  };
}
