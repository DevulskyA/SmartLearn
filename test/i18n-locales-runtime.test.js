import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import ptBR from '../src/i18n/locales/pt-BR.js';
import en from '../src/i18n/locales/en.js';
import es from '../src/i18n/locales/es.js';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '../shared/locales.js';
import { getLocale, setLocale, t, tn } from '../src/i18n/index.js';
import { formatNumber } from '../src/i18n/format.js';

const catalogByLocale = { 'pt-BR': ptBR, en, es };
function isAsciiLetter(char) {
  const code = char?.charCodeAt(0) ?? 0;
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}
function tokenEnd(value, index) {
  const char = value[index];
  if (char === "{") {
    const end = value.indexOf("}", index + 1);
    return end < 0 ? 0 : end + 1;
  }
  if (char === "<" && (value[index + 1] === "/" || isAsciiLetter(value[index + 1]))) {
    const end = value.indexOf(">", index + 1);
    return end < 0 ? 0 : end + 1;
  }
  if (value.charCodeAt(index) === 92 && isAsciiLetter(value[index + 1])) {
    let end = index + 2;
    while (end < value.length && isAsciiLetter(value[end])) end += 1;
    return end;
  }
  return 0;
}
function placeholders(value) {
  const result = [];
  let index = 0;
  while (index < value.length) {
    const end = tokenEnd(value, index);
    if (!end) { index += 1; continue; }
    result.push(value.slice(index, end));
    index = end;
  }
  return result.sort();
}
afterEach(() => setLocale(DEFAULT_LOCALE));

test('all locale catalogs have exact key and placeholder parity with pt-BR and every key resolves from its own catalog', () => {
  const keys = Object.keys(ptBR).sort();
  assert.equal(keys.length, 1873);
  for (const locale of SUPPORTED_LOCALES) {
    const catalog = catalogByLocale[locale];
    assert.deepEqual(Object.keys(catalog).sort(), keys, `${locale} key set`);
    setLocale(locale);
    for (const key of keys) {
      assert.equal(typeof catalog[key], 'string', `${locale}/${key} type`);
      assert.ok(catalog[key].trim(), `${locale}/${key} is not empty`);
      assert.deepEqual(placeholders(catalog[key]), placeholders(ptBR[key]), `${locale}/${key} placeholders`);
      assert.equal(t(key), catalog[key], `${locale}/${key} must resolve from its own catalog`);
    }
  }
  assert.equal(en['auth.login.title'], 'Sign in');
  assert.equal(es['auth.login.title'], 'Iniciar sesión');
  assert.notEqual(en['screens.today.title'], ptBR['screens.today.title']);
  assert.notEqual(es['screens.today.title'], ptBR['screens.today.title']);
});

test('generated-content language help keeps the interface language independent in every locale', () => {
  assert.match(ptBR['screens.settings.language.body'], /idioma da interface/i);
  assert.match(en['screens.settings.language.body'], /interface language/i);
  assert.match(es['screens.settings.language.body'], /idioma de la interfaz/i);
});

test('setLocale updates document language, plural selection and locale-aware number formatting', () => {
  const previousDocument = globalThis.document;
  globalThis.document = { documentElement: { lang: '' } };
  try {
    assert.equal(setLocale('en'), 'en');
    assert.equal(getLocale(), 'en');
    assert.equal(globalThis.document.documentElement.lang, 'en');
    assert.equal(t('appUiLanguage.title'), 'Interface language');
    assert.equal(tn('today.day.todo', 2), 'reviews to do');
    const englishNumber = formatNumber(12345.6);

    assert.equal(setLocale('es'), 'es');
    assert.equal(getLocale(), 'es');
    assert.equal(globalThis.document.documentElement.lang, 'es');
    assert.equal(t('appUiLanguage.title'), 'Idioma de la interfaz');
    assert.equal(tn('today.day.todo', 2), 'repasos pendientes');
    assert.notEqual(formatNumber(12345.6), englishNumber);

    assert.equal(setLocale('unsupported'), DEFAULT_LOCALE);
    assert.equal(globalThis.document.documentElement.lang, DEFAULT_LOCALE);
  } finally {
    setLocale(DEFAULT_LOCALE);
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});
