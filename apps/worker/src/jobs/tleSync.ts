import type { SupabaseClient } from '@supabase/supabase-js';
import { parseGpTleText, tleEpochToDate } from '../lib/tleParse.js';
import type { Logger } from '../lib/logger.js';

const CELESTRAK_ACTIVE =
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle';

export type JobContext = {
  supabase: SupabaseClient;
  log: Logger;
  dryRun: boolean;
};

export async function runTleSync(ctx: JobContext): Promise<{
  durationMs: number;
  satellitesUpserted: number;
  tlesInserted: number;
  errors: number;
}> {
  const started = Date.now();
  let satellitesUpserted = 0;
  let tlesInserted = 0;
  let errors = 0;

  const res = await fetch(CELESTRAK_ACTIVE);
  if (!res.ok) {
    ctx.log.error('tleSync fetch failed', res.status, await res.text());
    return { durationMs: Date.now() - started, satellitesUpserted: 0, tlesInserted: 0, errors: 1 };
  }
  const text = await res.text();
  const blocks = parseGpTleText(text);
  ctx.log.info('tleSync parsed blocks', blocks.length);

  const now = new Date().toISOString();
  const BATCH = 400;

  for (let i = 0; i < blocks.length; i += BATCH) {
    const chunk = blocks.slice(i, i + BATCH);
    try {
      if (ctx.dryRun) {
        satellitesUpserted += chunk.length;
        tlesInserted += chunk.length;
        continue;
      }
      const satRows = chunk.map((b) => ({
        norad_id: b.noradId,
        name: b.name,
        is_active: true,
        updated_at: now,
      }));
      const { error: e1 } = await ctx.supabase.from('satellites').upsert(satRows, {
        onConflict: 'norad_id',
      });
      if (e1) throw e1;
      satellitesUpserted += chunk.length;

      const tleRows = chunk.map((b) => ({
        norad_id: b.noradId,
        epoch: tleEpochToDate(b.line1).toISOString(),
        line1: b.line1,
        line2: b.line2,
        source: 'celestrak',
        fetched_at: now,
      }));
      const { error: e2 } = await ctx.supabase.from('tles').upsert(tleRows, {
        onConflict: 'norad_id,epoch',
      });
      if (e2) throw e2;
      tlesInserted += chunk.length;
    } catch (e) {
      errors++;
      ctx.log.warn('tleSync batch error', i, e);
    }
  }

  ctx.log.info('tleSync done', { satellitesUpserted, tlesInserted, errors, ms: Date.now() - started });
  return { durationMs: Date.now() - started, satellitesUpserted, tlesInserted, errors };
}
