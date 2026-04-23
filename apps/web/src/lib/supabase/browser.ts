'use client';

import { useSession } from '@clerk/nextjs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { useMemo } from 'react';
import { clerkJwtTemplateForSupabase } from '@/lib/supabase/clerkJwtTemplate';
import { getSupabasePublicKey } from '@/lib/supabase/publicKey';

export function useSupabaseBrowser(): SupabaseClient {
  const { session } = useSession();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = getSupabasePublicKey();
  const template = clerkJwtTemplateForSupabase();

  return useMemo(
    () =>
      createClient(url, key, {
        accessToken: async () => {
          if (!session) return null;
          if (template) return (await session.getToken({ template })) ?? null;
          return (await session.getToken()) ?? null;
        },
      }),
    [key, session, template, url]
  );
}
