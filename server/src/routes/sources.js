import * as sourceStorage from '../services/source-storage.js';
import { extractSource, SourceExtractionError } from '../services/source-extraction.js';
import { config } from '../config.js';

function handleError(err, reply) {
  if (err instanceof sourceStorage.SourceError || err instanceof SourceExtractionError) {
    const statusByCode = {
      VALIDATION_FAILED: 400,
      UNSUPPORTED_FILE_TYPE: 400,
      ENCRYPTED_FILE_REJECTED: 400,
      FILE_TOO_LARGE: 413,
      QUOTA_EXCEEDED: 413,
      NOT_FOUND: 404,
    };
    reply.status(statusByCode[err.code] ?? 400);
    return { error: { code: err.code, field: err.field, message: err.message } };
  }
  throw err;
}

export function registerSourceRoutes(app, db, { sourcesDir = config.sourcesDir, maxBytes = config.sourceMaxBytes, quotaBytes = config.sourceQuotaBytes, extractionDeadlineMs, extractionMemoryLimitMb } = {}) {
  app.get('/sources', async (request) => {
    return { sources: sourceStorage.list(db, request.actor.userId) };
  });

  app.get('/sources/:id', {
    schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },
  }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try {
      return { source: sourceStorage.getById(db, request.actor.userId, id) };
    } catch (err) { return handleError(err, reply); }
  });

  // Multipart, not JSON: no `schema.body` is declared, so AJV never sees
  // this route's body at all. The fastify-multipart plugin (registered on
  // this same /v1 context, see app.js) streams the part and enforces
  // `maxBytes` DURING the read, not after fully buffering an oversized
  // file — an over-limit upload aborts the stream and this handler never
  // reaches acceptUpload() with a full buffer. CSRF/origin checks already
  // ran in the domain envelope's preHandler hook before this executes,
  // exactly like every other mutating route.
  app.post('/sources', async (request, reply) => {
    let data;
    try {
      data = await request.file({ limits: { fileSize: maxBytes } });
    } catch (err) {
      reply.status(400);
      return { error: { code: 'VALIDATION_FAILED', message: 'Falha ao ler o upload.' } };
    }
    if (!data) {
      reply.status(400);
      return { error: { code: 'VALIDATION_FAILED', field: 'file', message: 'Nenhum arquivo enviado.' } };
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
      reply.status(201);
      return {
        source: sourceStorage.acceptUpload(db, request.actor.userId, {
          buffer,
          originalName: data.filename,
          contentType: data.mimetype,
          sourcesDir,
          maxBytes,
          quotaBytes,
        }),
      };
    } catch (err) { return handleError(err, reply); }
  });

  // Deliberately synchronous from the caller's point of view (awaits the
  // full bounded worker run, T35) — this route has no separate polling
  // status endpoint yet; a future large-scale UI can add one without
  // changing this contract, since the result is just read back from
  // `sources.extraction_status` either way.
  app.post('/sources/:id/extract', {
    schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },
  }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try {
      const options = { sourcesDir };
      if (extractionDeadlineMs !== undefined) options.deadlineMs = extractionDeadlineMs;
      if (extractionMemoryLimitMb !== undefined) options.memoryLimitMb = extractionMemoryLimitMb;
      return { extraction: await extractSource(db, request.actor.userId, id, options) };
    } catch (err) { return handleError(err, reply); }
  });
}
