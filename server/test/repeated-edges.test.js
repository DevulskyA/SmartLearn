import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripRunningHeaders } from '../src/pdf/page-text.js';

// SPRINT 05h (PAGE FURNITURE, second book). Real Spanish textbook (Cecil, Tratado de Medicina Interna): a two/three
// line header block alternates between odd and even pages, part of it identical on every page and part of it
// carrying the page number:
//   odd :  "© ELSEVIER. Fotocopiar sin autorización es un delito." / "Sección XII Gastroenterología" / "Capítulo 139 Trastornos funcionales gastrointestinales 991"
//   even:  "Sección XII Gastroenterología" / "992 Capítulo 139 Trastornos funcionales gastrointestinales"

const COPY = '© ELSEVIER. Fotocopiar sin autorización es un delito.';
const SECTION = 'Sección XII Gastroenterología';
const CHAPTER = 'Trastornos funcionales gastrointestinales';
// a token that is unique per page and has no digits, so a body line can never look like furniture
const word = (n) => String.fromCharCode(96 + n).repeat(6);
const body = (n) => `texto del cuerpo de la pagina ${word(n)}, que sigue la frase anterior\ny continua aqui ${word(n)}`;

const page = (n) => (n % 2 === 1
  ? [COPY, SECTION, `Capítulo 139 ${CHAPTER} ${990 + n}`, body(n)].join('\n')
  : [SECTION, `${990 + n} Capítulo 139 ${CHAPTER}`, body(n)].join('\n'));

test('the alternating multi-line header of the real book is removed from every page, body untouched', () => {
  const pages = Array.from({ length: 10 }, (_, i) => page(i + 1));
  assert.deepEqual(stripRunningHeaders(pages), Array.from({ length: 10 }, (_, i) => body(i + 1)));
});

test('a line repeated verbatim at the top of many pages is furniture even with no page number', () => {
  const pages = Array.from({ length: 6 }, (_, i) => `Curso de Imunologia 2026\nconteudo unico da pagina ${word(i + 1)}\nmais texto ${word(i + 1)}`);
  assert.deepEqual(stripRunningHeaders(pages), Array.from({ length: 6 }, (_, i) => `conteudo unico da pagina ${word(i + 1)}\nmais texto ${word(i + 1)}`));
});

test('a repeated footer is removed the same way', () => {
  const pages = Array.from({ length: 6 }, (_, i) => `texto da pagina ${word(i + 1)}\nmais texto ${word(i + 1)}\nDepartamento de Medicina`);
  assert.deepEqual(stripRunningHeaders(pages), Array.from({ length: 6 }, (_, i) => `texto da pagina ${word(i + 1)}\nmais texto ${word(i + 1)}`));
});

test('a first line that repeats on only a few pages, or in a short document, is content', () => {
  const rare = ['Resumo\ntexto a', 'outro inicio\ntexto b', 'terceiro inicio\ntexto c', 'quarto inicio\ntexto d', 'quinto inicio\ntexto e', 'sexto inicio\ntexto f', 'Resumo\ntexto g'];
  assert.deepEqual(stripRunningHeaders(rare), rare, '2 of 7 pages is not furniture');
  const short = ['Cabecalho fixo\na', 'Cabecalho fixo\nb', 'Cabecalho fixo\nc'];
  assert.deepEqual(stripRunningHeaders(short), short, 'three pages are not enough evidence');
});

test('a page that is only the repeated line keeps it (there is no body under it to separate it from)', () => {
  const pages = ['Curso de Imunologia', 'Curso de Imunologia', 'Curso de Imunologia', 'Curso de Imunologia', 'Curso de Imunologia'];
  assert.deepEqual(stripRunningHeaders(pages), pages);
});

test('long prose lines and lines outside the page edge are never treated as furniture', () => {
  const long = 'palavra '.repeat(20).trim();
  const pages = Array.from({ length: 6 }, (_, i) => `${long}\nlinha ${word(i + 1)}\nfim ${word(i + 1)}`);
  assert.deepEqual(stripRunningHeaders(pages), pages, 'a 160-character line is prose');
  const openers = ['alfa', 'beta', 'gama', 'delta', 'epsilon', 'zeta'];
  const middle = openers.map((w) => `abertura ${w}\nlinha do meio repetida\nfecho ${w}`);
  assert.deepEqual(stripRunningHeaders(middle), middle, 'only the first and last lines of a page are edges');
});
