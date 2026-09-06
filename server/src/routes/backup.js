import { createLogicalExport, BackupError } from '../backup.js';

export function registerBackupRoutes(app, db) {
  // Physical whole-database backup is intentionally NOT exposed here: it
  // spans every user's rows (including other tenants' data), so it can
  // never be a per-session HTTP route. It is an operator action —
  // server/scripts/backup.mjs — requiring shell access to the server,
  // the same authorization boundary as T11's reset-password CLI.
  app.get('/export', async (request, reply) => {
    try {
      return createLogicalExport(db, request.actor.userId);
    } catch (err) {
      if (err instanceof BackupError) {
        reply.status(err.code === 'NOT_FOUND' ? 404 : 400);
        return { error: { code: err.code, message: err.message } };
      }
      throw err;
    }
  });
}
