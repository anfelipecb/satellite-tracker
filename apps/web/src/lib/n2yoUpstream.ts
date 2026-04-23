import { NextResponse } from 'next/server';

/**
 * N2YO returns errors as `{ error: "string message" }` with HTTP 200. Detect and classify:
 * - hourly/daily quota strings → 429 (propagate a conservative Retry-After)
 * - invalid apiKey strings → 401
 * - everything else with an `error` field → 502 with the upstream message
 *
 * When the response doesn't match either the success schema or the error envelope,
 * return a generic 502 with parse details so clients can show "bad upstream response".
 */

type UpstreamErrorEnvelope = { error: string };

function isUpstreamErrorEnvelope(x: unknown): x is UpstreamErrorEnvelope {
  return (
    typeof x === 'object' &&
    x !== null &&
    'error' in x &&
    typeof (x as { error: unknown }).error === 'string'
  );
}

export function classifyN2yoUpstream(json: unknown): NextResponse | null {
  if (!isUpstreamErrorEnvelope(json)) return null;
  const message = json.error;
  const low = message.toLowerCase();
  if (low.includes('apikey') || low.includes('api key')) {
    return NextResponse.json(
      { error: 'N2YO API key invalid', upstream: message },
      { status: 401 },
    );
  }
  if (
    low.includes('exceeded') ||
    low.includes('transactions') ||
    low.includes('too many')
  ) {
    const retryAfter = low.includes('hour') ? 3600 : low.includes('day') ? 86400 : 60;
    return NextResponse.json(
      { error: 'N2YO rate limit', upstream: message, retryAfter },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }
  return NextResponse.json(
    { error: 'N2YO upstream error', upstream: message },
    { status: 502 },
  );
}
