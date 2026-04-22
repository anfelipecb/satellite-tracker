import { Cron } from 'croner';
import { loadEnv } from './env.js';
import { createLogger } from './lib/logger.js';
import { createServiceSupabase } from './lib/supabase.js';
import { runTleSync } from './jobs/tleSync.js';
import { runOverheadCounts } from './jobs/overheadCounts.js';
import { runAbovePoller } from './jobs/abovePoller.js';
import { runSwxPoller } from './jobs/swxPoller.js';
import { runLaunchesPoller } from './jobs/launchesPoller.js';
import { runCmrIngest } from './jobs/cmrIngest.js';

const env = loadEnv();
const log = createLogger(env);
const supabase = createServiceSupabase(env);

const ctx = { supabase, log, dryRun: env.DRY_RUN };

log.info('worker starting', { dryRun: ctx.dryRun });

async function safe(name: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (e) {
    log.error(`job ${name} crashed`, e);
  }
}

// Run critical jobs once at startup (helps empty DB + demos)
void safe('tleSync', () => runTleSync(ctx));
void safe('swxPoller', () => runSwxPoller(ctx));
void safe('launchesPoller', () => runLaunchesPoller(ctx));

new Cron('0 6 * * *', () => void safe('tleSync', () => runTleSync(ctx)), { timezone: 'UTC' });
new Cron('* * * * *', () => void safe('overheadCounts', () => runOverheadCounts(ctx)));
new Cron('*/2 * * * *', () => void safe('abovePoller', () => runAbovePoller(ctx)));
new Cron('*/15 * * * *', () => void safe('swxPoller', () => runSwxPoller(ctx)));
new Cron('5 * * * *', () => void safe('launchesPoller', () => runLaunchesPoller(ctx)));
new Cron('10 * * * *', () => void safe('cmrIngest', () => runCmrIngest(ctx)));

log.info('scheduler registered');
