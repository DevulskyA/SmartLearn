// BUILD IDENTITY: a human testing the Desktop must be able to tell WHICH build is in front of them (an old release .exe was once
// opened by mistake and invalidated a whole test round). The DEV launcher stamps the server with the commit, the mode and the
// declared AI provider; this shows them as one discreet line under the navigation. A packaged release carries no stamp and
// shows nothing.
const line = document.querySelector("#build-identity");
const API_BASE = (typeof window !== "undefined" && window.__SMARTLEARN_API_BASE__) || "";

/** "DEV · a1b2c3d · CODEX", or "" when there is nothing to say. */
export function buildIdentityText(build) {
  if (!build || !build.mode) return "";
  return [build.mode, build.head, build.provider].filter(Boolean).join(" · ");
}

async function show() {
  if (!line) return;
  try {
    const res = await fetch(`${API_BASE}/health/build`);
    if (!res.ok) return;
    const text = buildIdentityText(await res.json());
    if (text) {
      line.textContent = text;
      line.title = "Identidade desta execução: modo, commit e provedor de IA declarado.";
      line.hidden = false;
    }
  } catch { /* offline or no server: no identity to show */ }
}

if (typeof window !== "undefined" && (window.__SMARTLEARN_REMOTE_MODE__ || window.__SMARTLEARN_LOCAL_AUTHORITY__)) show();
