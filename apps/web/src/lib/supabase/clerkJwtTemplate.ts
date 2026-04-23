/**
 * Use **Clerk session** JWT for Supabase ( `getToken()` with no template ) by default. That matches
 * [Clerk as a Supabase third-party provider](https://supabase.com/docs/guides/auth/third-party/clerk)
 * and avoids PostgREST `PGRST301` / “No suitable key or wrong key type” when a legacy
 * HS256 “supabase” template no longer lines up with the project.
 *
 * To opt into a **named** Clerk template (e.g. `supabase` signed for the old shared-secret path):
 * set `NEXT_PUBLIC_CLERK_USE_LEGACY_SUPABASE_JWT=1` and `NEXT_PUBLIC_CLERK_SUPABASE_JWT_TEMPLATE=supabase`.
 */
export function clerkJwtTemplateForSupabase(): string | undefined {
  const useLegacy =
    process.env.NEXT_PUBLIC_CLERK_USE_LEGACY_SUPABASE_JWT === '1' ||
    process.env.NEXT_PUBLIC_CLERK_USE_LEGACY_SUPABASE_JWT === 'true';
  if (!useLegacy) {
    return undefined;
  }
  const t = process.env.NEXT_PUBLIC_CLERK_SUPABASE_JWT_TEMPLATE?.trim();
  return t && t.length > 0 ? t : undefined;
}
