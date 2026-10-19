import * as assets from '../services/visual-assets.js';

const STATUS = {
  VALIDATION_FAILED: 400,
  UNSUPPORTED_FILE_TYPE: 400,
  FILE_TOO_LARGE: 413,
  QUOTA_EXCEEDED: 413,
  NOT_FOUND: 404,
  ASSET_IN_USE: 409,
  ASSET_FILE_MISSING: 409,
  ASSET_INTEGRITY_FAILED: 409,
};

function handleError(err, reply) {
  if (err instanceof assets.VisualAssetError) {
    reply.status(STATUS[err.code] ?? 400);
    return { error: { code: err.code, field: err.field, message: err.message, ...(err.references ? { references: err.references } : {}) } };
  }
  throw err;
}

const idParams = { type: 'object', required: ['id'], properties: { id: { type: 'string', maxLength: 64 } } };

export function registerVisualAssetRoutes(app, db, { mediaDir, limits = assets.DEFAULT_LIMITS } = {}) {
  // Multipart (the plugin stops reading at the size limit). The texts and the provenance travel in the query string, so the file part is
  // always first and nothing depends on the order of form fields. The owner is request.actor.userId, never a client-supplied value.
  app.post('/visual-assets', {
    schema: {
      querystring: {
        type: 'object',
        required: ['operationKey', 'alt'],
        properties: {
          operationKey: { type: 'string', minLength: 1, maxLength: 100 },
          alt: { type: 'string', minLength: 1, maxLength: assets.MAX_ALT * 2 },
          caption: { type: 'string', maxLength: assets.MAX_CAPTION * 2 },
          description: { type: 'string', maxLength: assets.MAX_DESCRIPTION * 2 },
          kind: { type: 'string', enum: ['STUDENT_IMAGE', 'PDF_CROP'] },
          sourceId: { type: 'integer' },
          pageIndex: { type: 'integer' },
          x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' },
          rotation: { type: 'integer' },
        },
      },
    },
  }, async (request, reply) => {
    let data;
    try {
      data = await request.file({ limits: { fileSize: limits.maxUploadBytes } });
    } catch {
      reply.status(400);
      return { error: { code: 'VALIDATION_FAILED', message: 'Falha ao ler o upload.' } };
    }
    if (!data) {
      reply.status(400);
      return { error: { code: 'VALIDATION_FAILED', field: 'file', message: 'Nenhuma imagem enviada.' } };
    }
    let buffer;
    try {
      buffer = await data.toBuffer();
    } catch (err) {
      if (err.code === 'FST_REQ_FILE_TOO_LARGE' || err.statusCode === 413) {
        reply.status(413);
        return { error: { code: 'FILE_TOO_LARGE', field: 'file' } };
      }
      throw err;
    }
    const q = request.query;
    try {
      const { asset, duplicate } = await assets.create(db, request.actor.userId, {
        buffer,
        alt: q.alt,
        caption: q.caption,
        description: q.description,
        operationKey: q.operationKey,
        kind: q.kind,
        crop: q.kind === 'PDF_CROP' ? { sourceId: q.sourceId, pageIndex: q.pageIndex, x: q.x, y: q.y, w: q.w, h: q.h, rotation: q.rotation } : undefined,
      }, { mediaDir, limits });
      reply.status(duplicate ? 200 : 201);
      return { asset, duplicate };
    } catch (err) { return handleError(err, reply); }
  });

  app.get('/visual-assets/:id', { schema: { params: idParams } }, async (request, reply) => {
    try {
      return { asset: assets.get(db, request.actor.userId, request.params.id) };
    } catch (err) { return handleError(err, reply); }
  });

  app.patch('/visual-assets/:id', {
    schema: {
      params: idParams,
      body: { type: 'object', additionalProperties: false, properties: { alt: { type: 'string', maxLength: 600 }, caption: { type: 'string', maxLength: 600 }, description: { type: ['string', 'null'], maxLength: 4000 } } },
    },
  }, async (request, reply) => {
    try {
      return { asset: assets.updateTexts(db, request.actor.userId, request.params.id, request.body) };
    } catch (err) { return handleError(err, reply); }
  });

  // The image itself: owner only, served as a bare image (no sniffing, no scripts), cached privately by the student's own browser only.
  app.get('/visual-assets/:id/file', { schema: { params: idParams } }, async (request, reply) => {
    try {
      const { mime, bytes } = assets.readFile(db, request.actor.userId, request.params.id, mediaDir);
      reply
        .header('content-type', mime)
        .header('cache-control', 'private, no-cache')
        .header('x-content-type-options', 'nosniff')
        .header('content-security-policy', "default-src 'none'; sandbox");
      return reply.send(bytes);
    } catch (err) { return handleError(err, reply); }
  });

  app.delete('/visual-assets/:id', { schema: { params: idParams } }, async (request, reply) => {
    try {
      assets.remove(db, request.actor.userId, request.params.id, mediaDir);
      reply.status(204);
      return null;
    } catch (err) { return handleError(err, reply); }
  });
}
