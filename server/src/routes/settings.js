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
    schema: { body: { type: 'object', properties: { timezone: { type: 'string' } } } },
  }, async (request, reply) => {
    if (request.body.timezone === undefined) {
      reply.status(400);
      return { error: { code: 'VALIDATION_FAILED', message: 'No recognized field to update.' } };
    }
    try {
      return { settings: settings.updateTimezone(db, request.actor.userId, request.body.timezone) };
    } catch (err) { return handleError(err, reply); }
  });
}
