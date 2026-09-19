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
  // T27: capacity preflight for a legacy-import commit — reject an
  // oversized batch before any write, not partway through it.
  importMaxRows: Number(process.env.SMARTLEARN_IMPORT_MAX_ROWS ?? 5000),
  importMaxBytes: Number(process.env.SMARTLEARN_IMPORT_MAX_BYTES ?? 5_000_000),
  // T34: private uploaded sources (PDFs) live outside the static root, in
  // their own directory (never served by @fastify/static). design.md §8:
  // "cap initially at 25 MiB" per file; per-account quota is a separate,
  // explicitly configured operational limit, not a pedagogical rule.
  sourcesDir: process.env.SMARTLEARN_SOURCES_DIR ?? './data/sources',
  sourceMaxBytes: Number(process.env.SMARTLEARN_SOURCE_MAX_BYTES ?? 25 * 1024 * 1024),
  sourceQuotaBytes: Number(process.env.SMARTLEARN_SOURCE_QUOTA_BYTES ?? 200 * 1024 * 1024),
  // T37: the real-provider AI draft path is unavailable unless ALL THREE
  // are explicitly configured — an operator's deliberate choice, never a
  // default. No hardcoded model name/version: this is a business decision
  // for whoever deploys this server, not something to guess here. Missing
  // any one of these means the fake provider runs instead; it never
  // becomes a fabricated "live" pass (design.md/T37).
  aiApiKey: process.env.SMARTLEARN_AI_API_KEY || null,
  aiModel: process.env.SMARTLEARN_AI_MODEL || null,
  aiConsentGranted: process.env.SMARTLEARN_AI_CONSENT === 'true',
  aiBudgetCapUsd: process.env.SMARTLEARN_AI_BUDGET_CAP_USD ? Number(process.env.SMARTLEARN_AI_BUDGET_CAP_USD) : null,
  // Operator-controlled endpoint override (e.g. a local stub in tests); the default is the real API.
  aiApiUrl: process.env.SMARTLEARN_AI_API_URL || null,
  aiRequestTimeoutMs: Number(process.env.SMARTLEARN_AI_TIMEOUT_MS ?? 30_000),
  aiMaxInputChars: Number(process.env.SMARTLEARN_AI_MAX_INPUT_CHARS ?? 50_000),
};
