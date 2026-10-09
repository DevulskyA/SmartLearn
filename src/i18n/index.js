// T11: minimal i18n catalog reader. pt-BR is the only/default locale for
// V1 (design.md §10). This is intentionally small — a full extraction of
// existing hardcoded strings is deferred to T47, per the plan's own scope
// (do not do i18n's full scope here, just enough for the new account UI).
import ptBR from './locales/pt-BR.js';

const catalogs = { 'pt-BR': ptBR };
const DEFAULT_LOCALE = 'pt-BR';

export function t(key, locale = DEFAULT_LOCALE) {
  const catalog = catalogs[locale] ?? catalogs[DEFAULT_LOCALE];
  return catalog[key] ?? key;
}
