import * as subjects from '../services/subjects.js';

function handleError(err, reply) {
  if (err instanceof subjects.SubjectError) {
    const statusByCode = {
      VALIDATION_FAILED: 400,
      NOT_FOUND: 404,
      SUBJECT_CONFLICT: 409,
      SUBJECT_NOT_EMPTY: 409,
    };
    reply.status(statusByCode[err.code] ?? 400);
    return { error: { code: err.code, message: err.message } };
  }
  throw err; // let the domain envelope's error handler classify unexpected errors
}

export function registerSubjectRoutes(app, db) {
  app.get('/subjects', async (request) => {
    return { subjects: subjects.list(db, request.actor.userId) };
  });

  app.post('/subjects', {
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
          color: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    try {
      return { subject: subjects.create(db, request.actor.userId, request.body) };
    } catch (err) { return handleError(err, reply); }
  });

  app.patch('/subjects/:id', {
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          color: { type: 'string' },
          isActive: { type: 'boolean' },
        },
      },
    },
  }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try {
      let result;
      if (request.body.name !== undefined) result = subjects.rename(db, request.actor.userId, id, request.body.name);
      if (request.body.color !== undefined) result = subjects.setColor(db, request.actor.userId, id, request.body.color);
      if (request.body.isActive === false) result = subjects.archive(db, request.actor.userId, id);
      if (request.body.isActive === true) result = subjects.reactivate(db, request.actor.userId, id);
      if (!result) { reply.status(400); return { error: { code: 'VALIDATION_FAILED', message: 'No recognized field to update.' } }; }
      return { subject: result };
    } catch (err) { return handleError(err, reply); }
  });

  app.post('/subjects/reorder', {
    schema: {
      body: { type: 'object', required: ['orderedIds'], properties: { orderedIds: { type: 'array', items: { type: 'integer' } } } },
    },
  }, async (request, reply) => {
    try {
      return { subjects: subjects.reorder(db, request.actor.userId, request.body.orderedIds) };
    } catch (err) { return handleError(err, reply); }
  });

  app.delete('/subjects/:id', {
    schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },
  }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try {
      subjects.deleteEmpty(db, request.actor.userId, id);
      reply.status(204);
      return null;
    } catch (err) { return handleError(err, reply); }
  });
}
