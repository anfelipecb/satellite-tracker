import { n2yoAboveResponseSchema } from '@satellite-tracker/shared';
import type { JobContext } from './tleSync.js';

const N2YO_BASE = 'https://api.n2yo.com/rest/v1/satellite';

export async function runAbovePoller(ctx: JobContext): Promise<{
  durationMs: number;
  rowsUpserted: number;
  errors: number;
}> {
  const started = Date.now();
  let rowsUpserted = 0;
  let errors = 0;
  const key = process.env.N2YO_API_KEY;
  if (!key) {
    ctx.log.error('abovePoller: missing N2YO_API_KEY');
    return { durationMs: Date.now() - started, rowsUpserted: 0, errors: 1 };
  }

  const { data: locs, error: le } = await ctx.supabase
    .from('user_locations')
    .select('id,lat,lon,last_viewed_at');
  if (le || !locs?.length) {
    return { durationMs: Date.now() - started, rowsUpserted: 0, errors: le ? 1 : 0 };
  }

  const active = locs.filter((l) => {
    if (!l.last_viewed_at) return true;
    return Date.now() - new Date(l.last_viewed_at).getTime() < 7 * 86400000;
  });

  const tsMinute = new Date();
  tsMinute.setUTCSeconds(0, 0);
  const iso = tsMinute.toISOString();
  const minEl = 10;

  for (const loc of active) {
    try {
      const url = `${N2YO_BASE}/above/${loc.lat}/${loc.lon}/0/45/0/&apiKey=${encodeURIComponent(key)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`n2yo ${res.status}`);
      const json = await res.json();
      const parsed = n2yoAboveResponseSchema.safeParse(json);
      if (!parsed.success) throw new Error(parsed.error.message);
      const count = parsed.data.above?.length ?? parsed.data.info.satcount ?? 0;

      if (ctx.dryRun) {
        rowsUpserted++;
        continue;
      }
      const { error } = await ctx.supabase.from('overhead_counts').upsert(
        {
          user_location_id: loc.id,
          ts_minute: iso,
          above_elevation_deg: minEl,
          source: 'n2yo',
          count,
        },
        { onConflict: 'user_location_id,ts_minute,above_elevation_deg,source' }
      );
      if (error) throw error;
      rowsUpserted++;
    } catch (e) {
      errors++;
      ctx.log.warn('abovePoller error', loc.id, e);
    }
  }

  ctx.log.info('abovePoller done', { rowsUpserted, errors, ms: Date.now() - started });
  return { durationMs: Date.now() - started, rowsUpserted, errors };
}
