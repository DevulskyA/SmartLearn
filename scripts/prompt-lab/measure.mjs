// Measures ONE stored draft against the source pages of its unit. Read-only on the database (opened readonly), no model call.
//   node scripts/prompt-lab/measure.mjs --db <file.db> [--draft <id>] [--terms PAH,hematócrito] [--json <out.json>] [--audit]
import { writeFileSync } from 'node:fs';
import Database from '../../server/node_modules/better-sqlite3/lib/index.js';
import { auditDraft } from '../../server/src/ai/draft-audit.js';
import { measureDraft, summarizeMeasures } from './metrics.mjs';

const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const flag = (name) => process.argv.includes(`--${name}`);

export function loadDraftWithSource(db, draftId) {
  const row = draftId
    ? db.prepare('SELECT * FROM generated_drafts WHERE id = ?').get(Number(draftId))
    : db.prepare('SELECT * FROM generated_drafts ORDER BY id DESC LIMIT 1').get();
  if (!row) throw new Error('no draft found');
  const proposal = db.prepare('SELECT * FROM content_proposals WHERE id = ?').get(row.proposal_id);
  const pages = db.prepare('SELECT page_index AS pageIndex, text FROM source_pages WHERE user_id = ? AND source_id = ? AND page_index BETWEEN ? AND ? ORDER BY page_index')
    .all(row.user_id, proposal.source_id, proposal.page_start, proposal.page_end);
  return { row, proposal, pages, draft: JSON.parse(row.draft_json) };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const dbPath = arg('db');
  if (!dbPath) { console.error('missing --db'); process.exit(2); }
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  const { row, proposal, pages, draft } = loadDraftWithSource(db, arg('draft'));
  const terms = (arg('terms') ?? '').split(',').map((t) => t.trim()).filter(Boolean);
  const sourceText = pages.map((p) => p.text).join('\n');
  const measures = measureDraft(draft, { sourceText, pages: pages.map((p) => p.pageIndex), outOfScopeTerms: terms });
  const result = { draftId: row.id, provider: row.provider, promptVersion: row.prompt_version, unit: proposal.title, pages: [proposal.page_start, proposal.page_end], summary: summarizeMeasures(measures), measures };
  if (flag('audit')) {
    const segments = pages.map((p) => ({ pageIndex: p.pageIndex, text: p.text }));
    const fresh = auditDraft({ summary: draft.summary, summarySourceSpans: draft.summarySourceSpans, questions: draft.questions }, { segments });
    const byIssue = {};
    for (const f of fresh.findings) byIssue[f.issue] = (byIssue[f.issue] ?? 0) + 1;
    result.currentDeterministicAudit = { result: fresh.result, findings: fresh.findings.length, byIssue, storedFindings: draft.audit?.findings?.length ?? null };
  }
  console.log(JSON.stringify(result.summary, null, 1));
  if (result.currentDeterministicAudit) console.log('current deterministic audit:', JSON.stringify(result.currentDeterministicAudit));
  if (arg('json')) writeFileSync(arg('json'), JSON.stringify(result, null, 1));
  db.close();
}
