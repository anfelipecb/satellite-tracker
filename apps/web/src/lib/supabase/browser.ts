'use client';

import { useAuth } from '@clerk/nextjs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { useMemo } from 'react';
import { clerkJwtTemplateForSupabase } from '@/lib/supabase/clerkJwtTemplate';
import { getSupabasePublicKey } from '@/lib/supabase/publicKey';

/**
 * Anon + Clerk session token for RLS. Prefer **session** JWT (no custom template) unless
 * `NEXT_PUBLIC_CLERK_USE_LEGACY_SUPABASE_JWT=1` is set; see `clerkJwtTemplateForSupabase`.
 */
export function useSupabaseBrowser(): SupabaseClient {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = getSupabasePublicKey();
  const template = clerkJwtTemplateForSupabase();

  return useMemo(
    () =>
      createClient(url, key, {
        accessToken: async () => {
          if (!isLoaded || !isSignedIn) return null;
          if (template) return (await getToken({ template })) ?? null;
          return (await getToken()) ?? null;
        },
      }),
    [getToken, isLoaded, isSignedIn, key, template, url],
  );
}
