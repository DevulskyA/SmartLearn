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
  // T12: trust X-Forwarded-For only when explicitly enabled for a known
  // reverse-proxy topology. Disabled by default — Fastify then uses the
  // real TCP peer address for request.ip, so a spoofed X-Forwarded-For from
  // a direct client cannot evade IP-based rate limiting. Only enable this
  // (and only with a correctly configured hop count / proxy IP list) once
  // this server is actually deployed behind a specific trusted proxy.
  trustProxy: process.env.SMARTLEARN_TRUST_PROXY === 'true',
  // T21: "one origin" production remote mode — when set, this server also
  // serves the built SPA (npm run build's dist/) so the browser's own
  // origin IS the API origin (no CORS needed for that deployment shape).
  // Unset by default: dev keeps using the Vite dev server + proxy/CORS.
  staticDir: process.env.SMARTLEARN_STATIC_DIR || null,
};
