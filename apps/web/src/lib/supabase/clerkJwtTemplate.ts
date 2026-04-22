/** Clerk JWT template slug used when signing tokens Supabase accepts (HS256 + JWT secret). */
export function clerkJwtTemplateForSupabase(): string {
  const t = process.env.NEXT_PUBLIC_CLERK_SUPABASE_JWT_TEMPLATE?.trim();
  return t && t.length > 0 ? t : 'supabase';
}
