import * as priorities from '../services/priorities.js';

export function registerPriorityRoutes(app, db) {
  app.get('/priorities', {
    schema: { querystring: { type: 'object', properties: { date: { type: 'string' } } } },
  }, async (request, reply) => {
    try {
      return priorities.get(db, request.actor.userId, { date: request.query.date });
    } catch (err) {
      if (err instanceof priorities.PrioritiesError) {
        reply.status(400);
        return { error: { code: err.code, field: err.field, message: err.message } };
      }
      throw err;
    }
  });
}
