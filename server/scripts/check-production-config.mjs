#!/usr/bin/env node
// T51: pre-deploy check. Run it with the EXACT environment the service will get
// (same env file / unit file); exit 1 lists every problem. The server itself
// runs the same validation on startup when NODE_ENV=production.
//   NODE_ENV=production SMARTLEARN_DB_PATH=... node server/scripts/check-production-config.mjs
import { validateProductionConfig } from '../src/production-config.js';

const problems = validateProductionConfig(process.env);
if (problems.length === 0) {
  console.log('OK: production configuration is complete and explicit');
} else {
  for (const p of problems) console.error(`${p.code}: ${p.detail}`);
  process.exit(1);
}
