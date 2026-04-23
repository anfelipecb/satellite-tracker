/**
 * When set, `getToken({ template })` is used (legacy Clerk “Supabase” JWT template + shared secret).
 * When unset, the default **session** JWT is used — required for Supabase [third-party Clerk auth](https://supabase.com/docs/guides/auth/third-party/clerk) and avoids PostgREST `PGRST301` / “No suitable key or wrong key type” when the project no longer accepts HS256 template tokens.
 */
export function clerkJwtTemplateForSupabase(): string | undefined {
  const t = process.env.NEXT_PUBLIC_CLERK_SUPABASE_JWT_TEMPLATE?.trim();
  return t && t.length > 0 ? t : undefined;
}
