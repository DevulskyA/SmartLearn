import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { t, tn, has, setLocale, getLocale, registerCatalog } from '../src/i18n/index.js';
import ptBR from '../src/i18n/locales/pt-BR.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// Built from code points on purpose: the repository's mojibake guard (scripts/text-integrity.mjs) flags the characters themselves.
const MOJIBAKE = new RegExp([0xC3, 0xC2, 0xFFFD].map((code) => String.fromCodePoint(code)).join('|'));
afterEach(() => { setLocale('pt-BR'); });

test('a known key returns the pt-BR text; an unknown key returns the key itself (nothing is invented)', () => {
  assert.equal(t('auth.login.title'), 'Entrar');
  assert.equal(t('no.such.key'), 'no.such.key');
  assert.equal(has('auth.login.title'), true);
  assert.equal(has('no.such.key'), false);
});

test('the older form t(key, locale) still works', () => {
  assert.equal(t('auth.login.title', 'pt-BR'), 'Entrar');
  assert.equal(t('auth.login.title', 'es'), 'Entrar', 'es has no catalog yet: falls back to pt-BR');
});

test('placeholders are filled; a missing parameter stays visible as written, never "undefined"', () => {
  registerCatalog('pt-BR', { ...ptBR, 'test.hello': 'Olá, {name}! Você tem {n} itens.' });
  assert.equal(t('test.hello', { name: 'Ana', n: 3 }), 'Olá, Ana! Você tem 3 itens.');
  assert.equal(t('test.hello', { name: 'Ana' }), 'Olá, Ana! Você tem {n} itens.');
  assert.equal(t('test.hello', { name: 0, n: '' }), 'Olá, 0! Você tem  itens.');
  registerCatalog('pt-BR', ptBR);
});

test('the active locale is used, falls back per key to pt-BR, and an unsupported tag keeps pt-BR', () => {
  registerCatalog('en', { 'auth.login.title': 'Sign in' });
  assert.equal(setLocale('en'), 'en');
  assert.equal(getLocale(), 'en');
  assert.equal(t('auth.login.title'), 'Sign in');
  assert.equal(t('auth.register.title'), 'Criar conta', 'a key missing in en comes from pt-BR');
  assert.equal(setLocale('fr'), 'pt-BR');
  assert.equal(setLocale(undefined), 'pt-BR');
  assert.equal(t('auth.login.title'), 'Entrar');
  registerCatalog('en', undefined);
});

test('tn picks the plural category of the active locale and fills {count}', () => {
  registerCatalog('pt-BR', { ...ptBR, 'test.rev.one': '{count} revisão', 'test.rev.other': '{count} revisões', 'test.solo.other': '{count} itens' });
  assert.equal(tn('test.rev', 1), '1 revisão');
  assert.equal(tn('test.rev', 0), '0 revisão', 'pt-BR counts 0 as singular (Intl.PluralRules)');
  assert.equal(tn('test.rev', 5), '5 revisões');
  assert.equal(tn('test.solo', 1), '1 itens', 'a missing .one falls back to .other');
  registerCatalog('pt-BR', ptBR);
});

test('every literal key used as t(...) or tn(...) in src/ exists in the pt-BR catalog (a missing key is a visible bug)', () => {
  const files = execFileSync('git', ['ls-files', 'src'], { cwd: root, encoding: 'utf8' }).split('\n').filter((f) => f.endsWith('.js') && !f.startsWith('src/i18n/'));
  const missing = [];
  let calls = 0;
  for (const f of files) {
    const text = readFileSync(join(root, f), 'utf8');
    for (const m of text.matchAll(/\btn?\(\s*(['"])([A-Za-z0-9_.-]+)\1/g)) {
      const key = m[2];
      calls += 1;
      if (!has(key) && !has(`${key}.other`)) missing.push(`${f}: ${key}`);
    }
  }
  assert.deepEqual(missing, []);
  assert.ok(calls >= 1, 'the scan must find at least the existing t() call(s); otherwise this test checks nothing');
});

test('catalog keys follow area.what.detail and no value is empty or mojibake', () => {
  for (const [key, value] of Object.entries(ptBR)) {
    assert.match(key, /^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9_-]+)+$/, key);
    assert.ok(typeof value === 'string' && value.trim() !== '', `${key} is empty`);
    // escapes, not the characters: the repository's mojibake guard (scripts/text-integrity.mjs) would flag the literals themselves
    assert.doesNotMatch(value, MOJIBAKE, `${key} looks like mojibake`);
  }
});
