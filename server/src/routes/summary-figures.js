import * as figures from '../services/summary-figures.js';

const STATUS = { VALIDATION_FAILED: 400, UNSUPPORTED_FILE_TYPE: 400, FILE_TOO_LARGE: 413, QUOTA_EXCEEDED: 413, NOT_FOUND: 404 };

function handleError(err, reply) {
  if (err instanceof figures.SummaryFigureError) {
    reply.status(STATUS[err.code] ?? 400);
    return { error: { code: err.code, field: err.field, message: err.message } };
  }
  throw err;
}

export function registerSummaryFigureRoutes(app, db) {
  // Multipart like /sources (the plugin enforces the size limit while reading). The alt text travels in the query string: it is required
  // (accessibility), short, and not sensitive, and it keeps the file part first in the form.
  app.post('/summary-figures', {
    schema: { querystring: { type: 'object', required: ['alt'], properties: { alt: { type: 'string', minLength: 1, maxLength: figures.MAX_ALT_LENGTH * 2 } } } },
  }, async (request, reply) => {
    let data;
    try {
      data = await request.file({ limits: { fileSize: figures.MAX_FIGURE_BYTES } });
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
    try {
      const figure = figures.create(db, request.actor.userId, { buffer, alt: request.query.alt });
      reply.status(201);
      return { figure };
    } catch (err) { return handleError(err, reply); }
  });

  // The image itself, owner only. Served as a bare image: no sniffing, no scripts, never cached by shared caches.
  app.get('/summary-figures/:id', {
    schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },
  }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try {
      const { mime, bytes } = figures.read(db, request.actor.userId, id);
      reply
        .header('content-type', mime)
        .header('cache-control', 'private, max-age=3600')
        .header('x-content-type-options', 'nosniff')
        .header('content-security-policy', "default-src 'none'; sandbox");
      return reply.send(bytes);
    } catch (err) { return handleError(err, reply); }
  });
}
