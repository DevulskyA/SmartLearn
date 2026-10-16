// i18n catalog reader. pt-BR is the only translated locale in V1 (HG-13: es/en fall back to pt-BR until real translations exist),
// so a key is looked up in the active locale, then in pt-BR, and a key that exists nowhere is returned as itself (callers and
// tests can see it; nothing is invented).
//
//   t('auth.login.title')                         -> 'Entrar'
//   t('today.overdue', { count: 3 })              -> placeholders are written {count} in the catalog
//   tn('review.count', 3)                         -> picks 'review.count.one' / '.other' by Intl.PluralRules of the active locale
//   t('auth.login.title', 'pt-BR')                -> the older form: a locale string as the 2nd argument
//
// Keys are 'area.what.detail' and are literals at the call site, so scripts/scan-portuguese-i18n.mjs and the key test can find them.
import ptBR from './locales/pt-BR.js';
import { DEFAULT_LOCALE, resolveSupportedLocale } from '../../shared/locales.js';

const catalogs = { [DEFAULT_LOCALE]: ptBR };
let activeLocale = DEFAULT_LOCALE;

/** The locale the interface is shown in. An unsupported tag leaves the default in place. */
export function setLocale(tag) {
  activeLocale = resolveSupportedLocale(tag) ?? DEFAULT_LOCALE;
  return activeLocale;
}

export function getLocale() {
  return activeLocale;
}

/** Test seam: register or replace the catalog of a locale (a real es/en catalog arrives with HG-13). */
export function registerCatalog(locale, catalog) {
  catalogs[locale] = catalog;
}

function lookup(key, locale) {
  return catalogs[locale]?.[key] ?? catalogs[DEFAULT_LOCALE][key];
}

function fill(text, params) {
  if (!params) return text;
  // An unknown placeholder stays visible as written ({name}) instead of printing "undefined".
  return text.replace(/\{(\w+)\}/g, (whole, name) => (Object.hasOwn(params, name) ? String(params[name]) : whole));
}

export function has(key, locale = activeLocale) {
  return lookup(key, locale) !== undefined;
}

export function t(key, paramsOrLocale, maybeLocale) {
  const legacyLocale = typeof paramsOrLocale === 'string';
  const params = legacyLocale ? undefined : paramsOrLocale;
  const locale = legacyLocale ? paramsOrLocale : (maybeLocale ?? activeLocale);
  const text = lookup(key, locale);
  return text === undefined ? key : fill(text, params);
}

/** Plural form: `${key}.${category}` for the category Intl.PluralRules gives `count`, else `${key}.other`. `{count}` is filled in. */
export function tn(key, count, params, locale = activeLocale) {
  let category = 'other';
  try { category = new Intl.PluralRules(locale).select(count); } catch { /* unknown tag: 'other' */ }
  const chosen = has(`${key}.${category}`, locale) ? `${key}.${category}` : `${key}.other`;
  return t(chosen, { count, ...params }, locale);
}
