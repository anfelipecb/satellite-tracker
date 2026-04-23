import { polygonToCells } from 'h3-js';
import { z } from 'zod';
import type { JobContext } from './tleSync.js';

const CMR = 'https://cmr.earthdata.nasa.gov/search/granules.json';

const MISSIONS = [
  { shortName: 'MOD09GA', label: 'MOD09GA' },
  { shortName: 'MYD09GA', label: 'MYD09GA' },
  { shortName: 'LANDSAT_OT_C2_L2', label: 'LANDSAT_OT_C2_L2' },
  { shortName: 'S2A_MSIL2A', label: 'S2A_MSIL2A' },
] as const;

const H3_RES = 4;
const MAX_PAGE = 200;
const H3_CELLS_PER_GRANULE = 5_000;

const feedSchema = z.object({
  feed: z
    .object({
      entry: z
        .array(
          z.object({
            id: z.string().optional(),
            title: z.string().optional(),
            time_start: z.string().optional(),
            updated: z.string().optional(),
            polygons: z.array(z.string()).optional(),
            boxes: z.array(z.string()).optional(),
            collection_concept_id: z.string().optional(),
          })
        )
        .optional(),
    })
    .optional(),
});

type LonLat = [number, number];

function parsePolygonRing(s: string): LonLat[] | null {
  const parts = s.trim().split(/\s+/).map((x) => Number(x));
  if (parts.length < 6) return null;
  if (parts.some((n) => Number.isNaN(n))) return null;
  const ring: LonLat[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    const lat = parts[i]!;
    const lon = parts[i + 1]!;
    ring.push([lon, lat]);
  }
  if (ring.length < 3) return null;
  return ring;
}

function parseBox(s: string): LonLat[] | null {
  const p = s.trim().split(/\s+/).map(Number);
  if (p.length < 4 || p.some((n) => Number.isNaN(n))) return null;
  const w = p[0]!;
  const s_ = p[1]!;
  const e = p[2]!;
  const n = p[3]!;
  return [
    [w, s_],
    [e, s_],
    [e, n],
    [w, n],
    [w, s_],
  ];
}

function ringsFromEntry(entry: { polygons?: string[]; boxes?: string[] }): LonLat[][] {
  const rings: LonLat[][] = [];
  for (const poly of entry.polygons ?? []) {
    const r = parsePolygonRing(poly);
    if (r) rings.push(r);
  }
  for (const box of entry.boxes ?? []) {
    const r = parseBox(box);
    if (r) rings.push(r);
  }
  return rings;
}

async function fetchMission(mission: (typeof MISSIONS)[number], fromIso: string, toIso: string) {
  const u = new URL(CMR);
  u.searchParams.set('short_name', mission.shortName);
  u.searchParams.set('page_size', String(MAX_PAGE));
  u.searchParams.set('sort_key', '-start_date');
  u.searchParams.set('temporal', `${fromIso},${toIso}`);

  const res = await fetch(u.toString(), {
    headers: { 'User-Agent': 'satellite-tracker-worker/0.1' },
  });
  if (!res.ok) throw new Error(`cmr ${mission.shortName} ${res.status}`);
  const json: unknown = await res.json();
  return feedSchema.parse(json);
}

export async function runCmrIngest(ctx: JobContext): Promise<{
  durationMs: number;
  rowsUpserted: number;
  errors: number;
}> {
  const started = Date.now();
  let rowsUpserted = 0;
  let errors = 0;
  const end = new Date();
  const start = new Date(end.getTime() - 72 * 60 * 60 * 1000);
  const fromIso = start.toISOString();
  const toIso = end.toISOString();

  for (const m of MISSIONS) {
    let parsed: z.infer<typeof feedSchema>;
    try {
      parsed = await fetchMission(m, fromIso, toIso);
    } catch (e) {
      ctx.log.warn('cmrIngest fetch', m.shortName, e);
      errors++;
      continue;
    }

    const entries = parsed.feed?.entry ?? [];
    for (const entry of entries) {
      const granuleId = entry.id ?? entry.title;
      if (!granuleId) {
        continue;
      }
      const t = entry.time_start ? new Date(entry.time_start) : new Date();
      if (Number.isNaN(t.getTime())) continue;

      const rings = ringsFromEntry(entry);
      if (!rings.length) {
        continue;
      }

      const outer = rings[0]!;
      if (outer.length < 3) continue;

      const footprint = {
        type: 'Feature' as const,
        properties: { mission: m.label },
        geometry: { type: 'Polygon' as const, coordinates: [outer] },
      };

      let h3List: string[] = [];
      try {
        h3List = polygonToCells([outer], H3_RES, true);
        if (h3List.length > H3_CELLS_PER_GRANULE) {
          h3List = h3List.slice(0, H3_CELLS_PER_GRANULE);
        }
      } catch (e) {
        ctx.log.debug('cmrIngest h3', granuleId, e);
        errors++;
        continue;
      }
      if (!h3List.length) continue;

      if (ctx.dryRun) {
        rowsUpserted++;
        continue;
      }

      try {
        const { error: gErr } = await ctx.supabase.from('granules').upsert(
          {
            id: granuleId,
            mission: m.label,
            acquired_at: t.toISOString(),
            footprint: footprint as unknown as Record<string, unknown>,
            cloud_cover: null,
            fetched_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        );
        if (gErr) throw gErr;
      } catch (e) {
        ctx.log.warn('cmrIngest granule', granuleId, e);
        errors++;
        continue;
      }

      const batchSize = 400;
      for (let i = 0; i < h3List.length; i += batchSize) {
        const chunk = h3List.slice(i, i + batchSize).map((h3_index) => ({ granule_id: granuleId, h3_index }));
        const { error: tErr } = await ctx.supabase.from('granule_tiles').upsert(chunk, { onConflict: 'granule_id,h3_index' });
        if (tErr) {
          ctx.log.warn('cmrIngest granule_tiles', granuleId, tErr);
          errors++;
        } else {
          rowsUpserted += chunk.length;
        }
      }
    }
  }

  ctx.log.info('cmrIngest done', { rowsUpserted, errors, ms: Date.now() - started });
  return { durationMs: Date.now() - started, rowsUpserted, errors };
}
