import { config } from '../config.js';
import * as proposals from '../services/content-proposals.js';
import { generationState } from '../services/generated-drafts.js';
import { getPageNumbering } from '../services/page-numbering.js';

function handleError(err, reply) {
  if (err instanceof proposals.ProposalError) {
    const statusByCode = { VALIDATION_FAILED: 400, NOT_FOUND: 404, NOT_EXTRACTED: 409, HAS_ACCEPTED_CONTENT: 409, HAS_EXISTING_DRAFT: 409, GENERATION_IN_PROGRESS: 409 };
    reply.status(statusByCode[err.code] ?? 400);
    return { error: { code: err.code, field: err.field, message: err.message, msg: err.msg } };
  }
  throw err;
}

export function registerContentProposalRoutes(app, db, { sourcesDir = config.sourcesDir } = {}) {
  // How the page numbers of this source work: the numbers printed in the book (when the PDF headers/footers show them) or the PDF's own.
  app.get('/sources/:id/page-numbering', {
    schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },
  }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    return { numbering: await getPageNumbering(db, request.actor.userId, id, { sourcesDir }) };
  });

  app.post('/sources/:id/proposals', {
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      body: { type: 'object', properties: { maxPagesPerChunk: { type: 'integer', minimum: 1, maximum: 100 }, discardDrafts: { type: 'boolean' } } },
    },
  }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try {
      // chunks close before the model input limit, so every proposal can actually become a draft
      const opts = { maxCharsPerChunk: Math.floor(config.aiMaxInputChars * 0.9) };
      if (request.body?.maxPagesPerChunk) opts.maxPagesPerChunk = request.body.maxPagesPerChunk;
      if (request.body?.discardDrafts === true) opts.discardDrafts = true;
      reply.status(201);
      return { proposals: proposals.chunkSource(db, request.actor.userId, id, opts) };
    } catch (err) { return handleError(err, reply); }
  });

  // "O que você quer estudar?": locate the sections of the document that match a topic (creates nothing).
  app.get('/sources/:id/topics', {
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      querystring: { type: 'object', required: ['q'], properties: { q: { type: 'string', maxLength: 200 } } },
    },
  }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try {
      return { candidates: proposals.searchTopics(db, request.actor.userId, id, request.query.q) };
    } catch (err) { return handleError(err, reply); }
  });

  // The student approves ONE scope (a located section or an explicit page/offset range): the only text a provider may receive.
  app.post('/sources/:id/scopes', {
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      body: {
        type: 'object',
        properties: {
          ordinal: { type: 'integer', minimum: 0, maximum: 1000000 },
          title: { type: 'string', maxLength: 300 },
          topic: { type: 'string', maxLength: 300 },
          range: {
            type: 'object',
            required: ['pageStart', 'pageEnd'],
            // pages start at 1 and no book has 100000 of them; offsets are character positions inside a page, never negative
            properties: {
              pageStart: { type: 'integer', minimum: 1, maximum: 100000 },
              pageEnd: { type: 'integer', minimum: 1, maximum: 100000 },
              startOffset: { type: 'integer', minimum: 0, maximum: 10000000 },
              endOffset: { type: 'integer', minimum: 0, maximum: 10000000 },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try {
      reply.status(201);
      // the page numbers typed are the ones printed in the book when the document has them, else the PDF's own
      const numbering = request.body?.range ? await getPageNumbering(db, request.actor.userId, id, { sourcesDir }) : null;
      // a range with more text than one summary can take becomes consecutive parts that each fit (same 0.9 margin as chunkSource)
      const { parts, ...proposal } = proposals.approveScope(db, request.actor.userId, id, request.body ?? {}, { maxCharsPerChunk: Math.floor(config.aiMaxInputChars * 0.9), numbering });
      return parts ? { proposal, parts } : { proposal };
    } catch (err) { return handleError(err, reply); }
  });

  app.get('/sources/:id/proposals', {
    schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },
  }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try {
      return { proposals: proposals.listProposals(db, request.actor.userId, id).map((p) => ({ ...p, generationState: generationState(db, request.actor.userId, p.id) })) };
    } catch (err) { return handleError(err, reply); }
  });

  app.get('/proposals/:id', {
    schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },
  }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) { reply.status(400); return { error: { code: 'VALIDATION_FAILED' } }; }
    try {
      const proposal = proposals.getProposal(db, request.actor.userId, id);
      return { proposal: { ...proposal, generationState: generationState(db, request.actor.userId, proposal.id) } };
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
