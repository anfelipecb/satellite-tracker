import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { n2yoAboveResponseSchema } from '@satellite-tracker/shared';
import { assertN2yoRateLimit } from '@/lib/n2yoDebounce';
import { classifyN2yoUpstream } from '@/lib/n2yoUpstream';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const querySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  alt: z.coerce.number().min(0).max(9000).optional().default(0),
  /**
   * N2YO search radius in degrees (great-circle from the observer). The free
   * `above` endpoint accepts 0..90 — we default to 90 (whole hemisphere)
   * so our live count lines up with n2yo.com's "crossing your sky now".
   */
  radius: z.coerce.number().int().min(0).max(90).optional().default(90),
  category: z.coerce.number().int().min(0).max(100).optional().default(0),
  /** Optional Supabase `user_locations.id` — enables the DB cache. */
  locationId: z.string().uuid().optional(),
});

const N2YO_BASE = 'https://api.n2yo.com/rest/v1/satellite';
/** How long a worker-persisted n2yo row is served from DB instead of re-hitting N2YO. */
const CACHE_TTL_SECONDS = 60;

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const key = process.env.N2YO_API_KEY;
  if (!key) {
    return NextResponse.json({ error: 'N2YO not configured' }, { status: 500 });
  }

  const url = new URL(req.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { lat, lng, alt, radius, category, locationId } = parsed.data;

  // 1. DB cache — if the worker has a fresh n2yo row for this location we
  //    serve that instead of hitting N2YO. This is the whole point of the
  //    worker: smooth out rate limits by doing the heavy pulls centrally.
  const supabase = await createSupabaseServerClient();
  if (locationId) {
    const sinceIso = new Date(Date.now() - CACHE_TTL_SECONDS * 1000).toISOString();
    const { data: cached } = await supabase
      .from('overhead_counts')
      .select('count,ts_minute')
      .eq('user_location_id', locationId)
      .eq('source', 'n2yo')
      .gte('ts_minute', sinceIso)
      .order('ts_minute', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (cached) {
      return NextResponse.json(
        {
          info: { category: 'All', satcount: cached.count },
          above: [],
          cache: { source: 'db', ts: cached.ts_minute, ttlSeconds: CACHE_TTL_SECONDS },
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
  }

  // 2. Per-user debounce (keeps tab spam from wasting rate-limit budget).
  const limit = assertN2yoRateLimit(userId, 'above');
  if (!limit.ok) {
    return NextResponse.json({ error: 'Too many requests', retryAfter: limit.retryAfter }, { status: 429 });
  }

  const upstream = `${N2YO_BASE}/above/${lat}/${lng}/${alt}/${radius}/${category}/&apiKey=${encodeURIComponent(key)}`;
  const res = await fetch(upstream);
  const json: unknown = await res.json();
  const upstreamError = classifyN2yoUpstream(json);
  if (upstreamError) return upstreamError;
  const body = n2yoAboveResponseSchema.safeParse(json);
  if (!body.success) {
    return NextResponse.json({ error: 'Invalid N2YO response', details: body.error.flatten() }, { status: 502 });
  }

  // 3. Persist into overhead_counts so the next reader (this user or another)
  //    can serve from cache and the worker's view stays consistent.
  if (locationId) {
    const count = body.data.above?.length ?? body.data.info.satcount ?? 0;
    const tsMinute = new Date();
    tsMinute.setUTCSeconds(0, 0);
    await supabase.from('overhead_counts').upsert(
      {
        user_location_id: locationId,
        ts_minute: tsMinute.toISOString(),
        above_elevation_deg: 0,
        source: 'n2yo',
        count,
      },
      { onConflict: 'user_location_id,ts_minute,above_elevation_deg,source' },
    );
  }

  return NextResponse.json(
    { ...body.data, cache: { source: 'live', ts: new Date().toISOString(), ttlSeconds: CACHE_TTL_SECONDS } },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
