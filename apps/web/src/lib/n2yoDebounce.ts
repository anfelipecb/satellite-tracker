const store = new Map<string, number>();
const WINDOW_MS = 2500;

export function assertN2yoRateLimit(userId: string, action: string): { ok: true } | { ok: false; retryAfter: number } {
  const key = `${userId}:${action}`;
  const now = Date.now();
  const last = store.get(key) ?? 0;
  if (now - last < WINDOW_MS) {
    return { ok: false, retryAfter: Math.ceil((WINDOW_MS - (now - last)) / 1000) };
  }
  store.set(key, now);
  return { ok: true };
}
