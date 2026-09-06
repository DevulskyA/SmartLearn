export const config = {
  host: process.env.HOST ?? '127.0.0.1',
  port: Number(process.env.PORT ?? 3000),
  dbPath: process.env.SMARTLEARN_DB_PATH ?? './data/smartlearn.db',
  // T10: whether this server is being served over HTTPS in production.
  // Controls Secure cookie flag and the __Host- prefix — must reflect the
  // actual serving scheme, not just NODE_ENV, if a deployment ever serves
  // production over plain HTTP behind a trusted proxy that terminates TLS
  // (in which case set this explicitly rather than relying on NODE_ENV).
  isProduction: process.env.NODE_ENV === 'production',
  // Exact configured origin(s) allowed for CSRF-protected mutations.
  // Comma-separated; dev default matches the Vite dev server origin.
  allowedOrigins: (process.env.SMARTLEARN_ALLOWED_ORIGINS ?? 'http://localhost:5173')
    .split(',').map(s => s.trim()).filter(Boolean),
};
