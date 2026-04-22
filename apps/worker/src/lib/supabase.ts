import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../env.js';

export function createServiceSupabase(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
