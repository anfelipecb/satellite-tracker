'use client';

import { useSession } from '@clerk/nextjs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { useMemo } from 'react';
import { getSupabasePublicKey } from '@/lib/supabase/publicKey';

export function useSupabaseBrowser(): SupabaseClient {
  const { session } = useSession();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = getSupabasePublicKey();

  return useMemo(
    () =>
      createClient(url, key, {
        accessToken: async () => session?.getToken() ?? null,
      }),
    [key, session, url]
  );
}
