// Design preview with a REAL local server on throwaway data (never the human database).
// Starts server/src/main.js on its own port with a temp DB + sources dir, creates a demo account with 3 PDFs,
// then starts Vite on 5188 proxying /v1 to that server and flagging the page as desktop (REMOTE_MODE + LOCAL_AUTHORITY),
// so Materiais shows exactly what the desktop app shows. Demo sign-in: DEMO_EMAIL / DEMO_PASSWORD below.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { waitForServerReady } from '../e2e/support/wait-for-server.js';

const SERVER_PORT = 13999;
const VITE_PORT = 5188;
const ORIGIN = `http://localhost:${VITE_PORT}`;
const API = `http://localhost:${SERVER_PORT}`;
const DEMO_EMAIL = 'design@example.com';
const DEMO_PASSWORD = 'a genuinely long design password 1';
const root = fileURLToPath(new URL('..', import.meta.url));
const dataDir = mkdtempSync(join(tmpdir(), 'sl-design-preview-'));

const server = spawn(process.execPath, [join(root, 'server/src/main.js')], {
  env: { ...process.env, SMARTLEARN_DB_PATH: join(dataDir, 'preview.db'), SMARTLEARN_SOURCES_DIR: join(dataDir, 'sources'), PORT: String(SERVER_PORT), HOST: 'localhost', NODE_ENV: 'test', SMARTLEARN_ALLOWED_ORIGINS: ORIGIN },
  stdio: 'inherit',
});
await waitForServerReady(API, { label: 'design preview' });

const json = { 'content-type': 'application/json', origin: ORIGIN };
await fetch(`${API}/v1/auth/register`, { method: 'POST', headers: json, body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD }) });
const login = await fetch(`${API}/v1/auth/login`, { method: 'POST', headers: json, body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD }) });
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
console.log(`[design-preview] ${ORIGIN}  (sign in: ${DEMO_EMAIL} / see DEMO_PASSWORD in scripts/design-preview.mjs)`);

const vite = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), '--port', String(VITE_PORT), '--strictPort'], {
  cwd: root,
  env: { ...process.env, SMARTLEARN_API_PROXY_TARGET: API, SMARTLEARN_PREVIEW_LOCAL: '1' },
  stdio: 'inherit',
});

const stop = () => { vite.kill(); server.kill(); setTimeout(() => { try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* temp dir */ } process.exit(0); }, 400); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
vite.on('exit', stop);
