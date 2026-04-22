import { z } from 'zod';

const envSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  /** N2YO jobs; empty string falls back so the process can boot without a key (replace for real N2YO calls). */
  N2YO_API_KEY: z
    .string()
    .optional()
    .transform((v) => (v && v.trim().length > 0 ? v.trim() : 'n2yo-replace-me')),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Env = z.infer<typeof envSchema> & { DRY_RUN: boolean };

export function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error(parsed.error.flatten().fieldErrors);
    throw new Error('Invalid environment variables for worker');
  }
  const dry = process.env.DRY_RUN === 'true' || process.env.DRY_RUN === '1';
  return { ...parsed.data, DRY_RUN: dry };
}
