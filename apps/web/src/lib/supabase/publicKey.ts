function looksLikeSupabasePublicKey(value: string): boolean {
  return value.startsWith('sb_publishable_') || value.startsWith('eyJ');
}

function assertAnonOrPublishableKey(key: string, context: 'browser' | 'server'): string {
  if (!key) {
    throw new Error(
      context === 'browser'
        ? 'Missing Supabase browser key. Set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY.'
        : 'Missing Supabase key. Set SUPABASE_ANON_KEY (server) and/or NEXT_PUBLIC_SUPABASE_* keys.',
    );
  }
  if (!looksLikeSupabasePublicKey(key)) {
    throw new Error(
      'Supabase browser key looks invalid. Use a publishable key (sb_publishable_...) or legacy anon JWT.',
    );
  }
  return key;
}

export function getSupabasePublicKey() {
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  return assertAnonOrPublishableKey(publishable || anon || '', 'browser');
}

/**
 * Route handlers / server code: prefer server-only `SUPABASE_ANON_KEY` on Vercel so
 * the anon key is not tied to the client build inlining of `NEXT_PUBLIC_*`.
 */
export function getSupabaseAnonKeyForServer(): string {
  const server = process.env.SUPABASE_ANON_KEY?.trim();
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  return assertAnonOrPublishableKey(server || publishable || anon || '', 'server');
}
