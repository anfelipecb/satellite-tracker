import { auth } from '@clerk/nextjs/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getSupabasePublicKey } from '@/lib/supabase/publicKey';

export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  const { getToken } = await auth();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL');
  }
  const key = getSupabasePublicKey();
  return createClient(url, key, {
    accessToken: async () => getToken(),
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
