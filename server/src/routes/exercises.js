import * as exercises from '../services/exercises.js';

function handleError(err, reply) {
  if (err instanceof exercises.ExerciseError) {
    const statusByCode = { VALIDATION_FAILED: 400, NOT_FOUND: 404 };
    reply.status(statusByCode[err.code] ?? 400);
    return { error: { code: err.code, field: err.field, message: err.message } };
  }
  throw err;
}

const EXERCISE_BODY_SCHEMA = {
  type: 'object',
  properties: {
    question: { type: 'string' },
    answer: { type: 'string' },
    hint: { type: 'string' },
    provenance: { type: 'string', enum: ['MANUAL', 'SOURCE', 'AI_GENERATED'] },
  },
};

export function registerExerciseRoutes(app, db) {
  app.get('/learning-units/:unitId/exercises', {
    schema: { params: { type: 'object', required: ['unitId'], properties: { unitId: { type: 'string' } } } },
  }, async (request, reply) => {
    const unitId = Number(request.params.unitId);
    if (!Number.isInteger(unitId)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try {
      return { exercises: exercises.list(db, request.actor.userId, unitId) };
    } catch (err) { return handleError(err, reply); }
  });

  app.post('/learning-units/:unitId/exercises', {
    schema: {
      params: { type: 'object', required: ['unitId'], properties: { unitId: { type: 'string' } } },
      body: { ...EXERCISE_BODY_SCHEMA, required: ['question', 'provenance'] },
    },
  }, async (request, reply) => {
    const unitId = Number(request.params.unitId);
    if (!Number.isInteger(unitId)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try {
      reply.status(201);
      return { exercise: exercises.create(db, request.actor.userId, { unitId, ...request.body }) };
    } catch (err) { return handleError(err, reply); }
  });

  app.post('/learning-units/:unitId/exercises/reorder', {
    schema: {
      params: { type: 'object', required: ['unitId'], properties: { unitId: { type: 'string' } } },
      body: { type: 'object', required: ['orderedIds'], properties: { orderedIds: { type: 'array', items: { type: 'integer' } } } },
    },
  }, async (request, reply) => {
    const unitId = Number(request.params.unitId);
    if (!Number.isInteger(unitId)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try {
      return { exercises: exercises.reorder(db, request.actor.userId, unitId, request.body.orderedIds) };
    } catch (err) { return handleError(err, reply); }
  });

  app.get('/exercises/:id', {
    schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },
  }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try {
      return { exercise: exercises.getById(db, request.actor.userId, id) };
    } catch (err) { return handleError(err, reply); }
  });

  app.patch('/exercises/:id', {
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      body: { ...EXERCISE_BODY_SCHEMA, properties: { ...EXERCISE_BODY_SCHEMA.properties, isArchived: { type: 'boolean' } } },
    },
  }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try {
      if (request.body.isArchived === true) return { exercise: exercises.archive(db, request.actor.userId, id) };
      if (request.body.isArchived === false) return { exercise: exercises.reactivate(db, request.actor.userId, id) };
      if (request.body.question !== undefined) return { exercise: exercises.edit(db, request.actor.userId, id, request.body) };
      reply.status(400);
      return { error: { code: 'VALIDATION_FAILED', message: 'No recognized field to update.' } };
    } catch (err) { return handleError(err, reply); }
  });
}
