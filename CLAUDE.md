# CLAUDE.md — Satellite Tracker

## Summary

Three-service system for **Design, Build, Ship · Assignment 4**:

`CelesTrak + N2YO + NOAA + Launch Library → Railway worker → Supabase (Postgres + Realtime) → Next.js (Vercel)`.

Users authenticate with **Clerk**. The web app requests a Clerk JWT for Supabase via `getToken({ template: … })`; the default template name is **`supabase`**, overridable with **`NEXT_PUBLIC_CLERK_SUPABASE_JWT_TEMPLATE`**. The token must be signed for Supabase (HS256 + JWT secret) per `docs/ENV_SETUP.md` or the Clerk **Supabase** integration.

## Monorepo

| Path | Role |
|------|------|
| `apps/web` | Next.js 15 + Tailwind + Clerk + Cesium/Resium + `satellite.js` (browser SGP4) |
| `apps/worker` | Node 20 + TypeScript + `croner` — polls external APIs, upserts with **service role** |
| `packages/shared` | Zod schemas shared by worker + web API routes |
| `supabase/migrations` | Schema, RLS, Realtime publication |

## Data flow (invariant)

- The worker **never** writes per-second satellite positions.
- **TLEs** live in `tles`; the browser runs **SGP4** (`satellite.js`) for the globe and Starlink counts.
- **N2YO** is used for: `/positions` (live path, server-side proxy in Next), `/visualpasses`, `/above` (worker snapshot).
- **Supabase Realtime** (publication `supabase_realtime`) includes worker-written tables such as `tles`, `satellites`, `overhead_counts`, `launches`, `space_weather`, and user tables as in migrations. The dashboard subscribes to `space_weather`, `launches`, and `overhead_counts` updates.

## Database (Clerk)

- `user_id` on user-owned tables is **text** (Clerk `sub`), not `auth.users` UUID.
- RLS example: `(auth.jwt() ->> 'sub') = user_id`.
- Reference tables (`satellites`, `tles`, `launches`, `space_weather`, …): `SELECT` **to `authenticated`** (see migration `0002_*`); writes only via **service_role** (worker).

## Agent boundaries

- **Claude / Cursor**: `apps/web`, `supabase/migrations`, `packages/shared`, docs, CI.
- **Codex** (per `AGENTS.md`): primarily `apps/worker` — keep worker changes isolated for comparison.

## External APIs

| Source | Use |
|--------|-----|
| CelesTrak `gp.php?GROUP=active&FORMAT=tle` | Daily bulk TLE sync |
| N2YO | Positions / visual passes / above (rate-limit; key server-only) |
| NOAA SWPC `planetary_k_index_1m.json` | Kp index |
| Launch Library 2 `/launch/upcoming` | Upcoming launches |

## Stretch (tiles)

- `apps/web/src/app/app/tiles/page.tsx` — placeholder.
- Worker `runCmrIngest` — stub; add NASA CMR + `h3-js` later.

## Pitfalls

- **Clerk ↔ Supabase**: match the JWT template **slug** to `NEXT_PUBLIC_CLERK_SUPABASE_JWT_TEMPLATE` (default `supabase`); without a valid token, RLS and Realtime fail for the browser client.
- **Web env**: `createClient` expects **`NEXT_PUBLIC_SUPABASE_ANON_KEY`** (legacy anon JWT) unless you standardize on newer publishable keys everywhere; keep URL + key in sync with the Supabase project.
- **Cesium** in Next: `next dev --webpack` / `next build --webpack`; assets copied to `public/cesium`; OSM tiles as default imagery if Ion token missing.
- **N2YO** key must not appear in client bundles — only `process.env.N2YO_API_KEY` in Route Handlers + worker.

## Verification

```bash
pnpm install
pnpm exec turbo run build test lint
```

Apply SQL in order: `0001_init.sql` then `0002_*` (Realtime + RLS `TO authenticated`), via `supabase db push`, SQL editor, or Supabase MCP **`apply_migration`** (keep repo files and remote in sync).
