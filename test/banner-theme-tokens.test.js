import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// T-F13-12: the banners the app builds itself (offline, local backend, database) must take their colours from the theme
// tokens in CSS, so every theme reaches them; a fixed colour written in JS would not.

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('no source file styles a banner with a colour written in JavaScript', () => {
  for (const file of ['src/app.js', 'src/offline-ui.js']) {
    const source = read(file);
    assert.equal(/style\.cssText\s*=/.test(source), false, `${file} sets style.cssText`);
    assert.equal(/#92400e|#b91c1c/i.test(source), false, `${file} hard-codes a banner colour`);
  }
});

test('the banner classes exist and use the alert tokens of the theme', () => {
  const css = read('src/styles.css');
  const block = css.slice(css.indexOf('.app-banner {'), css.indexOf('.app-banner[hidden]'));
  assert.match(block, /background:\s*var\(--status-overdue-fill\)/);
  assert.match(block, /color:\s*var\(--status-overdue-text\)/);
  for (const cls of ['app-banner--connectivity', 'app-banner--fatal']) assert.ok(css.includes(`.${cls}`), `${cls} is styled`);
  assert.ok(read('src/offline-ui.js').includes('app-banner--connectivity'));
  assert.ok(read('src/app.js').includes('app-banner--fatal'));
});

test('no source file asks the student with the native window.confirm: every confirmation is the themed dialog', () => {
  for (const name of readdirSync(new URL('../src/', import.meta.url)).filter((f) => f.endsWith('.js'))) {
    assert.equal(/window\.confirm\(/.test(read(`src/${name}`)), false, `src/${name} calls window.confirm`);
  }
});
