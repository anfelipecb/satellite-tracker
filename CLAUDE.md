# CLAUDE.md — Satellite Tracker

## Summary

Three-service system for **Design, Build, Ship · Assignment 4**:

`CelesTrak + N2YO + NOAA + Launch Library → Railway worker → Supabase (Postgres + Realtime) → Next.js (Vercel)`.

Users authenticate with **Clerk**. Supabase accepts Clerk JWTs via a **JWT template named `supabase`** signed with the Supabase **JWT secret** (see `docs/ENV_SETUP.md`).

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
- **Supabase Realtime** pushes when `tles`, `overhead_counts`, `launches`, or `space_weather` change.

## Database (Clerk)

- `user_id` on user-owned tables is **text** (Clerk `sub`), not `auth.users` UUID.
- RLS example: `(auth.jwt() ->> 'sub') = user_id`.
- Reference tables (`satellites`, `tles`, `launches`, `space_weather`, …): `SELECT` for `authenticated`; writes only via **service_role** (worker).

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

- **Clerk JWT template** must be named `supabase` and use the exact Supabase JWT secret.
- **Cesium** in Next: `next dev --webpack` / `next build --webpack`; assets copied to `public/cesium`; OSM tiles as default imagery if Ion token missing.
- **N2YO** key must not appear in client bundles — only `process.env.N2YO_API_KEY` in Route Handlers + worker.

## Verification

```bash
pnpm install
pnpm exec turbo run build test lint
```

Apply SQL: `supabase db push` or paste `supabase/migrations/0001_init.sql` in the Supabase SQL editor.
