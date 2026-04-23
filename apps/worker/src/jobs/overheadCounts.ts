import * as satellite from 'satellite.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Logger } from '../lib/logger.js';
import { rad2deg } from '../lib/rad.js';
import type { JobContext } from './tleSync.js';

type LatestTle = { norad_id: number; line1: string; line2: string };

async function fetchLatestTles(supabase: SupabaseClient, log: Logger) {
  const { data: sats, error: e1 } = await supabase.from('satellites').select('norad_id').eq('is_active', true);
  if (e1 || !sats?.length) {
    log.warn('overheadCounts: no satellites', e1);
    return [];
  }
  const ids = sats.map((s) => s.norad_id);
  const out: LatestTle[] = [];
  // Batch NORAD ids to avoid huge IN clauses
  const chunk = 500;
  for (let i = 0; i < ids.length; i += chunk) {
    const slice = ids.slice(i, i + chunk);
    const { data: rows, error: e2 } = await supabase
      .from('tles')
      .select('norad_id,line1,line2,epoch')
      .in('norad_id', slice)
      .order('epoch', { ascending: false });
    if (e2 || !rows) continue;
    const seen = new Set<number>();
    for (const r of rows) {
      if (seen.has(r.norad_id)) continue;
      seen.add(r.norad_id);
      out.push({ norad_id: r.norad_id, line1: r.line1, line2: r.line2 });
    }
  }
  return out;
}

function countAboveHorizon(
  tles: LatestTle[],
  latDeg: number,
  lonDeg: number,
  minElDeg: number,
  log: Logger
): number {
  const observerGd = {
    longitude: satellite.degreesToRadians(lonDeg),
    latitude: satellite.degreesToRadians(latDeg),
    height: 0.001,
  };
  let count = 0;
  const now = new Date();
  for (const t of tles) {
    try {
      const satrec = satellite.twoline2satrec(t.line1, t.line2);
      const pv = satellite.propagate(satrec, now);
      const positionEci = pv.position;
      if (!positionEci || typeof positionEci === 'boolean') continue;
      const gmst = satellite.gstime(now);
      const positionEcf = satellite.eciToEcf(positionEci, gmst);
      const lookAngles = satellite.ecfToLookAngles(observerGd, positionEcf);
      const elDeg = rad2deg(lookAngles.elevation);
      if (elDeg >= minElDeg) count++;
    } catch (e) {
      log.debug('sgp4 skip', t.norad_id, e);
    }
  }
  return count;
}

export async function runOverheadCounts(ctx: JobContext): Promise<{
  durationMs: number;
  rowsUpserted: number;
  errors: number;
}> {
  const started = Date.now();
  let rowsUpserted = 0;
  let errors = 0;

  const { data: locs, error: le } = await ctx.supabase
    .from('user_locations')
    .select('id,lat,lon,last_viewed_at,created_at');
  if (le) {
    ctx.log.error('overheadCounts locations', le);
    return { durationMs: Date.now() - started, rowsUpserted: 0, errors: 1 };
  }
  if (!locs?.length) {
    ctx.log.info('overheadCounts: no user locations');
    return { durationMs: Date.now() - started, rowsUpserted: 0, errors: 0 };
  }

  const activeLocs = locs
    .filter((l) => {
      if (!l.last_viewed_at) return true;
      const t = new Date(l.last_viewed_at).getTime();
      return Date.now() - t < 7 * 86400000;
    })
    .sort((a, b) => {
      const ta = a.last_viewed_at ? new Date(a.last_viewed_at).getTime() : 0;
      const tb = b.last_viewed_at ? new Date(b.last_viewed_at).getTime() : 0;
      return tb - ta;
    })
    .slice(0, 50);
  if (!activeLocs.length) {
    ctx.log.info('overheadCounts: no recently viewed locations');
    return { durationMs: Date.now() - started, rowsUpserted: 0, errors: 0 };
  }

  const tles = await fetchLatestTles(ctx.supabase, ctx.log);
  if (!tles.length) return { durationMs: Date.now() - started, rowsUpserted: 0, errors: 0 };

  const tsMinute = new Date();
  tsMinute.setUTCSeconds(0, 0);
  const iso = tsMinute.toISOString();
  const minEl = 10;

  for (const loc of activeLocs) {
    try {
      const c = countAboveHorizon(tles, loc.lat, loc.lon, minEl, ctx.log);
      if (ctx.dryRun) {
        rowsUpserted++;
        continue;
      }
      const { error } = await ctx.supabase.from('overhead_counts').upsert(
        {
          user_location_id: loc.id,
          ts_minute: iso,
          above_elevation_deg: minEl,
          source: 'sgp4',
          count: c,
        },
        { onConflict: 'user_location_id,ts_minute,above_elevation_deg,source' }
      );
      if (error) throw error;
      rowsUpserted++;
    } catch (e) {
      errors++;
      ctx.log.warn('overheadCounts loc error', loc.id, e);
    }
  }

  ctx.log.info('overheadCounts done', { rowsUpserted, errors, ms: Date.now() - started });
  return { durationMs: Date.now() - started, rowsUpserted, errors };
}
