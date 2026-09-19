// T51: fail-closed validation of a PRODUCTION launch's configuration. Development
// defaults (relative data paths, localhost origins, "trust nothing/whatever" proxy
// posture, silent fake AI provider) are all fine for dev and all wrong in production
// — so when NODE_ENV=production the server refuses to start unless every deployment
// decision was made explicitly. Pure: reads only the env object it is given.
import { existsSync } from 'node:fs';
import { isAbsolute } from 'node:path';

const problem = (code, detail) => ({ code, detail });
const isPositiveInt = (v) => /^\d+$/.test(String(v)) && Number(v) > 0;

export function validateProductionConfig(env = process.env, { fileExists = existsSync } = {}) {
  const problems = [];

  if (env.NODE_ENV !== 'production') problems.push(problem('NODE_ENV_NOT_PRODUCTION', 'NODE_ENV deve ser "production" (cookies Secure/__Host-, sem atalhos de desenvolvimento).'));

  // Persistent data paths: a relative default silently creates an EMPTY database per working directory.
  for (const [code, name] of [['DB_PATH', 'SMARTLEARN_DB_PATH'], ['SOURCES_DIR', 'SMARTLEARN_SOURCES_DIR']]) {
    if (!env[name]) problems.push(problem(`${code}_MISSING`, `${name} deve ser definido explicitamente.`));
    else if (!isAbsolute(env[name])) problems.push(problem(`${code}_NOT_ABSOLUTE`, `${name} deve ser um caminho absoluto (recebido: ${env[name]}).`));
  }

  // One origin, HTTPS, explicit. The dev default (http://localhost:5173) must never carry over.
  if (!env.SMARTLEARN_ALLOWED_ORIGINS) {
    problems.push(problem('ORIGINS_MISSING', 'SMARTLEARN_ALLOWED_ORIGINS deve listar explicitamente a(s) origem(ns) HTTPS.'));
  } else {
    for (const origin of env.SMARTLEARN_ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)) {
      if (origin.includes('*')) problems.push(problem('ORIGIN_WILDCARD', `Origem com curinga não é permitida: ${origin}`));
      else if (!/^https:\/\/[^/\s]+$/i.test(origin)) problems.push(problem('ORIGIN_NOT_HTTPS', `Origem deve ser https://host[:porta] sem caminho: ${origin}`));
    }
  }

  // One origin serves the SPA too: no CORS surface, the browser's origin IS the API origin.
  if (!env.SMARTLEARN_STATIC_DIR) problems.push(problem('STATIC_DIR_MISSING', 'SMARTLEARN_STATIC_DIR (dist/ do build) é necessário para servir SPA e API na mesma origem.'));
  else if (!isAbsolute(env.SMARTLEARN_STATIC_DIR)) problems.push(problem('STATIC_DIR_NOT_ABSOLUTE', 'SMARTLEARN_STATIC_DIR deve ser absoluto.'));
  else if (!fileExists(env.SMARTLEARN_STATIC_DIR)) problems.push(problem('STATIC_DIR_NOT_FOUND', `Não existe: ${env.SMARTLEARN_STATIC_DIR}`));

  // Proxy trust is a topology decision, never a default.
  if (env.SMARTLEARN_TRUST_PROXY !== 'true' && env.SMARTLEARN_TRUST_PROXY !== 'false') {
    problems.push(problem('TRUST_PROXY_UNSPECIFIED', 'SMARTLEARN_TRUST_PROXY deve ser "true" (atrás de proxy conhecido) ou "false" (exposição direta), explicitamente.'));
  }
  if (['0.0.0.0', '::', '[::]'].includes(env.HOST) && env.SMARTLEARN_TRUST_PROXY !== 'true') {
    problems.push(problem('HOST_EXPOSED_WITHOUT_PROXY_TRUST', 'HOST em todas as interfaces exige decisão explícita: use um proxy TLS na frente (TRUST_PROXY=true) ou faça bind em 127.0.0.1.'));
  }
  if (env.PORT !== undefined && !(isPositiveInt(env.PORT) && Number(env.PORT) <= 65535)) problems.push(problem('PORT_INVALID', `PORT inválida: ${env.PORT}`));

  // Upload/import budgets: NaN or <= 0 would silently disable a limit.
  for (const name of ['SMARTLEARN_SOURCE_MAX_BYTES', 'SMARTLEARN_SOURCE_QUOTA_BYTES', 'SMARTLEARN_IMPORT_MAX_ROWS', 'SMARTLEARN_IMPORT_MAX_BYTES', 'SMARTLEARN_AI_TIMEOUT_MS', 'SMARTLEARN_AI_MAX_INPUT_CHARS']) {
    if (env[name] !== undefined && !isPositiveInt(env[name])) problems.push(problem('LIMIT_INVALID', `${name} deve ser um inteiro positivo (recebido: ${env[name]}).`));
  }

  // The real AI provider needs key + model + consent together (config.js falls back to the FAKE provider
  // otherwise). A half-configured production must fail loudly, not quietly serve fake drafts.
  const aiParts = [env.SMARTLEARN_AI_API_KEY, env.SMARTLEARN_AI_MODEL, env.SMARTLEARN_AI_CONSENT === 'true' ? 'yes' : ''];
  if (aiParts.some(Boolean) && !aiParts.every(Boolean)) {
    problems.push(problem('AI_CONFIG_INCOMPLETE', 'SMARTLEARN_AI_API_KEY, SMARTLEARN_AI_MODEL e SMARTLEARN_AI_CONSENT=true devem ser definidos juntos (ou nenhum).'));
  }
  if (env.SMARTLEARN_AI_API_KEY) {
    const cap = Number(env.SMARTLEARN_AI_BUDGET_CAP_USD);
    if (!(Number.isFinite(cap) && cap > 0)) problems.push(problem('AI_BUDGET_REQUIRED', 'Com provedor real, SMARTLEARN_AI_BUDGET_CAP_USD deve ser um número positivo.'));
  }

  // Nothing development-only may ride along.
  for (const name of Object.keys(env)) {
    if (/^SMARTLEARN_(DEV|SEED|DEBUG)/.test(name)) problems.push(problem('DEV_FLAG_PRESENT', `${name} não pode existir em produção.`));
  }

  return problems;
}
