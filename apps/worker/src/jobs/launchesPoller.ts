import { launchLibraryUpcomingResponseSchema } from '@satellite-tracker/shared';
import type { JobContext } from './tleSync.js';

const LL2 = 'https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=15';

export async function runLaunchesPoller(ctx: JobContext): Promise<{
  durationMs: number;
  rowsUpserted: number;
  errors: number;
}> {
  const started = Date.now();
  try {
    const res = await fetch(LL2);
    if (!res.ok) throw new Error(`ll2 ${res.status}`);
    const json: unknown = await res.json();
    const parsed = launchLibraryUpcomingResponseSchema.safeParse(json);
    if (!parsed.success) throw new Error(parsed.error.message);

    const now = new Date().toISOString();
    let rowsUpserted = 0;

    for (const r of parsed.data.results) {
      const net = r.net ? new Date(r.net).toISOString() : null;
      const vehicle = r.rocket?.configuration?.full_name ?? null;
      const provider = r.launch_service_provider?.name ?? null;
      const status = r.status?.name ?? null;

      if (ctx.dryRun) {
        rowsUpserted++;
        continue;
      }
      const { error } = await ctx.supabase.from('launches').upsert(
        {
          id: r.id,
          name: r.name,
          net_utc: net,
          status,
          vehicle,
          provider,
          updated_at: now,
        },
        { onConflict: 'id' }
      );
      if (error) throw error;
      rowsUpserted++;
    }

    ctx.log.info('launchesPoller done', rowsUpserted);
    return { durationMs: Date.now() - started, rowsUpserted, errors: 0 };
  } catch (e) {
    ctx.log.error('launchesPoller', e);
    return { durationMs: Date.now() - started, rowsUpserted: 0, errors: 1 };
  }
}
