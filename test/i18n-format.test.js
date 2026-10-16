import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setLocale } from '../src/i18n/index.js';
import { formatDate, formatNumber, compareText, sameName } from '../src/i18n/format.js';

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
