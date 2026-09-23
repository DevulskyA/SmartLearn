import { getSnapshotPage, AgendaSnapshotError } from '../services/agenda-snapshot.js';

export function registerAgendaSnapshotRoutes(app, db) {
  app.get('/agenda-snapshot', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          cursor: { type: 'string' },
          revision: { type: 'string' },
          limit: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { cursor, revision, limit } = request.query;
    let cursorId;
    if (cursor !== undefined) {
      cursorId = Number(cursor);
      if (!Number.isInteger(cursorId)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED', field: 'cursor' } }; }
    }
    try {
      return getSnapshotPage(db, request.actor.userId, { cursor: cursorId, revision, limit });
    } catch (err) {
      if (err instanceof AgendaSnapshotError) {
        reply.status(409);
        return { error: { code: err.code } };
      }
      throw err;
    }
  });
}
