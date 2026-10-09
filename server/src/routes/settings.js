import * as settings from '../services/settings.js';

function handleError(err, reply) {
  if (err instanceof settings.SettingsError) {
    reply.status(400);
    return { error: { code: err.code, field: err.field, message: err.message } };
  }
  throw err;
}

export function registerSettingsRoutes(app, db) {
  app.get('/settings', async (request) => {
    return { settings: settings.get(db, request.actor.userId) };
  });

  app.patch('/settings', {
    schema: { body: { type: 'object', properties: { timezone: { type: 'string' }, uiLocale: { type: 'string' }, generationLocale: { type: 'string' } } } },
  }, async (request, reply) => {
    const { timezone, uiLocale, generationLocale } = request.body;
    const hasLanguage = uiLocale !== undefined || generationLocale !== undefined;
    if (timezone === undefined && !hasLanguage) {
      reply.status(400);
      return { error: { code: 'VALIDATION_FAILED', message: 'No recognized field to update.' } };
    }
    try {
      // One transaction: a refused language leaves a timezone sent in the same request unchanged.
      return {
        settings: db.transaction(() => {
          let current = null;
          if (timezone !== undefined) current = settings.updateTimezone(db, request.actor.userId, timezone);
          if (hasLanguage) current = settings.updateLanguage(db, request.actor.userId, { uiLocale, generationLocale });
          return current;
        })(),
      };
    } catch (err) { return handleError(err, reply); }
  });
}
