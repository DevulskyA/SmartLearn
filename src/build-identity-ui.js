// BUILD IDENTITY: a human testing the Desktop must be able to tell WHICH build is in front of them (an old release .exe was once
// opened by mistake and invalidated a whole test round). The app carries the identity of the build it was made from (version from
// the root package.json, commit from git, channel) embedded by Vite at build time, shows it under the navigation and in
// Configurações > Sobre, and asks the local server which build IT is: a mismatch is shown, never hidden.
import { t } from './i18n/index.js';

const line = document.querySelector("#build-identity");
const about = document.querySelector("#about-identity");
const copyButton = document.querySelector("#copy-diagnostics");
const copyMessage = document.querySelector("#copy-diagnostics-message");
const API_BASE = (typeof window !== "undefined" && window.__SMARTLEARN_API_BASE__) || "";

/** The identity embedded in THIS bundle at build time (undefined outside a Vite build, e.g. in plain Node tests). */
export function embeddedIdentity() {
  return typeof __APP_IDENTITY__ !== "undefined" ? __APP_IDENTITY__ : null;
}

const shaOf = (id) => String(id ?? "").split("+")[0];

/** "SmartLearn DEV · v0.1.0 · a1b2c3d", the one-line identity of a build. */
export function appIdentityLine(identity) {
  if (!identity) return "";
  return ["SmartLearn", identity.channel, identity.version && `v${identity.version}`, identity.id ?? identity.commit].filter(Boolean).join(" · ").replace("SmartLearn · ", "SmartLearn ");
}

/** "DEV · a1b2c3d · CODEX", or "" when there is nothing to say. (The local server's own stamp.) */
export function buildIdentityText(build) {
  if (!build || !build.mode) return "";
  return [build.mode, build.head, build.provider].filter(Boolean).join(" · ");
}

/** True when the app bundle and the local server were NOT built from the same commit. */
export function identityMismatch(identity, server) {
  if (!identity || !server) return false;
  // Both sides know their build CONTENT (sha256 of the inputs): that is what must match, not the commit the app was opened at.
  if (identity.inputsHash && server.content) return identity.inputsHash !== server.content;
  if (!server.head) return false;
  return shaOf(identity.id) !== shaOf(server.head);
}

/** The text a person pastes into a bug report: build identity, schema, database file and row COUNTS (never row content). */
export function diagnosticText(identity, server) {
  const d = server?.diagnostics;
  const unavailable = t('build.value.unavailable');
  const buildId = identity?.id ?? unavailable;
  const buildText = identity?.inputsHash
    ? t('build.value.buildContent', { build: buildId, content: identity.inputsHash.slice(0, 12) })
    : buildId;
  const lines = [
    t('build.diagnostic.version', { version: identity ? t('build.value.version', { version: identity.version }) : unavailable }),
    t('build.diagnostic.channel', { channel: identity?.channel ?? unavailable }),
    t('build.diagnostic.build', { build: buildText }),
  ];
  if (server) lines.push(t('build.diagnostic.server', { server: [server.mode, server.head, server.provider].filter(Boolean).join(" · ") || t('build.value.noIdentity') }));
  if (d) {
    lines.push(
      t('build.diagnostic.schema', { schema: d.schemaVersion ?? unavailable }),
      t('build.diagnostic.database', { database: d.dbPath }),
      t('build.diagnostic.counts', { counts: Object.entries(d.counts ?? {}).map(([k, v]) => `${k}=${v}`).join(" ") }),
    );
  }
  return lines.join("\n");
}

function renderAbout(identity, server) {
  if (!about) return;
  const unavailable = t('build.value.unavailable');
  const rows = [
    [t('build.label.version'), identity ? t('build.value.version', { version: identity.version }) : unavailable],
    [t('build.label.channel'), identity?.channel ?? unavailable],
    [t('build.label.build'), identity?.id ?? unavailable],
  ];
  if (server) {
    rows.push([t('build.label.server'), [server.mode, server.head, server.provider].filter(Boolean).join(" · ") || t('build.value.noIdentity')]);
    if (identityMismatch(identity, server)) rows.push([t('build.label.warning'), t('build.value.mismatch')]);
  }
  about.replaceChildren(...rows.flatMap(([term, value]) => {
    const dt = document.createElement("dt");
    dt.textContent = term;
    const dd = document.createElement("dd");
    dd.textContent = value;
    return [dt, dd];
  }));
}

async function show() {
  const identity = embeddedIdentity();
  let server = null;
  try {
    const res = await fetch(`${API_BASE}/health/build`);
    if (res.ok) server = await res.json();
  } catch { /* offline or no server: the embedded identity is still true */ }
  if (line) {
    const text = appIdentityLine(identity);
    if (text) {
      line.textContent = identityMismatch(identity, server) ? t('build.line.mismatch', { identity: text, head: server.head }) : text;
      line.title = t('build.line.title');
      line.hidden = false;
    }
  }
  renderAbout(identity, server);
  if (copyButton) {
    copyButton.onclick = async () => {
      try {
        await navigator.clipboard.writeText(diagnosticText(identity, server));
        if (copyMessage) copyMessage.textContent = t('build.copy.done');
      } catch {
        if (copyMessage) copyMessage.textContent = t('build.copy.failed');
      }
    };
  }
}

if (typeof window !== "undefined") show();
