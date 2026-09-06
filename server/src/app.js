import Fastify from 'fastify';
import { fileURLToPath } from 'node:url';
import { validateMigrations } from './migrations.js';
import { applyDomainEnvelope } from './http-contract.js';
import { registerAuthRoutes } from './routes/auth.js';

const DEFAULT_MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));

export function buildApp(db, migrationsDir = DEFAULT_MIGRATIONS_DIR) {
  const app = Fastify({ logger: false });

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
    applyDomainEnvelope(v1);
    registerAuthRoutes(v1, db);
  }, { prefix: '/v1' });

  return app;
}
