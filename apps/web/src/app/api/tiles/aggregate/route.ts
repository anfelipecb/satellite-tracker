import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * H3 index → observation count in time window (from granules the worker has tiled).
 */
export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const mission = request.nextUrl.searchParams.get('mission')?.trim() ?? 'MOD09GA';
  const hours = Math.min(168, Math.max(1, Number(request.nextUrl.searchParams.get('hours') ?? 24) || 24));
  if (mission.length < 2 || mission.length > 64) {
    return NextResponse.json({ error: 'Invalid mission' }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const since = new Date(Date.now() - hours * 3_600_000).toISOString();

  const { data: granules, error: gErr } = await supabase
    .from('granules')
    .select('id')
    .eq('mission', mission)
    .gte('acquired_at', since)
    .limit(8_000);

  if (gErr) {
    return NextResponse.json({ error: gErr.message }, { status: 500 });
  }

  const ids = (granules as { id: string }[] | null)?.map((g) => g.id) ?? [];
  if (!ids.length) {
    return NextResponse.json({ cells: [] as { h3_index: string; count: number }[] });
  }

  const counts = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { data: tiles, error: tErr } = await supabase.from('granule_tiles').select('h3_index').in('granule_id', chunk);
    if (tErr) {
      return NextResponse.json({ error: tErr.message }, { status: 500 });
    }
    for (const row of (tiles as { h3_index: string }[] | null) ?? []) {
      counts.set(row.h3_index, (counts.get(row.h3_index) ?? 0) + 1);
    }
  }

  const cells = [...counts.entries()]
    .map(([h3_index, count]) => ({ h3_index, count }))
    .sort((a, b) => b.count - a.count);

  return NextResponse.json(
    { cells },
    { headers: { 'Cache-Control': 's-maxage=30, stale-while-revalidate=60' } }
  );
}
