# CLAUDE.md — Satellite Tracker

## Summary

Three-service system for **Design, Build, Ship · Assignment 4**:

`CelesTrak + N2YO + NOAA + Launch Library → Railway worker → Supabase (Postgres + Realtime) → Next.js (Vercel)`.

Users authenticate with **Clerk**. For Supabase RLS, the browser uses the **Clerk session** JWT: `getToken()` with **no** custom template, matching the [Supabase + Clerk third-party](https://supabase.com/docs/guides/auth/third-party/clerk) flow. Opt into a legacy **named** Clerk template only with `NEXT_PUBLIC_CLERK_USE_LEGACY_SUPABASE_JWT=1` **and** `NEXT_PUBLIC_CLERK_SUPABASE_JWT_TEMPLATE` (older HS256 “supabase” path).

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
- **Supabase Realtime** (publication `supabase_realtime`) includes worker-written tables such as `tles`, `satellites`, `overhead_counts`, `launches`, `space_weather`, and user tables as in migrations. The dashboard subscribes to `space_weather`, `launches`, and `overhead_counts` updates. `user_ui_state` syncs active **location** + **NORAD** focus between Mission Control, Globe Lab, and clients via Realtime.

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

## Tiles (NASA CMR + H3)

- **Worker** `runCmrIngest` fetches CMR `granules.json` for `MOD09GA`, `MYD09GA`, `LANDSAT_OT_C2_L2`, `S2A_MSIL2A` (last 72h), upserts `granules` + `granule_tiles` (H3 res **4** via `h3-js`). Scheduled **`*/15 * * * *`** (every 15 minutes).
- **Web** `/app/tiles`: `TilesClient` + Cesium **2D** map (`TilesMap`); `GET /api/tiles/aggregate?mission=…&hours=…` (Clerk) aggregates H3 counts; client overlays **predicted** pass cells (`latLngToCell` on SGP4 ground track) in rose; CMR cells in cyan. Realtime on `granules` / `granule_tiles` refreshes the view.
- **Geocoding** `GET /api/geocode` — Open-Meteo Geocoding (no key); used by `CityLookupForm` on Mission Control and **Locations**.

## Pitfalls

- **Clerk ↔ Supabase**: use **session** JWTs by default; a stale `NEXT_PUBLIC_CLERK_SUPABASE_JWT_TEMPLATE` without the legacy opt-in often causes PostgREST **“No suitable key or wrong key type” (PGRST301)**. Ensure Vercel and Supabase use the same Clerk **environment** (dev vs prod) as the third-party provider settings. Set **`SUPABASE_ANON_KEY`** on Vercel if server routes cannot read `NEXT_PUBLIC_*` keys.
- **Web env**: `createClient` expects **`NEXT_PUBLIC_SUPABASE_ANON_KEY`** (legacy anon JWT) unless you standardize on newer publishable keys everywhere; keep URL + key in sync with the Supabase project.
- **Cesium** in Next: `next dev --webpack` / `next build --webpack`; assets copied to `public/cesium`; OSM tiles as default imagery if Ion token missing.
- **N2YO** key must not appear in client bundles — only `process.env.N2YO_API_KEY` in Route Handlers + worker.

## Verification

```bash
pnpm install
pnpm exec turbo run build test lint
```

Apply SQL in order: `0001_init.sql` then `0002_*` then `0003_user_ui_state.sql` (Realtime + RLS `TO authenticated` + `user_ui_state`), via `supabase db push`, SQL editor, or Supabase MCP **`apply_migration`** (keep repo files and remote in sync).
