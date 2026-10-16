import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import fastifyMultipart from '@fastify/multipart';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { validateMigrations } from './migrations.js';
import { config } from './config.js';
import { applyDomainEnvelope } from './http-contract.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerSubjectRoutes } from './routes/subjects.js';
import { registerLearningUnitRoutes } from './routes/learning-units.js';
import { registerReviewRoutes } from './routes/reviews.js';
import { registerExerciseRoutes } from './routes/exercises.js';
import { registerExamRoutes } from './routes/exams.js';
import { registerEvidenceRoutes } from './routes/evidence.js';
import { registerSettingsRoutes } from './routes/settings.js';
import { registerBackupRoutes } from './routes/backup.js';
import { registerImportRoutes } from './routes/imports.js';
import { registerAttemptRoutes } from './routes/attempts.js';
import { registerSourceRoutes } from './routes/sources.js';
import { registerContentProposalRoutes } from './routes/content-proposals.js';
import { registerGeneratedDraftRoutes } from './routes/generated-drafts.js';
import { registerGenerationJobRoutes } from './routes/generation-jobs.js';
import { createJobRunner, resolveAiSettings } from './services/generation-job-runner.js';
import { registerAgendaSnapshotRoutes } from './routes/agenda-snapshot.js';
import { registerPriorityRoutes } from './routes/priorities.js';
import { createSessionActorResolver } from './auth/resolve-actor.js';
import { resolveSessionPolicy } from './auth/session-tokens.js';
import { readFileSync } from 'node:fs';
import { devDiagnostics } from './dev-diagnostics.js';

// Reported by /health/build; the repo keeps this equal to the root package.json version (guarded by a test).
const SERVER_VERSION = (() => { try { return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version; } catch { return null; } })();

const DEFAULT_MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));

export async function buildApp(db, migrationsDir = DEFAULT_MIGRATIONS_DIR, { isProduction = false, allowedOrigins = [], trustProxy = false, staticDir = null, sources = {}, ai = {}, auth = {}, devPersistentSession = false } = {}) {
  // Throws when the DEV flag is combined with production.
  const sessionPolicy = resolveSessionPolicy({ isProduction, devPersistent: devPersistentSession });
  const app = Fastify({ logger: false, trustProxy });
  // T-F3-02: generation runs outside the request. The runner is part of the app so the process entry point can resume queued jobs
  // after a restart, and closing the app stops every provider process tree.
  const jobRunner = ai.jobRunner ?? createJobRunner(db, { settings: () => resolveAiSettings(ai), ...(ai.jobRunnerOptions ?? {}) });
  app.decorate('generationJobs', jobRunner);
  app.addHook('onClose', async () => { await jobRunner.shutdown(); });
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

  // Which build is this? Public and minimal on purpose (a commit id, a mode and the declared provider name — no secret, no path).
  // Only meaningful when the DEV launcher set it; a packaged release reports mode null and the UI shows nothing.
  app.get('/health/build', async () => {
    const body = {
      version: SERVER_VERSION,
      head: config.buildHead,
      // sha256 of the build inputs (T-F1-07): what the app bundle and this server are compared by, not the commit they were opened at
      content: config.buildContent,
      mode: config.buildMode,
      provider: config.aiProvider ?? null,
    };
    // T-F1-08: counts-only diagnostics for a bug report, DEV channel only (a release build never reports its database path)
    if (config.buildMode === 'DEV' && db) {
      try { body.diagnostics = devDiagnostics(db, config.dbPath); } catch { /* diagnostics are best effort */ }
    }
    return body;
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
      resolveActor: createSessionActorResolver(db, { isProduction, policy: sessionPolicy }),
      allowedOrigins,
    });
    // T34: registered inside /v1 (not the root app) so a multipart body is
    // only ever accepted on the same authenticated, CSRF-checked context
    // every other mutating route already requires — there is no unscoped
    // upload surface on this server.
    await v1.register(fastifyMultipart, { limits: { files: 1, fileSize: sources.maxBytes ?? config.sourceMaxBytes } });
    registerAuthRoutes(v1, db, { isProduction, policy: sessionPolicy, ...auth });
    registerSubjectRoutes(v1, db);
    registerLearningUnitRoutes(v1, db);
    registerReviewRoutes(v1, db);
    registerExerciseRoutes(v1, db);
    registerExamRoutes(v1, db);
    registerEvidenceRoutes(v1, db);
    registerSettingsRoutes(v1, db);
    registerBackupRoutes(v1, db);
    registerImportRoutes(v1, db);
    registerAttemptRoutes(v1, db);
    registerSourceRoutes(v1, db, sources);
    registerContentProposalRoutes(v1, db);
    registerGeneratedDraftRoutes(v1, db, ai);
    registerGenerationJobRoutes(v1, db, ai, jobRunner);
    registerAgendaSnapshotRoutes(v1, db);
    registerPriorityRoutes(v1, db);
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
