function looksLikeSupabasePublicKey(value: string): boolean {
  return value.startsWith('sb_publishable_') || value.startsWith('eyJ');
}

export function getSupabasePublicKey() {
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const key = publishable || anon;

  if (!key) {
    throw new Error(
      'Missing Supabase browser key. Set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY.'
    );
  }

  if (!looksLikeSupabasePublicKey(key)) {
    throw new Error(
      'Supabase browser key looks invalid. Use a publishable key (sb_publishable_...) or legacy anon JWT.'
    );
  }

  return key;
}
