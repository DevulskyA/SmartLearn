// Locale-aware formatting for the interface. Everything here follows the ACTIVE locale (setLocale in ./index.js), so no call site
// names a language. With pt-BR active the output is exactly what the hard-coded "pt-BR" calls produced before.
import { getLocale } from './index.js';

const asDate = (value) => (value instanceof Date ? value : new Date(value));

/** Intl.DateTimeFormat in the active locale. `value` is a Date, a timestamp or anything `new Date()` accepts. */
export function formatDate(value, options) {
  return new Intl.DateTimeFormat(getLocale(), options).format(asDate(value));
}

/** Intl.NumberFormat in the active locale. */
export function formatNumber(value, options) {
  return new Intl.NumberFormat(getLocale(), options).format(value);
}

/** A decimal with exactly `digits` fraction digits in the active locale ("85,5" in pt-BR); `{ trim: true }` drops a trailing zero fraction ("85"). */
export function formatDecimal(value, digits = 1, { trim = false } = {}) {
  // Round exactly as toFixed always did (Intl alone breaks ties differently: 0.15 -> "0,2" against toFixed's "0,1"), then only localize.
  return formatNumber(Number(Number(value).toFixed(digits)), { minimumFractionDigits: trim ? 0 : digits, maximumFractionDigits: digits });
}

/** Ordering for DISPLAY (lists the student reads): follows the active locale. */
export function compareText(a, b, options) {
  return String(a).localeCompare(String(b), getLocale(), options);
}

/**
 * Identity of a NAME (is "Cardiologia" the same subject as "cardiología"?): accents matter, case does not. Deliberately independent
 * of the interface language, so changing the language never changes which names collide.
 */
export function sameName(a, b) {
  return String(a).localeCompare(String(b), 'und', { sensitivity: 'accent' }) === 0;
}
