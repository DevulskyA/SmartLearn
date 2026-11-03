import { REVIEW_DAY_OFFSETS } from '../../../shared/review-schedule.js';
import { DEFAULT_LOCALE, resolveSupportedLocale, localeFromHint } from '../../../shared/locales.js';

export class SettingsError extends Error {
  constructor(code, message, field) {
    super(message);
    this.code = code;
    if (field) this.field = field;
  }
}

export const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

/**
 * `uiLocale` / `generationLocale` are what the student chose (null = not chosen yet); the `effective*` fields are what the
 * app uses meanwhile. They are independent: until generationLocale is initialized (first generation) it mirrors the
 * interface language, and from then on it never follows it again.
 */
function languageFields(uiLocale, generationLocale) {
  const effectiveUiLocale = uiLocale ?? DEFAULT_LOCALE;
  return { uiLocale, generationLocale, effectiveUiLocale, effectiveGenerationLocale: generationLocale ?? effectiveUiLocale };
}

function toDto(row) {
  return {
    timezone: row.timezone,
    reviewSchedule: JSON.parse(row.review_schedule),
    ...languageFields(row.ui_locale ?? null, row.generation_locale ?? null),
    updatedAt: row.updated_at,
  };
}

/**
 * A row only exists once a user has explicitly touched settings — reading
 * before that returns the real fixed defaults without fabricating a DB
 * write on a plain GET. reviews.js's agenda() also reads through here so
 * "default timezone" has exactly one source of truth.
 */
export function get(db, userId) {
  const row = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId);
  if (row) return toDto(row);
  return { timezone: DEFAULT_TIMEZONE, reviewSchedule: [...REVIEW_DAY_OFFSETS], ...languageFields(null, null), updatedAt: null };
}

const IANA_TIMEZONE_PATTERN = /^[A-Za-z_]+\/[A-Za-z_]+$/;

/** The single timezone rule: used by the settings edit and by a logical-backup restore. */
export function assertValidTimezone(timezone) {
  if (typeof timezone !== 'string' || !IANA_TIMEZONE_PATTERN.test(timezone)) {
    throw new SettingsError('VALIDATION_FAILED', 'timezone deve ser um identificador IANA válido (ex.: America/Sao_Paulo).', 'timezone');
  }
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: timezone });
  } catch {
    throw new SettingsError('VALIDATION_FAILED', 'timezone não é reconhecido pelo runtime.', 'timezone');
  }
}

/**
 * Only `timezone` is user-editable. design.md/tasks.md are explicit that
 * the fixed review schedule is a product decision, not a per-account
 * preference — there is deliberately no field here to change it, so an
 * account settings edit can never be read as consent to adaptive
 * rescheduling.
 */
export function updateTimezone(db, userId, timezone) {
  assertValidTimezone(timezone);

  const now = new Date().toISOString();
  const scheduleJson = JSON.stringify(REVIEW_DAY_OFFSETS);
  db.prepare(`
    INSERT INTO user_settings (user_id, timezone, review_schedule, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET timezone = excluded.timezone, updated_at = excluded.updated_at
  `).run(userId, timezone, scheduleJson, now);

  return get(db, userId);
}

const LANGUAGE_FIELDS = { uiLocale: 'ui_locale', generationLocale: 'generation_locale' };

/**
 * An EXPLICIT change of the interface language and/or the content language, each independently. Only the fields given are
 * touched; an unsupported locale is refused (never replaced by a near one). This is the ONLY way generationLocale changes
 * after it was initialized.
 */
export function updateLanguage(db, userId, input = {}) {
  const given = Object.keys(LANGUAGE_FIELDS).filter((k) => input[k] !== undefined);
  if (given.length === 0) throw new SettingsError('VALIDATION_FAILED', 'Informe uiLocale ou generationLocale.');
  const values = {};
  for (const key of given) {
    const locale = resolveSupportedLocale(input[key]);
    if (!locale) throw new SettingsError('VALIDATION_FAILED', `Idioma não suportado em ${key}.`, key);
    values[LANGUAGE_FIELDS[key]] = locale;
  }
  const now = new Date().toISOString();
  const columns = Object.keys(values);
  db.prepare(`
    INSERT INTO user_settings (user_id, timezone, review_schedule, updated_at, ${columns.join(', ')})
    VALUES (?, ?, ?, ?, ${columns.map(() => '?').join(', ')})
    ON CONFLICT(user_id) DO UPDATE SET updated_at = excluded.updated_at, ${columns.map((c) => `${c} = excluded.${c}`).join(', ')}
  `).run(userId, DEFAULT_TIMEZONE, JSON.stringify(REVIEW_DAY_OFFSETS), now, ...columns.map((c) => values[c]));
  return get(db, userId);
}

/**
 * The language new content is generated in. Initialized ONCE, at the first generation, from the best information available
 * (the student's interface language if chosen, else the hint — system locale / Accept-Language —, else the default); from
 * then on every call returns the stored value and ignores the hint: importing a document in another language, changing the
 * interface language or the system region never moves it. This is the only automatic write to generationLocale.
 */
export function ensureGenerationLocale(db, userId, hint) {
  const row = db.prepare('SELECT ui_locale, generation_locale FROM user_settings WHERE user_id = ?').get(userId);
  if (row?.generation_locale) return row.generation_locale;
  const chosen = row?.ui_locale ?? localeFromHint(hint) ?? DEFAULT_LOCALE;
  db.prepare(`
    INSERT INTO user_settings (user_id, timezone, review_schedule, updated_at, generation_locale)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET generation_locale = COALESCE(user_settings.generation_locale, excluded.generation_locale)
  `).run(userId, DEFAULT_TIMEZONE, JSON.stringify(REVIEW_DAY_OFFSETS), new Date().toISOString(), chosen);
  return db.prepare('SELECT generation_locale FROM user_settings WHERE user_id = ?').get(userId).generation_locale;
}
