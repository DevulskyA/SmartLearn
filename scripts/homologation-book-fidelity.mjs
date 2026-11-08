#!/usr/bin/env node
// Fidelity check of a REAL generation on a SMALL slice of the real book (A-01 in .specs/ARTIFACTS.md), through the installed
// "SmartLearn Homologacao" shortcut and a scratch datastore. ONE paid Codex generation, a few pages, authorized by the owner.
//
//   node scripts/homologation-book-fidelity.mjs [--from 267] [--to 269] [--dest C:\Projetos\SmartLearn-Homologacao]
//
// The book is only READ: its sha256 is checked, the pages are cut into a temp copy (pypdf) and that copy is uploaded.
// The report (metrics + the generated text) goes to a temp folder, never into the repository (the book is copyrighted).
// Metrics compare the generated summary/questions with the source text of those pages: numbers kept/invented and central terms dropped.
// They are a screen, not a medical judgment: the clinical review of the content stays human (T-F4-01, VALID-8).
// The helpers below mirror scripts/homologation-proof.mjs on purpose (that script is proven and left untouched).
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';
import http from 'node:http';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ps = (script) => execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(`$ProgressPreference = 'SilentlyContinue'; [Console]::OutputEncoding = [System.Text.Encoding]::UTF8\n${script}\nexit 0`, 'utf16le').toString('base64')], { encoding: 'utf8', maxBuffer: 1 << 24 }).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback; };
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const lc = (p) => resolve(p).toLowerCase();

const BOOK = 'C:\\Users\\Ariel\\SmartLearn-DevData\\sources\\7c2e0168880f65b135f4f63daf07831e.pdf';
const BOOK_SHA = 'b0a8da11631acaa2939ae8278d521d80f16d38e89e0c78b2a18531d5a01ac81c';  // A-01
const from = Number(arg('--from', 267));
const to = Number(arg('--to', 269));
const PROVIDER = (process.env.BOOK_PROVIDER ?? 'CODEX').toUpperCase();  // FAKE only to smoke-test the plumbing for free
const dest = resolve(arg('--dest', 'C:\\Projetos\\SmartLearn-Homologacao'));
const exe = join(dest, 'app', 'smartlearn.exe');
const shortcutPath = ps(`Join-Path ([Environment]::GetFolderPath('Desktop')) ('SmartLearn Homologa' + [char]0xE7 + [char]0xE3 + 'o.lnk')`);
const scratch = join(homedir(), 'SmartLearn-Homologacao-Prova');
const work = join(tmpdir(), 'book-fidelity');

const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: Boolean(ok), detail: detail ?? null }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail === undefined ? '' : ` :: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`); return ok; };

function appProcess() {
  const out = ps(`Get-Process -Name smartlearn -ErrorAction SilentlyContinue | Where-Object { $_.Path -ieq '${exe.replace(/'/g, "''")}' } | Select-Object -First 1 | ForEach-Object { "$($_.Id)|$($_.MainWindowTitle)|$($_.MainWindowHandle)" }`);
  if (!out) return null;
  const [pid, title, handle] = out.split('|');
  return { pid: Number(pid), title, handle };
}
async function openThroughShortcut() {
  if (appProcess()) throw new Error('the Homologacao is already open; close it first');
  const env = { ...process.env, SMARTLEARN_AI_PROVIDER: PROVIDER, SMARTLEARN_HOMOLOGACAO_DATA_DIR: scratch };
  delete env.SMARTLEARN_DEV_DATA_DIR; delete env.SMARTLEARN_DB_PATH; delete env.SMARTLEARN_SOURCES_DIR;
  spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Start-Process -FilePath '${shortcutPath.replace(/'/g, "''")}'`], { env, stdio: 'ignore', windowsHide: true }).unref();
  const until = Date.now() + 60000;
  let app = null;
  while (Date.now() < until && !(app = appProcess())) await sleep(500);
  if (!app) throw new Error('the shortcut did not start the installed executable within 60 s');
  return app;
}
const backendOf = (pid) => ps(`Get-CimInstance Win32_Process -Filter "ParentProcessId=${pid} AND Name='node.exe'" | ForEach-Object { $_.ProcessId }`).split(/\r?\n/).filter(Boolean).map(Number);
async function backendBase() {
  const portFile = join(scratch, 'smartlearn-homologacao.port');
  const until = Date.now() + 60000;
  while (Date.now() < until) {
    try { const port = Number(readFileSync(portFile, 'utf8').trim()); if (port > 0 && (await fetch(`http://127.0.0.1:${port}/health/ready`)).status === 200) return `http://127.0.0.1:${port}`; } catch { /* not up yet */ }
    await sleep(500);
  }
  throw new Error('backend did not become ready');
}
async function closeGracefully(app) {
  const children = backendOf(app.pid);
  try { execFileSync('taskkill', ['/PID', String(app.pid)], { stdio: 'ignore' }); } catch { /* may refuse */ }
  const until = Date.now() + 25000;
  while (Date.now() < until && appProcess()) await sleep(400);
  if (appProcess()) { try { execFileSync('taskkill', ['/PID', String(app.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ } }
  await sleep(2500);
  for (const p of children) { try { execFileSync('taskkill', ['/PID', String(p), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ } }
}

function client(base) {
  let cookie = ''; let csrf = '';
  const headers = (extra = {}) => ({ Origin: base, ...(cookie ? { Cookie: cookie } : {}), ...(csrf ? { 'X-CSRF-Token': csrf } : {}), ...extra });
  const call = async (method, path, body) => {
    const h = headers(body === undefined ? {} : { 'Content-Type': 'application/json' });
    if (path.startsWith('/v1/auth/login') || path.startsWith('/v1/auth/register')) delete h['X-CSRF-Token'];
    const res = await fetch(`${base}${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    const set = res.headers.getSetCookie?.() ?? [];
    if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ');
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 400)}`);
    return text ? JSON.parse(text) : null;
  };
  // the generation answers only when Codex is done (minutes): node:http has no header timeout, unlike fetch
  const slowPost = (path, body) => new Promise((ok, fail) => {
    const u = new URL(`${base}${path}`);
    const data = JSON.stringify(body ?? {});
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST', headers: headers({ 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }) }, (res) => {
      let text = ''; res.on('data', (c) => { text += c; }); res.on('end', () => (res.statusCode < 300 ? ok(JSON.parse(text)) : fail(new Error(`POST ${path} -> ${res.statusCode}: ${text.slice(0, 600)}`))));
    });
    req.on('error', fail); req.write(data); req.end();
  });
  const upload = async (path, filename, buffer) => {
    const form = new FormData();
    form.append('file', new Blob([buffer], { type: 'application/pdf' }), filename);
    const res = await fetch(`${base}${path}`, { method: 'POST', headers: headers(), body: form });
    const text = await res.text();
    if (!res.ok) throw new Error(`POST ${path} -> ${res.status}: ${text.slice(0, 400)}`);
    return JSON.parse(text);
  };
  return { call, slowPost, upload, async login(email, password) { await call('POST', '/v1/auth/login', { email, password }); csrf = (await call('GET', '/v1/auth/me')).csrfToken; } };
}

// ---------- fidelity metrics ----------
const norm = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const numbersOf = (text) => new Set([...String(text).replace(/(\d)[ \u00a0](\d{3})(?!\d)/g, '$1$2').matchAll(/\d+(?:[.,]\d+)?/g)].map((m) => m[0].replace(',', '.')).filter((n) => n.length >= 2 || n.includes('.')));
function termsOf(text) {
  const counts = new Map();
  for (const m of norm(text).matchAll(/[a-z]{8,}/g)) { const stem = m[0].slice(0, 5); const e = counts.get(stem) ?? { n: 0, shown: m[0] }; e.n += 1; counts.set(stem, e); }
  return counts;
}

async function main() {
  const t0 = Date.now();
  check('book exists and its sha256 equals A-01 in ARTIFACTS.md', existsSync(BOOK) && sha256(BOOK) === BOOK_SHA);
  rmSync(work, { recursive: true, force: true }); mkdirSync(work, { recursive: true });
  const slice = join(work, 'recorte.pdf');
  execFileSync('python', ['-c', 'import sys;from pypdf import PdfReader,PdfWriter;r=PdfReader(sys.argv[1]);w=PdfWriter();[w.add_page(r.pages[i]) for i in range(int(sys.argv[3])-1,int(sys.argv[4]))];w.write(sys.argv[2])', BOOK, slice, String(from), String(to)]);
  const pages = to - from + 1;
  check(`slice of ${pages} pages (${from}-${to}) cut into a temp copy`, existsSync(slice));

  const pdfjs = await import(pathToFileURL(join(ROOT, 'server', 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.mjs')).href);
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(slice)), useSystemFonts: true }).promise;
  let sourceText = '';
  for (let i = 1; i <= doc.numPages; i += 1) sourceText += `${(await (await doc.getPage(i)).getTextContent()).items.map((x) => x.str).join(' ')}\n`;
  check('the slice has the expected pages and real text', doc.numPages === pages && sourceText.length > 1500, { pages: doc.numPages, chars: sourceText.length });

  rmSync(scratch, { recursive: true, force: true });
  const email = `fidelidade-${Date.now()}@homologacao.test`;
  const password = 'a genuinely long test password 1';
  const app = await openThroughShortcut();
  try {
    const base = await backendBase();
    const build = await (await fetch(`${base}/health/build`)).json();
    check(`opened through the shortcut with provider ${PROVIDER}`, build.provider === PROVIDER, { provider: build.provider, content: String(build.content).slice(0, 12) });
    const api = client(base);
    await api.call('POST', '/v1/auth/register', { email, password });
    await api.login(email, password);
    const up = await api.upload('/v1/sources', 'recorte-costanzo.pdf', readFileSync(slice));
    const sourceId = up.source.id;
    const ex = await api.call('POST', `/v1/sources/${sourceId}/extract`);
    check('slice extracted by the product', ex.extraction.status === 'EXTRACTED' && ex.extraction.pageCount === pages, ex.extraction);
    const scope = await api.call('POST', `/v1/sources/${sourceId}/scopes`, { title: 'Filtracao glomerular (recorte)', range: { pageStart: 1, pageEnd: pages } });
    const proposalId = scope.proposal.id;
    console.log(`generating with ${PROVIDER} (${PROVIDER === 'CODEX' ? '1 PAID call' : 'free'}, ${pages} pages)...`);
    const g0 = Date.now();
    const created = await api.slowPost(`/v1/proposals/${proposalId}/drafts`, {});
    const draft = (await api.call('GET', `/v1/drafts/${created.draft.id}`)).draft;
    check('draft generated', Boolean(draft?.summary), { seconds: Math.round((Date.now() - g0) / 1000), keys: Object.keys(draft).slice(0, 14) });

    const summaryText = typeof draft.summary === 'string' ? draft.summary : JSON.stringify(draft.summary);
    const questionsText = JSON.stringify(draft.questions ?? []);
    const generated = `${summaryText}\n${questionsText}`;
    const srcNums = numbersOf(sourceText); const sumNums = numbersOf(summaryText); const allNums = numbersOf(generated);
    const invented = [...sumNums].filter((n) => !srcNums.has(n));
    const keptInSummary = [...srcNums].filter((n) => sumNums.has(n));
    const srcTerms = termsOf(sourceText); const sumStems = new Set([...termsOf(summaryText).keys()]);
    const central = [...srcTerms].filter(([, e]) => e.n >= 2);
    const droppedTerms = central.filter(([s]) => !sumStems.has(s)).map(([, e]) => e.shown);
    const report = {
      slice: { from, to, sourceChars: sourceText.length },
      numbers: { inSource: srcNums.size, keptInSummary: keptInSummary.length, keptInSummaryOrQuestions: [...srcNums].filter((n) => allNums.has(n)).length, inventedInSummary: invented, missingFromSummary: [...srcNums].filter((n) => !sumNums.has(n)) },
      centralTerms: { total: central.length, droppedFromSummary: droppedTerms },
      productAudit: draft.audit ?? null,
      counts: { summaryChars: summaryText.length, questions: (draft.questions ?? []).length },
    };
    writeFileSync(join(work, 'relatorio.json'), JSON.stringify({ report, summary: draft.summary, questions: draft.questions }, null, 2));
    writeFileSync(join(work, 'fonte.txt'), sourceText);
    console.log(`REPORT ${JSON.stringify(report)}`);
    check('no number appears in the summary that the source does not state', invented.length === 0, invented);
    // The book is English and the summary is pt-BR, so word matching is only a hint (cognates match, "capillaries"/"capilares" may not):
    // the dropped-term list is printed for a human/agent read of source x summary, it is not a pass/fail criterion.
    console.log(`CENTRAL TERMS (hint only, cross-language): ${central.length - droppedTerms.length}/${central.length} stems present; not found: ${droppedTerms.join(', ')}`);
  } finally {
    await closeGracefully(app);
  }
  const failed = results.filter((r) => !r.ok);
  console.log(JSON.stringify({ result: failed.length ? 'FAIL' : 'PASS', checks: results.length, failed: failed.map((f) => f.name), seconds: Math.round((Date.now() - t0) / 1000), reportDir: work }));
  rmSync(scratch, { recursive: true, force: true });
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => { console.error(`ERROR: ${error.stack ?? error}`); try { const a = appProcess(); if (a) execFileSync('taskkill', ['/PID', String(a.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* nothing */ } rmSync(scratch, { recursive: true, force: true }); process.exit(2); });
