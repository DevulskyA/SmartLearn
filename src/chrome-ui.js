// Header context label ("Materiais", "Materiais / <aula>"): mirrors the visible screen. Read-only over the DOM; no data, no requests.
const context = document.querySelector("#chrome-context");
const panels = [...document.querySelectorAll("[data-screen-panel]")];

function syncContext() {
  if (!context) return;
  const screen = panels.find((panel) => !panel.hidden);
  if (!screen) return;
  const title = screen.querySelector(":scope > .screen-heading h1")?.textContent?.trim();
  const editor = screen.dataset.screenPanel === "materials" ? document.querySelector("#sources-editor-view") : null;
  const lesson = editor && !editor.hidden ? editor.querySelector(".lesson-title")?.textContent?.trim() : "";
  if (lesson && title) context.textContent = `${title} / ${lesson}`;
  else if (title) context.textContent = title;
}

if (context) {
  const observer = new MutationObserver(syncContext);
  for (const panel of panels) observer.observe(panel, { attributes: true, attributeFilter: ["hidden"] });
  const editor = document.querySelector("#sources-editor-view");
  if (editor) observer.observe(editor, { attributes: true, attributeFilter: ["hidden"], childList: true, subtree: true });
  syncContext();
}
