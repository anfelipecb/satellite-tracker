import { getSupabaseAnonKeyForServer } from '@/lib/supabase/publicKey';

/**
 * Call a PostgREST RPC using only the anon / publishable key in headers (no user JWT).
 * Prevents the JS client from ever attaching a Clerk session token to this call.
 */
export async function callRpcAnon(
  supabaseUrl: string,
  rpcName: string,
  args: Record<string, unknown>,
): Promise<{ data: unknown; error: { message: string; code?: string } | null }> {
  let key: string;
  try {
    key = getSupabaseAnonKeyForServer();
  } catch (e) {
    return {
      data: null,
      error: { message: e instanceof Error ? e.message : 'Supabase key configuration' },
    };
  }
  const base = supabaseUrl.replace(/\/$/, '');
  const res = await fetch(`${base}/rest/v1/rpc/${encodeURIComponent(rpcName)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(args),
  });

  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { message?: string; code?: string };
    return { data: null, error: { message: j.message ?? res.statusText, code: j.code } };
  }

  return { data: await res.json().catch(() => null), error: null };
}
