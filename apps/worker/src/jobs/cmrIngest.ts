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
const MAX_PAGES_PER_MISSION = 5; // 5 × 200 = up to 1000 granules per mission per run
const H3_CELLS_PER_GRANULE = 5_000;

/**
 * CMR granule feed schema.
 *
 * Gotcha: the CMR REST response wraps `polygons` as `string[][]` — the outer
 * array is "list of polygons", each polygon is a list of rings, each ring is
 * a space-separated "lat lon lat lon …" string. `boxes` is a flat string[].
 * Previously we treated both as string[], which made every entry fail Zod
 * validation and quietly ingested zero granules.
 */
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
            polygons: z.array(z.array(z.string())).optional(),
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

function ringsFromEntry(entry: { polygons?: string[][]; boxes?: string[] }): LonLat[][] {
  const rings: LonLat[][] = [];
  // CMR polygons are string[][] — outer = polygons, inner = rings per polygon.
  for (const poly of entry.polygons ?? []) {
    for (const ring of poly) {
      const r = parsePolygonRing(ring);
      if (r) rings.push(r);
    }
  }
  for (const box of entry.boxes ?? []) {
    const r = parseBox(box);
    if (r) rings.push(r);
  }
  return rings;
}

async function fetchMissionPage(
  mission: (typeof MISSIONS)[number],
  fromIso: string,
  toIso: string,
  pageNum: number,
) {
  const u = new URL(CMR);
  u.searchParams.set('short_name', mission.shortName);
  u.searchParams.set('page_size', String(MAX_PAGE));
  u.searchParams.set('page_num', String(pageNum));
  u.searchParams.set('sort_key', '-start_date');
  u.searchParams.set('temporal', `${fromIso},${toIso}`);

  const res = await fetch(u.toString(), {
    headers: { 'User-Agent': 'satellite-tracker-worker/0.1' },
  });
  if (!res.ok) throw new Error(`cmr ${mission.shortName} p${pageNum} ${res.status}`);
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
  // 7 days back so the 7d / 30d UI views have meaningful history to aggregate.
  // (CMR still caps our page at 200 per short_name per run; we dedupe on id.)
  const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fromIso = start.toISOString();
  const toIso = end.toISOString();

  for (const m of MISSIONS) {
    const entries: NonNullable<NonNullable<z.infer<typeof feedSchema>['feed']>['entry']> = [];
    for (let page = 1; page <= MAX_PAGES_PER_MISSION; page++) {
      try {
        const parsed = await fetchMissionPage(m, fromIso, toIso, page);
        const pageEntries = parsed.feed?.entry ?? [];
        entries.push(...pageEntries);
        // CMR returns fewer than page_size when there are no more entries.
        if (pageEntries.length < MAX_PAGE) break;
      } catch (e) {
        ctx.log.warn('cmrIngest fetch', m.shortName, 'page', page, e);
        errors++;
        break;
      }
    }
    ctx.log.info('cmrIngest fetched', m.shortName, 'entries', entries.length);
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
