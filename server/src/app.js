import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { validateMigrations } from './migrations.js';
import { applyDomainEnvelope } from './http-contract.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerSubjectRoutes } from './routes/subjects.js';
import { registerLearningUnitRoutes } from './routes/learning-units.js';
import { registerReviewRoutes } from './routes/reviews.js';
import { registerExerciseRoutes } from './routes/exercises.js';
import { registerEvidenceRoutes } from './routes/evidence.js';
import { registerSettingsRoutes } from './routes/settings.js';
import { registerBackupRoutes } from './routes/backup.js';
import { createSessionActorResolver } from './auth/resolve-actor.js';

const DEFAULT_MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));

export async function buildApp(db, migrationsDir = DEFAULT_MIGRATIONS_DIR, { isProduction = false, allowedOrigins = [], trustProxy = false, staticDir = null } = {}) {
  const app = Fastify({ logger: false, trustProxy });
  await app.register(fastifyCookie);
  // No wildcard credentialed CORS (design.md §3): exact configured origins
  // only, credentials enabled so the session cookie round-trips, and only
  // the headers/methods the API actually uses.
  await app.register(fastifyCors, {
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'X-Request-Id'],
  });

  app.get('/health/live', async () => {
    return { status: 'alive' };
  });

  app.get('/health/ready', async (request, reply) => {
    try {
      db.prepare('SELECT 1').get();

      const journalMode = db.pragma('journal_mode', { simple: true });
      if (journalMode !== 'wal') {
        reply.status(503);
        return { status: 'not ready', error: 'WAL not active' };
      }

      const fk = db.pragma('foreign_keys', { simple: true });
      if (fk !== 1) {
        reply.status(503);
        return { status: 'not ready', error: 'foreign_keys not active' };
      }

      validateMigrations(db, migrationsDir);
      return { status: 'ready' };
    } catch (err) {
      reply.status(503);
      return { status: 'not ready', error: err.message };
    }
  });

  // /v1 is a separate encapsulated Fastify context: its hooks (default-deny
  // actor, strict AJV, JSON-only errors) do not leak onto /health, and
  // /health's public minimal behavior does not leak into /v1.
  app.register(async (v1) => {
    applyDomainEnvelope(v1, {
      resolveActor: createSessionActorResolver(db, { isProduction }),
      allowedOrigins,
    });
    registerAuthRoutes(v1, db, { isProduction });
    registerSubjectRoutes(v1, db);
    registerLearningUnitRoutes(v1, db);
    registerReviewRoutes(v1, db);
    registerExerciseRoutes(v1, db);
    registerEvidenceRoutes(v1, db);
    registerSettingsRoutes(v1, db);
    registerBackupRoutes(v1, db);
  }, { prefix: '/v1' });

  // Explicit opt-in only (T21 "one origin" production remote mode) — every
  // existing test/dev call site omits `staticDir` and gets exactly the API
  // server it always has, no filesystem coupling to a built dist/ that may
  // not exist in that environment. When set, this must point at a real,
  // already-built directory — buildApp does not build it.
  if (staticDir) {
    if (!existsSync(staticDir)) {
      throw new Error(`staticDir does not exist: ${staticDir} — build the SPA first (npm run build).`);
    }
    await app.register(fastifyStatic, { root: staticDir });
    // SPA fallback: any GET that isn't /health or /v1 and isn't a real
    // static file resolves to index.html so client-side routing (the
    // #hash screen router) keeps working on a hard reload/deep link.
    app.setNotFoundHandler((request, reply) => {
      if (request.method !== 'GET' || request.url.startsWith('/v1') || request.url.startsWith('/health')) {
        reply.status(404);
        return { error: { code: 'NOT_FOUND' } };
      }
      return reply.sendFile('index.html');
    });
  }

  return app;
}
