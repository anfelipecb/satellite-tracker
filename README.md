# Satellite Tracker

Week 4 **Design, Build, Ship** assignment: **Railway worker** + **Supabase Realtime** + **Next.js on Vercel**, with **Clerk** auth.

## Architecture

```
CelesTrak / N2YO / NOAA / Launch Library
        ↓
   apps/worker (Railway)
        ↓
   Supabase Postgres + Realtime
        ↓
   apps/web (Vercel) + Clerk JWT → Supabase RLS
```

See [CLAUDE.md](./CLAUDE.md) for detail.

## Quick start

```bash
corepack enable && corepack prepare pnpm@9.15.0 --activate
pnpm install
pnpm dev
```

- Web: <http://localhost:3000>  
- Worker: `pnpm --filter worker dev` (needs `.env` — copy `apps/worker/.env.example`)

## Environment

Follow **[docs/ENV_SETUP.md](./docs/ENV_SETUP.md)** for Clerk JWT template (`supabase`), Supabase keys, N2YO API key, and deployment envs.

## Database

1. Create a Supabase project.
2. Run SQL from **[supabase/migrations/0001_init.sql](./supabase/migrations/0001_init.sql)** (SQL editor or `supabase db push`).

## Deploy

### Vercel (frontend)

1. New Project → import this repo.
2. **Root Directory**: `apps/web` (or monorepo root with build override — see Vercel monorepo docs).
3. **Install**: from repo root, `pnpm install` (if root is `apps/web`, set install command to run from parent workspace).
4. Env vars from `apps/web/.env.example`.

### Railway (worker)

1. New service from repo; use **[railway.toml](./railway.toml)** or Dockerfile **`apps/worker/Dockerfile`** with build context **repository root**.
2. Env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `N2YO_API_KEY`.

## Demo script (2–3 min Slack video)

1. Sign up / sign in (Clerk).
2. **Locations**: add your city (lat/lon); tap **Mark active** so the worker picks it up within 7 days.
3. **Satellites**: search `ISS` or `STARLINK`, add a favorite.
4. **Dashboard**: point out Kp, launches, overhead SGP4 vs N2YO, Starlink count, N2YO visual passes line.
5. **Globe**: show SGP4 points updating; enter NORAD `25544`, click **Live track (N2YO, 300s)** — magenta path.
6. Supabase dashboard: show a row updating in `overhead_counts` or `space_weather`.

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Turbo dev (web + worker if configured) |
| `pnpm build` | Production build |
| `pnpm test` | Vitest (worker) |

## License

Course project — check with your instructor before redistributing.
