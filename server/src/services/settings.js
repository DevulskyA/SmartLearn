import { REVIEW_DAY_OFFSETS } from '../../../shared/review-schedule.js';

export class SettingsError extends Error {
  constructor(code, message, field) {
    super(message);
    this.code = code;
    if (field) this.field = field;
  }
}

export const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

function toDto(row) {
  return {
    timezone: row.timezone,
    reviewSchedule: JSON.parse(row.review_schedule),
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
  return { timezone: DEFAULT_TIMEZONE, reviewSchedule: [...REVIEW_DAY_OFFSETS], updatedAt: null };
}

const IANA_TIMEZONE_PATTERN = /^[A-Za-z_]+\/[A-Za-z_]+$/;

/**
 * Only `timezone` is user-editable. design.md/tasks.md are explicit that
 * the fixed review schedule is a product decision, not a per-account
 * preference — there is deliberately no field here to change it, so an
 * account settings edit can never be read as consent to adaptive
 * rescheduling.
 */
export function updateTimezone(db, userId, timezone) {
  if (typeof timezone !== 'string' || !IANA_TIMEZONE_PATTERN.test(timezone)) {
    throw new SettingsError('VALIDATION_FAILED', 'timezone deve ser um identificador IANA válido (ex.: America/Sao_Paulo).', 'timezone');
  }
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: timezone });
  } catch {
    throw new SettingsError('VALIDATION_FAILED', 'timezone não é reconhecido pelo runtime.', 'timezone');
  }

  const now = new Date().toISOString();
  const scheduleJson = JSON.stringify(REVIEW_DAY_OFFSETS);
  db.prepare(`
    INSERT INTO user_settings (user_id, timezone, review_schedule, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET timezone = excluded.timezone, updated_at = excluded.updated_at
  `).run(userId, timezone, scheduleJson, now);

  return get(db, userId);
}
