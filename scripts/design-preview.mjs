// Design preview on :5188 with a REAL local server running on a COPY of the owner's data.
//
// Default: copies ~/SmartLearn-Homologacao-Data (else ~/SmartLearn-DevData) (database + WAL + PDFs) into a temp folder and runs server/src/main.js on the copy, so the
// owner signs in with their own account and sees their own subjects, lessons, history and PDFs. The original files are only READ
// (copied); the server, its migrations and every write happen on the copy, and the copy is deleted when the preview stops.
// `--seed`: throwaway synthetic data instead (scripts/seed-dev.mjs + 3 demo PDFs); sign in with DEV_ACCOUNT.
// Vite proxies /v1 to that server and flags the page as the desktop app (REMOTE_MODE + LOCAL_AUTHORITY).
import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { homedir, networkInterfaces, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { waitForServerReady } from '../e2e/support/wait-for-server.js';
import { DatabaseSync } from 'node:sqlite';
import { DEV_ACCOUNT, seedDev } from './seed-dev.mjs';

const SERVER_PORT = 13999;
const VITE_PORT = 5188;
const LAN = process.argv.includes('--lan'); // listen on the local network too (the OS firewall prompt is the owner's to answer)
const lanOrigins = LAN ? Object.values(networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => `http://${i.address}:${VITE_PORT}`) : [];
const ORIGIN = `http://localhost:${VITE_PORT}`;
const API = `http://127.0.0.1:${SERVER_PORT}`;
const root = fileURLToPath(new URL('..', import.meta.url));
// the owner's own account lives in the Homologação store; the DEV store is the fallback
const candidates = [['SmartLearn-Homologacao-Data', 'smartlearn-homologacao'], ['SmartLearn-DevData', 'smartlearn-dev']].map(([d, b]) => ({ dir: join(homedir(), d), base: b }));
const real = candidates.find((c) => existsSync(join(c.dir, `${c.base}.db`)));
const useSeed = process.argv.includes('--seed') || !real;
const realDir = real?.dir;
const dataDir = mkdtempSync(join(tmpdir(), 'sl-design-preview-'));

if (!useSeed) {
  // read-only on the original: plain file copies (database, its write-ahead log and shared-memory index, and the stored PDFs)
  for (const suffix of ['.db', '.db-wal', '.db-shm']) {
    if (existsSync(join(realDir, real.base + suffix))) cpSync(join(realDir, real.base + suffix), join(dataDir, 'preview' + suffix));
  }
  if (existsSync(join(realDir, 'sources'))) cpSync(join(realDir, 'sources'), join(dataDir, 'sources'), { recursive: true });
  // the copy must be a healthy database before anything runs on it
  const copy = new DatabaseSync(join(dataDir, 'preview.db'));
  const integrity = copy.prepare('PRAGMA integrity_check').get().integrity_check;
  const counts = Object.fromEntries(['users', 'subjects', 'learning_units', 'exercises', 'review_tasks', 'sources'].map((t) => [t, copy.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n]));
  copy.close();
  console.log(`[design-preview] copy of ${realDir} -> ${dataDir} (original untouched); integrity_check=${integrity}; rows=${JSON.stringify(counts)}`);
  if (integrity !== 'ok') { rmSync(dataDir, { recursive: true, force: true }); throw new Error('the copied database failed integrity_check'); }
}

const server = spawn(process.execPath, [join(root, 'server/src/main.js')], {
  env: { ...process.env, SMARTLEARN_DB_PATH: join(dataDir, 'preview.db'), SMARTLEARN_SOURCES_DIR: join(dataDir, 'sources'), PORT: String(SERVER_PORT), HOST: '127.0.0.1', NODE_ENV: 'test',
    // no paid or external AI, no key, no consent: generation stays unavailable in the preview
    SMARTLEARN_AI_PROVIDER: '', SMARTLEARN_AI_CONSENT: 'false', SMARTLEARN_AI_API_KEY: '', SMARTLEARN_AI_API_URL: '', SMARTLEARN_CODEX_COMMAND: 'sl-preview-codex-disabled', SMARTLEARN_ALLOWED_ORIGINS: [ORIGIN, `http://127.0.0.1:${VITE_PORT}`, ...lanOrigins].join(',') },
  stdio: 'inherit',
});
await waitForServerReady(API, { label: 'design preview' });

if (useSeed) {
  const json = { 'content-type': 'application/json', origin: ORIGIN };
  const seeded = await seedDev({ base: API, origin: ORIGIN, log: (m) => console.log(`[design-preview] seed: ${m}`) });
  console.log(`[design-preview] seed: ${JSON.stringify(seeded)}`);
  const login = await fetch(`${API}/v1/auth/login`, { method: 'POST', headers: json, body: JSON.stringify(DEV_ACCOUNT) });
  const cookie = (login.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
  const { csrfToken } = await (await fetch(`${API}/v1/auth/me`, { headers: { cookie } })).json();
  const pdf = readFileSync(join(root, '.specs/evidence/ui-funcional-2026-11-01/farmacologia-cap1.pdf'));
  const names = ['Costanzo Physiology, 7th edition.pdf', 'Guyton & Hall - Fisiologia Medica.pdf', 'Moore - Anatomia Clinica.pdf'];
  for (const [i, name] of names.entries()) {
    const form = new FormData();
    // a trailing PDF comment keeps each file valid but gives it its own checksum (the server merges identical files)
    form.append('file', new Blob([pdf, Buffer.from(`\n%design-preview-${i}\n`)], { type: 'application/pdf' }), name);
    const res = await fetch(`${API}/v1/sources`, { method: 'POST', headers: { origin: ORIGIN, cookie, 'x-csrf-token': csrfToken }, body: form });
    const { source } = await res.json();
    // the library lists only extracted documents (src/materials-ui.js loadExistingSources)
    const extracted = await fetch(`${API}/v1/sources/${source.id}/extract`, { method: 'POST', headers: { origin: ORIGIN, cookie, 'x-csrf-token': csrfToken, 'content-type': 'application/json' }, body: '{}' });
    console.log(`[design-preview] ${name}: upload HTTP ${res.status}, extract HTTP ${extracted.status}`);
  }
  console.log(`[design-preview] ${ORIGIN}  (sign in: ${DEV_ACCOUNT.email} / DEV_ACCOUNT.password in scripts/seed-dev.mjs)`);
} else {
  console.log(`[design-preview] ${ORIGIN}  (sign in with your own account: the data is a copy of ${realDir})`);
}

if (LAN) console.log(`[design-preview] LAN: ${lanOrigins.join('  ')}`);
const vite = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), '--port', String(VITE_PORT), '--strictPort', '--host', LAN ? '0.0.0.0' : '127.0.0.1'], {
  cwd: root,
  env: { ...process.env, SMARTLEARN_API_PROXY_TARGET: API, SMARTLEARN_PREVIEW_LOCAL: '1' },
  stdio: 'inherit',
});

const stop = () => { vite.kill(); server.kill(); setTimeout(() => { try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* temp dir */ } process.exit(0); }, 400); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
vite.on('exit', stop);
