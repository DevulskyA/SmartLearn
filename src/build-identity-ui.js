// BUILD IDENTITY: a human testing the Desktop must be able to tell WHICH build is in front of them (an old release .exe was once
// opened by mistake and invalidated a whole test round). The app carries the identity of the build it was made from (version from
// the root package.json, commit from git, channel) embedded by Vite at build time, shows it under the navigation and in
// Configurações > Sobre, and asks the local server which build IT is: a mismatch is shown, never hidden.
const line = document.querySelector("#build-identity");
const about = document.querySelector("#about-identity");
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
  if (!identity || !server || !server.head) return false;
  return shaOf(identity.id) !== shaOf(server.head);
}

function renderAbout(identity, server) {
  if (!about) return;
  const rows = [
    ["Versão", identity ? `SmartLearn ${identity.version}` : "indisponível"],
    ["Canal", identity?.channel ?? "indisponível"],
    ["Build/commit", identity?.id ?? "indisponível"],
  ];
  if (server) {
    rows.push(["Servidor local", [server.mode, server.head, server.provider].filter(Boolean).join(" · ") || "sem identificação"]);
    if (identityMismatch(identity, server)) rows.push(["Atenção", "o aplicativo e o servidor local vêm de commits diferentes: reabra pelo SmartLearn DEV."]);
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
      line.textContent = identityMismatch(identity, server) ? `${text} · servidor ${server.head}` : text;
      line.title = "Identidade desta execução: versão, canal e commit da build. Detalhes em Configurações > Sobre.";
      line.hidden = false;
    }
  }
  renderAbout(identity, server);
}

if (typeof window !== "undefined") show();
