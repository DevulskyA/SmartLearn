import * as imports from '../services/imports.js';

function handleError(err, reply) {
  if (err instanceof imports.ImportError) {
    const statusByCode = {
      INVALID_SOURCE: 400,
      NOT_FOUND: 404,
      PREVIEW_EXPIRED: 410,
      PREVIEW_TAMPERED: 409,
      IMPORT_HAS_CONFLICTS: 409,
      IMPORT_TOO_LARGE: 413,
      IMPORT_INTEGRITY_ERROR: 500,
    };
    reply.status(statusByCode[err.code] ?? 400);
    return { error: { code: err.code, message: err.message, details: err.details } };
  }
  throw err; // let the domain envelope's error handler classify unexpected errors
}

export function registerImportRoutes(app, db) {
  app.post('/imports/preview', {
    schema: {
      body: {
        type: 'object',
        required: ['rawSource'],
        properties: {
          rawSource: { type: 'object' },
        },
      },
    },
  }, async (request, reply) => {
    try {
      return { preview: imports.createPreview(db, request.actor.userId, request.body.rawSource) };
    } catch (err) { return handleError(err, reply); }
  });

  app.get('/imports/:id', {
    schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },
  }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try {
      return { preview: imports.getPreview(db, request.actor.userId, id) };
    } catch (err) { return handleError(err, reply); }
  });

  app.post('/imports/:id/commit', {
    schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },
  }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try {
      return { commit: imports.commitImport(db, request.actor.userId, id) };
    } catch (err) { return handleError(err, reply); }
  });
}
