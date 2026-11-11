/** Pure UI decisions. No DB writes, model calls, scheduler changes or clocks. */
export const PAGE_SIZE = 20;
export function normalizeSearch(value) {
    return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
}
export function matchesSearch(text, query) {
    const normalized = normalizeSearch(text);
    return normalizeSearch(query).split(/\s+/).filter(Boolean).every(term => normalized.includes(term));
}
export function paginate(items, requestedPage = 1, size = PAGE_SIZE) {
    if (!Array.isArray(items))
        throw new TypeError('items must be an array');
    if (!Number.isInteger(size) || size < 1 || size > 1000)
        throw new RangeError('Invalid page size');
    const count = Math.max(1, Math.ceil(items.length / size));
    const raw = Number(requestedPage);
    const page = Math.max(1, Math.min(count, Number.isFinite(raw) ? Math.trunc(raw) : 1));
    const offset = (page - 1) * size;
    return { items: items.slice(offset, offset + size), page, pageCount: count, total: items.length,
        first: items.length ? offset + 1 : 0, last: Math.min(items.length, offset + size) };
}
export function validatePageRange(start, end, total = Infinity) {
    const a = Number(start), b = Number(end);
    if (String(start).trim() === '' || String(end).trim() === '')
        return { ok: false, code: 'EMPTY', message: 'Informe a p\u00e1gina inicial e a final.' };
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 1 || b < 1)
        return { ok: false, code: 'INTEGER', message: 'Use n\u00fameros inteiros a partir de 1.' };
    if (b < a)
        return { ok: false, code: 'ORDER', message: 'A p\u00e1gina final precisa ser igual ou posterior \u00e0 inicial.' };
    if (b > total)
        return { ok: false, code: 'BOUNDS', message: `Este PDF tem ${total} p\u00e1ginas.` };
    return { ok: true, start: a, end: b, count: b - a + 1 };
}
export function normalizeRanges(ranges, total = Infinity) {
    if (!Array.isArray(ranges) || ranges.length === 0)
        throw new RangeError('At least one range is required');
    const checked = ranges.map(r => {
        const v = validatePageRange(r.start, r.end, total);
        if (!v.ok)
            throw new RangeError(v.message);
        return { start: v.start, end: v.end };
    }).sort((a, b) => a.start - b.start || a.end - b.end);
    const result = [];
    for (const r of checked) {
        const last = result.at(-1);
        if (last && r.start <= last.end + 1)
            last.end = Math.max(last.end, r.end);
        else
            result.push({ ...r });
    }
    return result;
}
/** Only explicit state can select an action. Page overlap is not content equivalence. */
export function materialAction(proposal) {
    if (!proposal || typeof proposal !== 'object')
        return { kind: 'unknown', label: 'Atualizar estado' };
    if (proposal.generatable === false)
        return { kind: 'source', label: 'Consultar fonte' };
    const draft = proposal.latestDraft;
    const job = proposal.latestJob;
    if (draft?.status === 'ACCEPTED')
        return draft.acceptedUnitId != null
            ? { kind: 'summary', label: 'Abrir resumo', unitId: draft.acceptedUnitId }
            : { kind: 'archived', label: 'Aula indispon\u00edvel' };
    if (job && ['QUEUED', 'CALLING_PROVIDER', 'RUNNING', 'PENDING', 'STALLED', 'CANCEL_REQUESTED'].includes(job.state))
        return { kind: 'progress', label: 'Ver andamento', jobId: job.id };
    if (draft?.id != null)
        return { kind: 'draft', label: 'Conferir resumo', draftId: draft.id };
    if (job && ['FAILED', 'CANCELLED'].includes(job.state))
        return { kind: 'retry', label: 'Tentar novamente' };
    if (job?.state === 'SUCCEEDED' && job.draftId != null)
        return { kind: 'draft', label: 'Conferir resumo', draftId: job.draftId };
    return { kind: 'generate', label: 'Preparar resumo' };
}
export function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
        return false;
    const date = new Date(`${value}T12:00:00Z`);
    return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
export function addDays(value, days) {
    if (!validDate(value) || !Number.isInteger(days))
        throw new RangeError('Invalid calendar date');
    const date = new Date(`${value}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}
/** Preview uses the handoff's existing fixed offsets, never an invented adaptive formula. */
export const REVIEW_OFFSETS = Object.freeze([1, 7, 15, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 360, 390]);
export function reviewDates(studyDate) {
    return studyDate == null ? [] : REVIEW_OFFSETS.map(offset => addDays(studyDate, offset));
}
export function chronology(a, b) {
    const aa = a.lessonDate || a.studyDate || a.createdDate || '';
    const bb = b.lessonDate || b.studyDate || b.createdDate || '';
    return bb.localeCompare(aa) || String(a.id).localeCompare(String(b.id), 'pt-BR', { numeric: true });
}
export function aggregateEvidence(rows) {
    let questions = 0, correct = 0;
    const seen = new Set();
    for (const r of rows) {
        if (r.id == null || seen.has(r.id))
            continue;
        if (!Number.isInteger(r.questions) || !Number.isInteger(r.correct) || r.questions < 1 || r.correct < 0 || r.correct > r.questions)
            continue;
        seen.add(r.id);
        questions += r.questions;
        correct += r.correct;
    }
    return { questions, correct, accuracy: questions ? 100 * correct / questions : null };
}
export function evidenceBand(questions, accuracy) {
    if (questions < 10 || accuracy == null)
        return { key: 'insufficient', label: 'Pouca evid\u00eancia' };
    if (accuracy < 50)
        return { key: 'critical', label: 'Refor\u00e7ar' };
    if (accuracy < 65)
        return { key: 'attention', label: 'Aten\u00e7\u00e3o' };
    if (accuracy < 80)
        return { key: 'adequate', label: 'Adequado' };
    return { key: 'strong', label: 'Forte' };
}
export function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Stable, locale-aware sorting for real records. Missing measures always go last. */
export function sortByColumn(rows, key, ascending = true) {
    if (!Array.isArray(rows)) throw new TypeError('rows must be an array');
    const textKeys = new Set(['name', 'title', 'subjectName', 'contentName', 'date', 'studyDate', 'latestStudyDate', 'lastEvidenceDate']);
    const numericKeys = new Set(['accuracy', 'questions', 'correct', 'unitsCount', 'trendScore']);
    if (!textKeys.has(key) && !numericKeys.has(key)) throw new RangeError('Unsupported sort column');
    const col = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });
    return rows.map((row, i) => ({ row, i })).sort((a, b) => {
        const va = a.row[key], vb = b.row[key];
        const missingA = va === null || va === undefined || va === '' || (numericKeys.has(key) && !Number.isFinite(va));
        const missingB = vb === null || vb === undefined || vb === '' || (numericKeys.has(key) && !Number.isFinite(vb));
        if (missingA || missingB) return missingA === missingB ? a.i - b.i : missingA ? 1 : -1;
        const diff = textKeys.has(key) ? col.compare(String(va), String(vb)) : va - vb;
        return (ascending ? diff : -diff) || a.i - b.i;
    }).map(({ row }) => row);
}
