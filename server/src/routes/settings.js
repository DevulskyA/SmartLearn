import * as settings from '../services/settings.js';
import { setReuseConsent, setSourceReuseBasis, reuseOverview, REUSE_BASES } from '../services/shared-reuse.js';

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

  // Reuse of reviewed AI content between students: OFF until the student turns it on; turning it off withdraws what they offered.
  // Also lists the student's sources with the basis they declared for each (legal eligibility: the opt-in alone never shares a work).
  app.get('/settings/reuse', async (request) => ({ reuse: reuseOverview(db, request.actor.userId) }));

  app.put('/settings/reuse/sources/:id', {
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      body: { type: 'object', required: ['basis'], additionalProperties: false, properties: { basis: { type: ['string', 'null'], enum: [...REUSE_BASES, null] } } },
    },
  }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    const source = setSourceReuseBasis(db, request.actor.userId, id, request.body.basis);
    if (!source) { reply.status(404); return { error: { code: 'NOT_FOUND' } }; }
    return { source };
  });

  app.put('/settings/reuse', {
    schema: { body: { type: 'object', required: ['granted'], additionalProperties: false, properties: { granted: { type: 'boolean' } } } },
  }, async (request) => ({ reuse: setReuseConsent(db, request.actor.userId, request.body.granted) }));

  app.patch('/settings', {
    schema: { body: { type: 'object', properties: { timezone: { type: 'string', maxLength: 100 }, uiLocale: { type: 'string', maxLength: 20 }, generationLocale: { type: 'string', maxLength: 20 } } } },
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
