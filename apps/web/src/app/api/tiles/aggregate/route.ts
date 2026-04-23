import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabasePublicKey } from '@/lib/supabase/publicKey';

/**
 * H3 index → observation count in time window (from granules the worker has tiled).
 *
 * Uses the `granule_tile_counts(p_mission, p_since)` RPC to do the aggregation
 * server-side in a single SQL query. The previous client-side fan-out was
 * hitting PostgREST's default 1 000-row limit per batch and silently capping
 * "Total observations" at 5 000 even when the DB held millions of tiles.
 *
 * We still require a signed-in Clerk user, but we call PostgREST with the
 * **anon** key only (no Clerk→Supabase JWT). The RPC is `security definer`
 * and returns global mission stats; passing a user JWT is unnecessary and
 * breaks in production when Clerk third-party auth / JWT templates do not
 * match what PostgREST expects (`PGRST301`, "No suitable key or wrong key type").
 */
export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const mission = request.nextUrl.searchParams.get('mission')?.trim() ?? 'MOD09GA';
  const hours = Math.min(720, Math.max(1, Number(request.nextUrl.searchParams.get('hours') ?? 24) || 24));
  if (mission.length < 2 || mission.length > 64) {
    return NextResponse.json({ error: 'Invalid mission' }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    return NextResponse.json({ error: 'Missing NEXT_PUBLIC_SUPABASE_URL' }, { status: 500 });
  }

  const key = getSupabasePublicKey();
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const since = new Date(Date.now() - hours * 3_600_000).toISOString();

  const { data, error } = await supabase.rpc('granule_tile_counts', {
    p_mission: mission,
    p_since: since,
    p_limit: 5000,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // RPC returns a single jsonb blob (array) to bypass PostgREST's 1 000-row
  // pagination cap. Cast defensively in case it comes back as null.
  const cells = (data as { h3_index: string; count: number }[] | null) ?? [];

  return NextResponse.json(
    { cells },
    { headers: { 'Cache-Control': 's-maxage=30, stale-while-revalidate=60' } },
  );
}
