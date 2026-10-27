import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setLocale } from '../src/i18n/index.js';
import { formatDate, formatNumber, formatDecimal, compareText, sameName } from '../src/i18n/format.js';

afterEach(() => { setLocale('pt-BR'); });

// With pt-BR active, every formatter must give exactly what the former hard-coded "pt-BR" calls gave.
test('pt-BR output equals the direct Intl pt-BR calls it replaces', () => {
  const d = new Date('2026-10-16T15:30:00Z');
  for (const options of [{ dateStyle: 'short', timeStyle: 'short' }, { dateStyle: 'medium', timeStyle: 'short' }, { weekday: 'long', day: '2-digit', month: 'long' }, { month: 'short' }]) {
    assert.equal(formatDate(d, { ...options, timeZone: 'UTC' }), new Intl.DateTimeFormat('pt-BR', { ...options, timeZone: 'UTC' }).format(d));
  }
  assert.equal(formatNumber(1234567.5), new Intl.NumberFormat('pt-BR').format(1234567.5));
  assert.equal(formatNumber(12544), '12.544');
});

test('the active locale changes the output; formatters accept Date, timestamp and ISO string', () => {
  const iso = '2026-10-16T12:00:00Z';
  const opts = { month: 'long', timeZone: 'UTC' };
  assert.equal(formatDate(iso, opts), 'outubro');
  setLocale('en');
  assert.equal(formatDate(iso, opts), 'October');
  assert.equal(formatDate(new Date(iso), opts), 'October');
  assert.equal(formatDate(Date.parse(iso), opts), 'October');
  assert.equal(formatNumber(12544), '12,544');
  setLocale('es');
  assert.equal(formatDate(iso, opts), 'octubre');
});

test('compareText orders by the active locale; sameName ignores case, keeps accents, and does not depend on the language', () => {
  assert.ok(compareText('árvore', 'zebra') < 0);
  assert.equal(compareText('a', 'A', { sensitivity: 'base' }), 0);
  assert.equal(sameName('Cardiologia', 'cardiologia'), true);
  assert.equal(sameName('Cardiologia', 'Cardiología'), false);
  setLocale('en');
  assert.equal(sameName('Cardiologia', 'cardiologia'), true);
  assert.equal(sameName('Cardiologia', 'Cardiología'), false);
});

// The old call sites wrote `x.toFixed(1).replace(".", ",")`. formatDecimal must give the SAME text for pt-BR, including the
// rounding of ties (0.05, 0.15, 2.25 ...), so that moving to the locale-aware helper changes nothing the student reads.
test('formatDecimal equals toFixed(n)+comma for pt-BR over a grid that includes rounding ties; no thousands separator in 0-100 percents', () => {
  const legacy = (x, n) => x.toFixed(n).replace('.', ',');
  const values = [];
  for (let i = 0; i <= 2000; i += 1) values.push(i / 20); // 0, 0.05, 0.1 ... 100 (many binary ties)
  values.push(33.333333, 66.666667, 71.45, 71.55, 99.95, 0.04999, 12.25, 12.35);
  for (const v of values) assert.equal(formatDecimal(v, 1), legacy(v, 1), `value ${v}`);
  for (const v of [0, 5, 50, 100]) assert.equal(formatDecimal(v, 1), legacy(v, 1)); // keeps the ",0"
});

test('formatDecimal follows the active locale (en uses a point); trimmed form drops a ",0"', () => {
  assert.equal(formatDecimal(85.5, 1), '85,5');
  setLocale('en');
  assert.equal(formatDecimal(85.5, 1), '85.5');
  setLocale('pt-BR');
  assert.equal(formatDecimal(85, 1, { trim: true }), '85');
  assert.equal(formatDecimal(85.04, 1, { trim: true }), '85');
  assert.equal(formatDecimal(85.5, 1, { trim: true }), '85,5');
});
