# Environment setup (Clerk, Supabase, Railway, N2YO)

Complete these steps before running `pnpm dev` end-to-end.

## 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. **Settings → API**: copy **Project URL**, **anon public** key, **service_role** key, and **JWT Secret** (Settings → API → JWT Settings).
3. Apply migrations: `pnpm exec supabase db push` (from repo root with CLI linked) or paste `supabase/migrations/0001_init.sql` in SQL Editor.
4. **Do not** enable Supabase email auth if you use Clerk as the only IdP.

## 2. Clerk + Supabase JWT

1. Create an application at [clerk.com](https://clerk.com).
2. Enable **Email** and **Google** (or your preferred providers).
3. **JWT Templates → New template** named exactly **`supabase`**:
   - Signing algorithm: **HS256**
   - Signing key: paste Supabase **JWT Secret** (same as in Supabase dashboard).
   - Claims (JSON), for example:

```json
{
  "aud": "authenticated",
  "role": "authenticated"
}
```

4. In Clerk **JWT Templates**, ensure the template slug/name is `supabase` (used by `getToken({ template: 'supabase' })` in code).

## 3. N2YO

1. Register at [n2yo.com](https://www.n2yo.com), open **My Account → API**.
2. Copy the API key. Set `N2YO_API_KEY` in `apps/web` (server routes) and `apps/worker` (Railway). Never expose it in the browser bundle.

## 4. Cesium Ion (optional)

1. [Cesium ion](https://cesium.com/ion/) → default token for imagery.
2. Set `NEXT_PUBLIC_CESIUM_ION_TOKEN` in `apps/web/.env.local`.

## 5. Railway (worker)

1. [railway.app](https://railway.app) → New Project → Deploy from GitHub repo root.
2. Set **Root Directory** to `apps/worker` (or use Dockerfile at repo root if configured).
3. Environment variables:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `N2YO_API_KEY`
   - `LOG_LEVEL=info`

## 6. Vercel (web)

1. Import the GitHub repo; **Root Directory** `apps/web`.
2. Env vars: all keys from `apps/web/.env.example`.

## 7. Local development

Copy `apps/web/.env.example` → `apps/web/.env.local` and `apps/worker/.env.example` → `apps/worker/.env`, fill values, then:

```bash
pnpm install
pnpm dev
```
