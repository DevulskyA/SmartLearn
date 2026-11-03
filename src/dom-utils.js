// Tiny DOM helper shared by src/app.js and the screen modules extracted from it.

/** An element with a class and plain text (textContent, never HTML). */
export function createTextElement(tagName, className, text) {
  const element = document.createElement(tagName);
  element.className = className;
  element.textContent = text;
  return element;
}
