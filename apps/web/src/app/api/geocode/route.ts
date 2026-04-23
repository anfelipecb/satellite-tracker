import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const openMeteoItem = z.object({
  id: z.number().optional(),
  name: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  country: z.string().optional(),
  country_code: z.string().optional(),
  admin1: z.string().optional(),
});

const openMeteoResponse = z.object({
  results: z.array(openMeteoItem).optional(),
});

/**
 * Open-Meteo Geocoding API (no API key). Docs: https://open-meteo.com/en/docs/geocoding-api
 */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  const count = Math.min(10, Math.max(1, Number(request.nextUrl.searchParams.get('count') ?? 5) || 5));

  if (q.length < 2) {
    return NextResponse.json({ error: 'Query must be at least 2 characters' }, { status: 400 });
  }

  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.searchParams.set('name', q);
  url.searchParams.set('count', String(count));
  url.searchParams.set('language', 'en');
  url.searchParams.set('format', 'json');

  const res = await fetch(url.toString(), { next: { revalidate: 60 } });
  if (!res.ok) {
    return NextResponse.json({ error: 'Geocoding request failed' }, { status: 502 });
  }

  const json: unknown = await res.json();
  const parsed = openMeteoResponse.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid geocoding response' }, { status: 502 });
  }

  const results = (parsed.data.results ?? []).map((r) => ({
    name: r.name,
    country: r.country ?? r.country_code ?? '',
    admin1: r.admin1,
    lat: r.latitude,
    lon: r.longitude,
  }));

  return NextResponse.json(
    { results },
    { headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=120' } }
  );
}
