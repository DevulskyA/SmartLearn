// Sources chosen to cover every shape the visual editor models AND every shape it must only carry; shared by the converter and schema tests.
export const ID = '0b2f6c1e-5d1a-4c7e-9a3b-1f2e3d4c5b6a';

export const CORPUS = {
  plain: 'Texto simples sem marcação.',
  legacyHeadings: '## Fisiologia\nA pressão arterial média é PAM = PD + (PS - PD)/3.\n\n## Patologia\nEdema por aumento da pressão hidrostática.',
  crlf: 'Linha um.\r\nLinha dois no mesmo parágrafo.\r\n\r\n## Título\r\n\r\nFim.',
  lone_cr: 'a\rb\r\rc',
  blankRuns: '\n\n  Início com espaços\n\n\n\nQuatro quebras antes\n\n',
  singleNewlineGap: '# Título\nparágrafo colado\n\n- a\n- b\nfim',
  formulas: 'Taxa \\(\\frac{a}{b}\\) e \\(x^2\\) no meio.\n\n\\[\nE = mc^2\n\\]\n\n\\[\\int_0^1 x\\,dx\\]\n\nDepois.',
  invalidFormula: 'Quebrada \\(\\frac{a\\) aqui.\n\n\\[\n\\unknowncmd{x}\n\\]',
  figures: `Antes\n\n[[fig:${ID}]]\n\nDepois\n\n[[fig:${ID.toUpperCase()}]]`,
  lists: '- um\n- dois\n  - dois.um\n  - dois.dois\n- três\n\n3. terceiro\n4. quarto\n\n- solta a\n\n- solta b',
  marks: 'Isto é **negrito**, *itálico*, ~~riscado~~ e `código` com ***ambos***.',
  table: '| A | B |\n|---|---|\n| 1 | 2 |\n\nTexto depois.',
  quote: '> citação\n> continua\n\nParágrafo.',
  code: '```js\nconst x = `a`;\n```\n\n    bloco recuado\n\n---\n\nFim',
  unknown: '[link](http://x.test) ![img](a.png) <b>html</b> &amp; &#35; $5 e $6',
  escapes: 'a \\* b \\_ c \\\\ d \\(não é fórmula\\)',
  unicode: 'Ação — insuficiência cardíaca (ICC) ≥ 50 % · α-bloqueador · 💊',
  empty: '',
  onlyBlank: '\n\n   \n',
};
