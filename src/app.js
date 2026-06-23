import "./styles.css";
import { DB } from "./db.js";

await DB.init();

const DEFAULT_SCREEN = "today";
const navigationItems = [...document.querySelectorAll("[data-screen]")];
const screenPanels = [...document.querySelectorAll("[data-screen-panel]")];
const mainContent = document.querySelector(".app-main");

function isKnownScreen(screenId) {
  return screenPanels.some((panel) => panel.dataset.screenPanel === screenId);
}

export function showScreen(screenId, { focus = false } = {}) {
  const nextScreen = isKnownScreen(screenId) ? screenId : DEFAULT_SCREEN;

  for (const panel of screenPanels) {
    panel.hidden = panel.dataset.screenPanel !== nextScreen;
  }

  for (const item of navigationItems) {
    const isActive = item.dataset.screen === nextScreen;
    item.classList.toggle("is-active", isActive);
    item.setAttribute("aria-current", isActive ? "page" : "false");
  }

  if (window.location.hash !== `#${nextScreen}`) {
    window.history.replaceState(null, "", `#${nextScreen}`);
  }

  if (focus) {
    mainContent?.focus({ preventScroll: true });
  }
}

for (const item of navigationItems) {
  item.addEventListener("click", () => {
    showScreen(item.dataset.screen, { focus: true });
  });
}

window.addEventListener("hashchange", () => {
  showScreen(window.location.hash.slice(1));
});

showScreen(window.location.hash.slice(1) || DEFAULT_SCREEN);
