// How a formula of the Resumo Mestre is drawn and validated: KaTeX with the chemistry extension (mhchem), never trusting the text.
// Shared by the screens (src/summary-render.js, the formula dialog) and by the tests, so the limits live in one place.
import katex from 'katex';
import 'katex/contrib/mhchem';

// Finite limits on what one formula may cost, and a FRESH macro table per formula: `\gdef` in one document never leaks into another.
export function katexOptions(displayMode, { throwOnError = true } = {}) {
  return { displayMode, throwOnError, trust: false, output: 'htmlAndMathml', maxExpand: 1000, maxSize: 20, strict: 'ignore', macros: {} };
}

export { katex };

/** null when KaTeX accepts the formula (syntax only: this says nothing about scientific correctness), else the readable message. */
export function mathProblem(tex, displayMode = false) {
  try {
    katex.renderToString(tex, katexOptions(displayMode));
    return null;
  } catch (err) {
    return String(err?.message ?? err).replace(/^KaTeX parse error:\s*/, '');
  }
}
