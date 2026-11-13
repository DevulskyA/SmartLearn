// REAL-Codex generation timing/quality probe. Calls the operator's logged-in Codex CLI (a real, billed model call): it refuses to run
// without --authorize-real-codex. Read-only on the PDF; writes nothing to any database.
//
//   node scripts/real-codex-generation.mjs --authorize-real-codex --pdf <file.pdf> --from 267 --to 273 [--mode split|summary-first|single]
//
// modes: split          = 1 summary call + up to 3 parallel question calls (the committed default for sources >= 12 000 chars)
//        summary-first  = ONE call that writes only the Resumo Mestre (SMARTLEARN_CODEX_DEFER_QUESTIONS=true)
//        single         = one call that writes everything (the pre-split baseline)
// Prints one JSON line per phase: pages, chars, groups, wall time (ms), validation verdict, duplicate question stems.
import { readFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name, fallback = null) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] ? args[i + 1] : fallback; };

if (!flag('authorize-real-codex')) {
  console.error('Refusing to run: this makes real, billed Codex calls. Re-run with --authorize-real-codex.');
  process.exit(2);
}
const pdf = value('pdf');
const from = Number(value('from', '1'));
const to = Number(value('to', String(from)));
const mode = value('mode', 'split');
if (!pdf || !Number.isInteger(from) || !Number.isInteger(to) || to < from || !['split', 'summary-first', 'single'].includes(mode)) {
  console.error('Usage: node scripts/real-codex-generation.mjs --authorize-real-codex --pdf <file.pdf> --from <page> --to <page> [--mode split|summary-first|single]');
  process.exit(2);
}

const server = fileURLToPath(new URL('../server/', import.meta.url));
const load = (rel) => import(pathToFileURL(`${server}${rel}`).href);
const pdfjs = await load('node_modules/pdfjs-dist/legacy/build/pdf.mjs');
const { pageTextFromItems } = await load('src/pdf/page-text.js');
const { generateDraft, planQuestionGroups } = await load('src/ai/codex-provider.js');
const { validateDraft } = await load('src/ai/draft-schema.js');

const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(pdf)), useSystemFonts: true, disableFontFace: true, isEvalSupported: false }).promise;
const segments = [];
for (let p = from; p <= Math.min(to, doc.numPages); p += 1) {
  const page = await doc.getPage(p);
  segments.push({ pageIndex: p, text: pageTextFromItems((await page.getTextContent()).items) });
}
const chars = segments.reduce((n, s) => n + s.text.length, 0);
const groups = planQuestionGroups(segments);
console.log(JSON.stringify({ mode, pages: segments.length, chars, questionGroups: mode === 'split' ? (groups?.map((g) => g.map((s) => s.pageIndex)) ?? null) : null }));

// 'single' = a source below the split threshold takes the one-call path; force it by passing a single segment list that planQuestionGroups refuses.
const input = { segments, promptVersion: '10', generationLocale: 'pt-BR', deferQuestions: mode === 'summary-first' };
const t0 = Date.now();
let raw;
if (mode === 'single') {
  const { callCodex, DRAFT_JSON_SCHEMA } = await load('src/ai/codex-provider.js');
  const { buildDraftPrompt } = await load('src/ai/draft-prompt.js');
  raw = await callCodex(buildDraftPrompt(segments, '10', { generationLocale: 'pt-BR' }), DRAFT_JSON_SCHEMA, 'generate', { model: null }, {});
  raw = { ...raw, modelVersion: 'codex:default', promptVersion: '10' };
} else {
  raw = await generateDraft(input, { model: null });
}
const ms = Date.now() - t0;

let verdict;
try {
  const v = validateDraft(raw, { segments, allowNoQuestions: mode === 'summary-first' });
  verdict = { valid: true, quarantined: v.quarantinedCount, questions: v.questions.length, summaryChars: v.summary.length };
} catch (e) { verdict = { valid: false, error: String(e.message).slice(0, 300) }; }
const stems = (raw.questions ?? []).map((q) => String(q.question).toLowerCase().trim());
console.log(JSON.stringify({ ms, verdict, duplicateStems: stems.length - new Set(stems).size, summaryHead: String(raw.summary).slice(0, 160) }));
