// PROMPT LAB runner: generates drafts for ONE approved scope through the real production pipeline (scope proof, provider,
// deterministic audit, model audit, at most one repair, schema validation) on a LAB COPY of a database, and stores every run
// outside the repository. It never touches the human DEV datastore and never changes the product.
//
//   node scripts/prompt-lab/run-generation.mjs --db <lab copy under SmartLearn-PromptLab> --source Costanzo --section "Glomerular Filtration"
//        [--runs 1] [--out <dir>] [--provider CODEX|FAKE] [--prompt-version 5] [--terms PAH,...] [--timeout-ms 1200000]
//
// Budget: at most 3 runs per invocation (each run is ONE generation plus the model audit and at most one repair). More needs
// --allow-more, on purpose.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { homedir } from 'node:os';
import { openDb } from '../../server/src/db.js';
import { runMigrations } from '../../server/src/migrations.js';
import * as proposals from '../../server/src/services/content-proposals.js';
import * as drafts from '../../server/src/services/generated-drafts.js';
import { measureDraft, summarizeMeasures } from './metrics.mjs';

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const flag = (name) => process.argv.includes(`--${name}`);

/** The lab only ever opens a copy that lives under a SmartLearn-PromptLab directory, never the human datastore or app data. */
export function assertLabDatabase(dbPath, { forbidden = [join(homedir(), 'SmartLearn-DevData')] } = {}) {
  const abs = resolve(dbPath).toLowerCase();
  if (!abs.split(sep).some((part) => part === 'smartlearn-promptlab')) throw new Error(`refusing ${dbPath}: the lab only runs on a copy under a SmartLearn-PromptLab directory`);
  for (const f of forbidden) if (abs.startsWith(resolve(f).toLowerCase() + sep)) throw new Error(`refusing ${dbPath}: it is inside the protected datastore ${f}`);
  if (abs.includes(`${sep}com.devulsky.smartlearn${sep}`)) throw new Error(`refusing ${dbPath}: it is the Desktop app-data database`);
  return resolve(dbPath);
}

export async function runLab({ dbPath, sourceName, section, runs = 1, outDir, provider = 'CODEX', promptVersion = '5', terms = [], timeoutMs = 1_200_000, allowMore = false, userEmail = 'dev@smartlearn.local' }) {
  if (runs > 3 && !allowMore) throw new Error('refusing more than 3 runs per invocation without --allow-more');
  const lab = assertLabDatabase(dbPath);
  const db = openDb(lab);
  runMigrations(db);
  mkdirSync(outDir, { recursive: true });
  try {
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get(userEmail.toLowerCase());
    if (!user) throw new Error(`user ${userEmail} not found in the lab copy`);
    const source = db.prepare('SELECT id, original_name FROM sources WHERE user_id = ? AND original_name LIKE ?').get(user.id, `%${sourceName}%`);
    if (!source) throw new Error(`no source matching ${sourceName}`);
    const candidates = proposals.searchTopics(db, user.id, source.id, section);
    const chosen = candidates.find((c) => c.title.toLowerCase() === section.toLowerCase()) ?? candidates[0];
    if (!chosen) throw new Error(`no section found for ${section}`);
    if (!chosen.generatable) throw new Error(`section ${chosen.title} is not generatable (${chosen.kind})`);
    const proposal = proposals.approveScope(db, user.id, source.id, { ordinal: chosen.ordinal });
    const detail = proposals.getProposal(db, user.id, proposal.id);
    const sourceText = detail.excerpt ?? '';
    const results = [];
    for (let n = 1; n <= runs; n += 1) {
      const started = Date.now();
      let record;
      try {
        const draft = await drafts.createDraft(db, user.id, proposal.id, {
          promptVersion, provider, consentGranted: true,
          codex: { timeoutMs, reasoningEffort: process.env.SMARTLEARN_CODEX_REASONING_EFFORT || 'high' },
        });
        const measures = measureDraft(draft, { sourceText, pages: Array.from({ length: proposal.pageEnd - proposal.pageStart + 1 }, (_, i) => proposal.pageStart + i), outOfScopeTerms: terms });
        record = { run: n, ok: true, seconds: Math.round((Date.now() - started) / 1000), draftId: draft.id, provider: draft.provider, promptVersion: draft.promptVersion, sourceScope: draft.sourceScope, audit: { result: draft.audit?.result, repaired: draft.audit?.repaired, modelAudit: draft.audit?.modelAudit, findings: draft.audit?.findings?.length }, summary: summarizeMeasures(measures), measures, draft };
      } catch (err) {
        record = { run: n, ok: false, seconds: Math.round((Date.now() - started) / 1000), error: { code: err.code ?? null, message: String(err.message ?? err).slice(0, 400) } };
      }
      writeFileSync(join(outDir, `run-${n}.json`), JSON.stringify(record, null, 1));
      results.push(record);
      console.log(`run ${n}: ${record.ok ? 'OK' : 'FAILED'} in ${record.seconds}s ${record.ok ? JSON.stringify(record.summary) : JSON.stringify(record.error)}`);
    }
    writeFileSync(join(outDir, 'index.json'), JSON.stringify({ unit: chosen.title, pages: [chosen.pageStart, chosen.pageEnd], chars: chosen.chars, provider, promptVersion, runs: results.map((r) => ({ run: r.run, ok: r.ok, seconds: r.seconds, summary: r.summary ?? null, error: r.error ?? null })) }, null, 1));
    return results;
  } finally { db.close(); }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const dbPath = arg('db');
  if (!dbPath) { console.error('missing --db'); process.exit(2); }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  runLab({
    dbPath, sourceName: arg('source', 'Costanzo'), section: arg('section', 'Glomerular Filtration'), runs: Number(arg('runs', '1')),
    outDir: arg('out', join(homedir(), 'SmartLearn-PromptLab', 'runs', stamp)), provider: arg('provider', 'CODEX'), promptVersion: arg('prompt-version', '5'),
    terms: (arg('terms', '') ?? '').split(',').map((t) => t.trim()).filter(Boolean), timeoutMs: Number(arg('timeout-ms', '1200000')), allowMore: flag('allow-more'),
  }).catch((err) => { console.error(String(err.message || err)); process.exit(1); });
}
