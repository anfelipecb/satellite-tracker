import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { n2yoPositionsResponseSchema } from '@satellite-tracker/shared';
import { assertN2yoRateLimit } from '@/lib/n2yoDebounce';

const querySchema = z.object({
  id: z.coerce.number().int().positive(),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  alt: z.coerce.number().min(0).max(9000).optional().default(0),
  seconds: z.coerce.number().int().min(1).max(300).optional().default(120),
});

const N2YO_BASE = 'https://api.n2yo.com/rest/v1/satellite';

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const limit = assertN2yoRateLimit(userId, 'positions');
  if (!limit.ok) {
    return NextResponse.json({ error: 'Too many requests', retryAfter: limit.retryAfter }, { status: 429 });
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
  const { id, lat, lng, alt, seconds } = parsed.data;

  const upstream = `${N2YO_BASE}/positions/${id}/${lat}/${lng}/${alt}/${seconds}/&apiKey=${encodeURIComponent(key)}`;
  const res = await fetch(upstream);
  const json: unknown = await res.json();
  const body = n2yoPositionsResponseSchema.safeParse(json);
  if (!body.success) {
    return NextResponse.json({ error: 'Invalid N2YO response', details: body.error.flatten() }, { status: 502 });
  }
  return NextResponse.json(body.data);
}
