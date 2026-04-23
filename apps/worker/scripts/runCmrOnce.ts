// One-shot CMR ingest helper. Useful when the DB is empty and you want to
// backfill granule_tiles without waiting for the cron cadence.
//
// Usage:
//   pnpm --filter worker exec tsx scripts/runCmrOnce.ts
//
// Reads SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY from apps/worker/.env.

import { config as loadDotenv } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: resolve(__dirname, '../.env') });

const { loadEnv } = await import('../src/env.js');
const { createLogger } = await import('../src/lib/logger.js');
const { createServiceSupabase } = await import('../src/lib/supabase.js');
const { runCmrIngest } = await import('../src/jobs/cmrIngest.js');

const env = loadEnv();
const log = createLogger(env);
const supabase = createServiceSupabase(env);
const ctx = { supabase, log, dryRun: false };

const result = await runCmrIngest(ctx);
console.log('CMR ingest result:', result);
process.exit(0);
