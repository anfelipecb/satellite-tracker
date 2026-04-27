# CLAUDE.md — Satellite Tracker

## Summary

Three-service system for **Design, Build, Ship · Assignment 4**:

`CelesTrak + N2YO + NOAA + Launch Library → Railway worker → Supabase (Postgres + Realtime) → Next.js (Vercel)`.

Users authenticate with **Clerk**. For Supabase RLS, web clients and Next Route Handlers use the **Clerk session** JWT: `getToken()` with **no** custom template, matching the [Supabase + Clerk third-party](https://supabase.com/docs/guides/auth/third-party/clerk) flow. Opt into a legacy **named** Clerk template only with `NEXT_PUBLIC_CLERK_USE_LEGACY_SUPABASE_JWT=1` **and** `NEXT_PUBLIC_CLERK_SUPABASE_JWT_TEMPLATE` (older HS256 “supabase” path).

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
- **Saved locations** load/write/delete through Next Route Handlers (`/api/locations`, `/api/locations/[id]`) using Clerk session tokens plus Supabase RLS. Do not bypass these routes from the page for user-owned writes unless you also preserve Clerk third-party auth and timeouts.

## Database (Clerk)

- `user_id` on user-owned tables is **text** (Clerk `sub`), not `auth.users` UUID.
- RLS example: `(auth.jwt() ->> 'sub') = user_id`.
- User-owned web Route Handlers should use `createSupabaseServerClient()` with the anon/publishable key and Clerk `auth().getToken()`. Do **not** use the service-role key for normal user actions such as saved locations.
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

- **Worker** `runCmrIngest` fetches CMR `granules.json` for `MOD09GA`, `MYD09GA`, `LANDSAT_OT_C2_L2`, `S2A_MSIL2A` (last **7 days**), upserts `granules` + `granule_tiles` (H3 res **4** via `h3-js`). Scheduled **`*/15 * * * *`** (every 15 minutes). It skips granules already present, caps new granules per mission, caps tile rows per run, and removes partially inserted granules if tile writes fail so later runs can retry.
- **Web** `/app/tiles`: `TilesClient` + schematic world map; `GET /api/tiles/coverage?mission=…&hours=…` (Clerk) computes an orbit-history-first H3 coverage layer from the latest TLE for the selected mission, adds a separate tracked-satellite overlay, and includes confirmed CMR `granule_tiles` counts as a secondary layer. Realtime on `granules` / `granule_tiles` refreshes confirmed coverage.
- **Geocoding** `GET /api/geocode` — Open-Meteo Geocoding (no key); used by `CityLookupForm` on Mission Control and **Locations**.

## Pitfalls

- **Clerk ↔ Supabase**: use **session** JWTs by default; a stale `NEXT_PUBLIC_CLERK_SUPABASE_JWT_TEMPLATE` without the legacy opt-in often causes PostgREST **“No suitable key or wrong key type” (PGRST301)**. Ensure Vercel and Supabase use the same Clerk **environment** (dev vs prod) as the third-party provider settings. Set **`SUPABASE_ANON_KEY`** on Vercel if server routes cannot read `NEXT_PUBLIC_*` keys.
- **Web env**: `createClient` accepts `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (preferred) or `NEXT_PUBLIC_SUPABASE_ANON_KEY` (legacy anon JWT). Server Route Handlers prefer server-only `SUPABASE_ANON_KEY`, then fall back to `NEXT_PUBLIC_SUPABASE_*`. Keep URL + key in sync with the Supabase project.
- **Vercel**: the production app is the `satellite-tracker-web` Vercel project with root directory `apps/web` and production alias `https://satellite-tracker-web.vercel.app`. If deploying from the repo root, confirm `.vercel/project.json` is linked to `satellite-tracker-web`; deploying to a separate `web` project will not update the public app.
- **Worker scheduling**: `src/index.ts` guards jobs with an in-memory running set. If a scheduled run is still active, the next same-named run is skipped and logged instead of overlapping.
- **Cesium** in Next: `next dev --webpack` / `next build --webpack`; assets copied to `public/cesium`; OSM tiles as default imagery if Ion token missing.
- **N2YO** key must not appear in client bundles — only `process.env.N2YO_API_KEY` in Route Handlers + worker.

## Verification

```bash
pnpm install
pnpm --filter worker build
pnpm --filter worker test
pnpm --filter web build
```

Apply SQL in order: `0001_init.sql` then `0002_*` then `0003_user_ui_state.sql` (Realtime + RLS `TO authenticated` + `user_ui_state`), via `supabase db push`, SQL editor, or Supabase MCP **`apply_migration`** (keep repo files and remote in sync).
