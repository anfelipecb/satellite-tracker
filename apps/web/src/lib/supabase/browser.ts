'use client';

import { useAuth } from '@clerk/nextjs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { useMemo } from 'react';
import { clerkJwtTemplateForSupabase } from '@/lib/supabase/clerkJwtTemplate';
import { getSupabasePublicKey } from '@/lib/supabase/publicKey';

export function useSupabaseBrowser(): SupabaseClient {
  const { getToken } = useAuth();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = getSupabasePublicKey();

  return useMemo(
    () =>
      createClient(url, anon, {
        global: {
          fetch: async (input, init) => {
            const token = await getToken({ template: clerkJwtTemplateForSupabase() });
            const headers = new Headers(init?.headers);
            if (token) headers.set('Authorization', `Bearer ${token}`);
            return fetch(input, { ...init, headers });
          },
        },
      }),
    [getToken, url, anon]
  );
}
