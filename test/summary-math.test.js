// The formulas a medical student really writes must be accepted by the shared KaTeX configuration, wrong ones must be reported, and the
// configuration itself must stay safe (no trust, finite limits, no macros shared between formulas).
import test from 'node:test';
import assert from 'node:assert/strict';
import { katex, katexOptions, mathProblem } from '../shared/summary-math.js';

const VALID = {
  fraction: '\\frac{P_{GC} - P_{BS}}{R}',
  root: '\\sqrt[3]{x^2 + 1}',
  subscript: 'C_{0}',
  power: 'e^{-kt}',
  greek: '\\alpha + \\beta \\cdot \\mu',
  matrix: '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}',
  multiline: '\\begin{aligned} y &= ax + b \\\\ z &= cx \\end{aligned}',
  chemistry: '\\ce{2H2 + O2 -> 2H2O}',
  chemistryIon: '\\ce{Na+ + Cl- <=> NaCl}',
  units: '\\mathrm{mL\\,min^{-1}}',
  escapedChars: '50\\%\\ \\{a, b\\}\\ \\$5 \\&\\ \\#',
};

test('the formulas of a medical student are accepted (fractions, roots, indices, powers, Greek, matrices, aligned lines, chemistry, units, escapes)', () => {
  for (const [name, tex] of Object.entries(VALID)) assert.equal(mathProblem(tex), null, `${name}: ${tex}`);
  assert.equal(mathProblem('x^2 + y^2 = z^2', true), null);
});

test('syntax errors are reported with a readable reason', () => {
  for (const tex of ['\\frac{a}{', '\\unknownmacro{x}', 'a ^ ^ b', '\\begin{matrix} a & b', '\\ce{H2O', '{{{']) {
    const problem = mathProblem(tex);
    assert.equal(typeof problem, 'string', tex);
    assert.ok(problem.length > 0 && !problem.startsWith('KaTeX parse error'), tex);
  }
});

test('the configuration is safe: nothing is trusted, expansion and size are finite, links/includes are refused', () => {
  const o = katexOptions(false);
  assert.equal(o.trust, false);
  assert.equal(o.output, 'htmlAndMathml');
  assert.ok(Number.isFinite(o.maxExpand) && Number.isFinite(o.maxSize));
  for (const evil of ['\\href{javascript:alert(1)}{x}', '\\url{http://evil.example}', '\\includegraphics{http://evil.example/x.png}', '\\htmlClass{x}{y}', '\\htmlId{x}{y}']) {
    const html = katex.renderToString(evil, katexOptions(false, { throwOnError: false }));
    assert.doesNotMatch(html, /<a[\s>]|\shref=|<img|\ssrc=/i, `${evil} must not produce a link or an image element (its text may stay in the annotation)`);
  }
  assert.notEqual(mathProblem('\\def\\a{\\a\\a}\\a'), null, 'runaway macro expansion is stopped');
});

test('macros defined in one formula never reach another (a fresh table every time)', () => {
  assert.equal(mathProblem('\\gdef\\leak{42} \\leak'), null);
  assert.notEqual(mathProblem('\\leak'), null);
  assert.notEqual(katexOptions(false).macros, katexOptions(false).macros);
});

test('the rendered markup carries the LaTeX back (MathML annotation), so the formula is recoverable from what is drawn', () => {
  const html = katex.renderToString('\\frac{a}{b}', katexOptions(false));
  assert.match(html, /<annotation encoding="application\/x-tex">\\frac\{a\}\{b\}<\/annotation>/);
});
