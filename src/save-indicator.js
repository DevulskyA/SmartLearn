// The save indicator: one small, calm line that tells the student, every time the lesson is saved by itself, where their text is.
// It never shouts: typing shows a quiet "saves by itself in a moment", a request shows a soft spinner, a save shows a check that draws itself once and
// settles into "Salvo às 14:03", and only a lost connection, a conflict or a refusal take a warmer colour. It is text first (the icon is decoration),
// uses the app's own status colours, respects reduced motion, and is NOT a live region: each area of the editor keeps ONE standing live region (its message
// line), so autosaves do not chatter at screen readers; the longer explanations of the problem states go through that line, and the indicator's text is there
// to be read whenever the student looks for it.
import { t } from "./i18n/index.js";

const SVG = "http://www.w3.org/2000/svg";
const ICONS = {
  pending: [["circle", { cx: 8, cy: 8, r: 2.6 }]],
  saving: [["circle", { cx: 8, cy: 8, r: 5.5, "stroke-dasharray": "22 13", "stroke-linecap": "round" }]],
  saved: [["path", { d: "M3.5 8.6l3.1 3.1 6-7.2", "stroke-linecap": "round", "stroke-linejoin": "round" }]],
  offline: [["path", { d: "M4.6 12.4h6.9a2.9 2.9 0 0 0 .5-5.7 4 4 0 0 0-7.4 1 2.4 2.4 0 0 0 0 4.7z", "stroke-linejoin": "round" }], ["path", { d: "M2.4 2.4l11.2 11.2", "stroke-linecap": "round" }]],
  problem: [["path", { d: "M8 2.6l5.8 10H2.2z", "stroke-linejoin": "round" }], ["path", { d: "M8 6.6v2.9M8 11.5v.1", "stroke-linecap": "round" }]],
};
const ICON_OF = { pending: "pending", saving: "saving", saved: "saved", offline: "offline", conflict: "problem", error: "problem" };
const TONE_OF = { pending: "quiet", saving: "busy", saved: "ok", offline: "warn", conflict: "bad", error: "bad" };
const JUST_SAVED_MS = 4000;

const pad = (n) => String(n).padStart(2, "0");
/** "14:03" in the student's clock (24 h, no seconds). */
export const clockTime = (at) => { const d = new Date(at); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

/**
 * What to show for a state. `justSaved` is true during the first seconds after a save ("Salvo agora"), then it settles on the time.
 * Returns null for states that show nothing (idle). Pure: unit-testable without a DOM.
 */
export function describeSaveState(state, { at = 0, justSaved = false } = {}) {
  if (!ICON_OF[state]) return null;
  const label = {
    pending: () => t("editor.autosave.state.pending"),
    saving: () => t("editor.autosave.state.saving"),
    saved: () => (justSaved ? t("editor.autosave.state.savedNow") : t("editor.autosave.state.savedAt", { time: clockTime(at) })),
    offline: () => t("editor.autosave.state.offline"),
    conflict: () => t("editor.autosave.state.conflict"),
    error: () => t("editor.autosave.state.error"),
  }[state]();
  return { state, label, icon: ICON_OF[state], tone: TONE_OF[state] };
}

function drawIcon(name) {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.6");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  for (const [tag, attrs] of ICONS[name]) {
    const shape = document.createElementNS(SVG, tag);
    for (const [key, value] of Object.entries(attrs)) shape.setAttribute(key, String(value));
    svg.append(shape);
  }
  return svg;
}

/** The indicator element. `set(state, info)` updates it; it hides itself for "idle" and cleans its own timer. */
export function createSaveIndicator() {
  const root = document.createElement("span");
  root.className = "save-indicator";
  root.dataset.state = "idle";
  root.hidden = true;
  const icon = document.createElement("span");
  icon.className = "save-indicator-icon";
  icon.setAttribute("aria-hidden", "true");
  const label = document.createElement("span");
  label.className = "save-indicator-label";
  root.append(icon, label);
  let timer = null;
  let current = { state: "idle", info: {} };

  function paint(justSaved) {
    const view = describeSaveState(current.state, { ...current.info, justSaved });
    if (!view) { root.hidden = true; root.dataset.state = "idle"; return; }
    const changed = root.dataset.state !== view.state;
    root.hidden = false;
    root.dataset.state = view.state;
    root.dataset.tone = view.tone;
    if (changed) icon.replaceChildren(drawIcon(view.icon));
    label.textContent = view.label;
  }

  return {
    element: root,
    set(state, info = {}) {
      clearTimeout(timer);
      current = { state, info };
      paint(state === "saved");
      if (state === "saved") timer = setTimeout(() => paint(false), JUST_SAVED_MS);
    },
    destroy() { clearTimeout(timer); },
  };
}
