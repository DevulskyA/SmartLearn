import { config } from '../config.js';
import * as proposals from '../services/content-proposals.js';

function handleError(err, reply) {
  if (err instanceof proposals.ProposalError) {
    const statusByCode = { VALIDATION_FAILED: 400, NOT_FOUND: 404, NOT_EXTRACTED: 409, HAS_ACCEPTED_CONTENT: 409 };
    reply.status(statusByCode[err.code] ?? 400);
    return { error: { code: err.code, field: err.field, message: err.message } };
  }
  throw err;
}

export function registerContentProposalRoutes(app, db) {
  app.post('/sources/:id/proposals', {
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      body: { type: 'object', properties: { maxPagesPerChunk: { type: 'integer' } } },
    },
  }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try {
      // chunks close before the model input limit, so every proposal can actually become a draft
      const opts = { maxCharsPerChunk: Math.floor(config.aiMaxInputChars * 0.9) };
      if (request.body?.maxPagesPerChunk) opts.maxPagesPerChunk = request.body.maxPagesPerChunk;
      reply.status(201);
      return { proposals: proposals.chunkSource(db, request.actor.userId, id, opts) };
    } catch (err) { return handleError(err, reply); }
  });

  app.get('/sources/:id/proposals', {
    schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },
  }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try {
      return { proposals: proposals.listProposals(db, request.actor.userId, id) };
    } catch (err) { return handleError(err, reply); }
  });

  app.get('/proposals/:id', {
    schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },
  }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try {
      return { proposal: proposals.getProposal(db, request.actor.userId, id) };
    } catch (err) { return handleError(err, reply); }
  });

  app.patch('/proposals/:id', {
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      body: { type: 'object', required: ['title'], properties: { title: { type: 'string' } } },
    },
  }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try {
      return { proposal: proposals.renameProposal(db, request.actor.userId, id, request.body.title) };
    } catch (err) { return handleError(err, reply); }
  });
}
