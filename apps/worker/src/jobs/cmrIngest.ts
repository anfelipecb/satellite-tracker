import type { JobContext } from './tleSync.js';

/**
 * Stretch: full NASA CMR granule → H3 tiling pipeline.
 * For now: no-op with structured log so Railway shows the job is wired.
 */
export async function runCmrIngest(ctx: JobContext): Promise<{
  durationMs: number;
  rowsUpserted: number;
  errors: number;
}> {
  const started = Date.now();
  ctx.log.debug('cmrIngest: stub (enable CMR + h3-js in stretch milestone)');
  return { durationMs: Date.now() - started, rowsUpserted: 0, errors: 0 };
}
