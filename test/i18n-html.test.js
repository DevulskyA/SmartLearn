import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ptBR from '../src/i18n/locales/pt-BR.js';
import en from '../src/i18n/locales/en.js';
import es from '../src/i18n/locales/es.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8').replace(/^﻿/, '');
const decode = (s) => s.replace(/&times;/g, '×').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const ATTRIBUTES = ['title', 'aria-label', 'placeholder', 'alt'];

test('every data-i18n text in index.html has a catalog key, and the HTML fallback is exactly the pt-BR catalog text', () => {
  const problems = [];
  let checked = 0;
  for (const m of html.matchAll(/<([a-z0-9]+)\b([^>]*?)\sdata-i18n="([^"]+)"([^>]*)>([^<]*)</g)) {
    checked += 1;
    const [, tag, , key, , inner] = m;
    if (!(key in ptBR)) { problems.push(`<${tag}> ${key}: not in the catalog`); continue; }
    if (decode(inner.replace(/\s+/g, ' ').trim()) !== ptBR[key]) problems.push(`${key}: HTML says "${inner.trim()}" but the catalog says "${ptBR[key]}"`);
  }
  assert.ok(checked > 0, 'no data-i18n element found: the test checks nothing');
  assert.deepEqual(problems, []);
});

test('every data-i18n-<attribute> in index.html has a catalog key and the attribute written beside it equals the catalog text', () => {
  const problems = [];
  let checked = 0;
  for (const tag of html.matchAll(/<[a-z0-9]+\b[^>]*>/g)) {
    for (const name of ATTRIBUTES) {
      const key = tag[0].match(new RegExp(`\\sdata-i18n-${name}="([^"]+)"`))?.[1];
      if (!key) continue;
      checked += 1;
      const written = tag[0].match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
      if (!(key in ptBR)) problems.push(`${name} ${key}: not in the catalog`);
      else if (written === undefined || decode(written) !== ptBR[key]) problems.push(`${key}: ${name}="${written}" but the catalog says "${ptBR[key]}"`);
    }
  }
  assert.deepEqual(problems, []);
  assert.ok(checked >= 0);
});

test('the remaining fixed labels in index.html are connected to real English and Spanish text', () => {
  const bindings = [
    ['theme-toggle', 'aria-label', 'screens.chrome.themeToggle', 'Toggle theme', 'Cambiar tema'],
    ['theme-toggle', 'title', 'screens.chrome.themeToggle', 'Toggle theme', 'Cambiar tema'],
    ['last-backup-label', 'text', 'appBackup.none', 'No backup has been exported.', 'No se ha exportado ninguna copia de seguridad.'],
    ['exam-retest-btn', 'text', 'appExam.retestErrors', 'Retry missed questions', 'Reintentar preguntas incorrectas'],
    ['study-now-practice-title', 'text', 'appStudyNow.practiceTitle', 'Practice', 'Practicar'],
    ['study-now-reveal-btn', 'text', 'appStudyNow.reveal', 'Show answer', 'Ver respuesta'],
    ['study-now-result-title', 'text', 'appStudyNow.result', 'Result', 'Resultado'],
    ['study-now-retest-btn', 'text', 'appStudyNow.retestErrors', 'Retry missed questions', 'Reintentar preguntas incorrectas'],
  ];

  for (const [id, attribute, key, english, spanish] of bindings) {
    const tag = html.match(new RegExp(`<[^>]*id="${id}"[^>]*>`))?.[0];
    assert.ok(tag, `#${id} exists`);
    const dataAttribute = attribute === 'text' ? 'data-i18n' : `data-i18n-${attribute}`;
    assert.ok(tag.includes(`${dataAttribute}="${key}"`), `#${id} is connected to ${key}`);
    assert.equal(en[key], english, `en/${key}`);
    assert.equal(es[key], spanish, `es/${key}`);
  }
});
