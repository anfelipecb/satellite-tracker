import { swpcKpResponseSchema } from '@satellite-tracker/shared';
import type { JobContext } from './tleSync.js';

const SWPC_KP = 'https://services.swpc.noaa.gov/json/planetary_k_index_1m.json';

function parseKp(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export async function runSwxPoller(ctx: JobContext): Promise<{
  durationMs: number;
  rowsUpserted: number;
  errors: number;
}> {
  const started = Date.now();
  try {
    const res = await fetch(SWPC_KP);
    if (!res.ok) throw new Error(`swpc ${res.status}`);
    const json: unknown = await res.json();
    const parsed = swpcKpResponseSchema.safeParse(json);
    if (!parsed.success) throw new Error(parsed.error.message);
    const rows = parsed.data;
    const last = rows[rows.length - 1];
    if (!last) return { durationMs: Date.now() - started, rowsUpserted: 0, errors: 0 };

    const kp =
      parseKp(last.kp_index) ??
      parseKp(last.estimated_kp) ??
      parseKp(last.kp);
    const ts = new Date(last.time_tag).toISOString();

    if (ctx.dryRun) {
      return { durationMs: Date.now() - started, rowsUpserted: 1, errors: 0 };
    }

    const { error } = await ctx.supabase.from('space_weather').upsert(
      {
        ts,
        kp: kp ?? null,
        ap: null,
        solar_wind_speed: null,
        bz_nt: null,
      },
      { onConflict: 'ts' }
    );
    if (error) throw error;
    ctx.log.info('swxPoller upsert', { ts, kp });
    return { durationMs: Date.now() - started, rowsUpserted: 1, errors: 0 };
  } catch (e) {
    ctx.log.error('swxPoller', e);
    return { durationMs: Date.now() - started, rowsUpserted: 0, errors: 1 };
  }
}
