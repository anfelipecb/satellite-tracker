# AGENTS.md — Codex & other coding agents

## Read first

1. [CLAUDE.md](./CLAUDE.md) — architecture, RLS, data flow.
2. [docs/ENV_SETUP.md](./docs/ENV_SETUP.md) — Clerk, Supabase, Railway, N2YO env vars.

## Ownership

| Agent | Owns |
|-------|------|
| **Codex** (preferred) | `apps/worker/**` — jobs, Dockerfile, worker `README`, Vitest for parsers |
| **Claude / default** | `apps/web/**`, `supabase/migrations/**`, `packages/shared/**`, root docs & CI |

Do **not** edit the other agent’s primary tree without coordination.

## Worker conventions (`apps/worker`)

- TypeScript **strict**, no `any`.
- Each job in `src/jobs/*.ts` returns metrics `{ durationMs, rowsUpserted, errors }` where applicable.
- Use `@satellite-tracker/shared` Zod schemas for external JSON when available.
- Respect `DRY_RUN=true` (no Supabase writes).
- Log with `createLogger`; never log API keys.
- Add `User-Agent: satellite-tracker-worker/0.1` on outbound HTTP if a provider requires it.
- **Env**: `dotenv` loads `apps/worker/.env` at process start (`src/index.ts`). **Railway** injects variables; a `.env` file is not used there. Copy from `apps/worker/.env.example`.
- **`N2YO_API_KEY`**: empty or unset maps to an internal placeholder so the process boots; set a real key from n2yo.com for `abovePoller` and any N2YO-backed job to succeed.
- **`overheadCounts`**: only **recently viewed** `user_locations` (last 7 days), ordered by `last_viewed_at` **desc**, capped at **50** locations per run so a single Railway instance stays predictable.
- **Scheduler**: `src/index.ts` must prevent overlapping same-name jobs. If a previous run is active, skip and log instead of launching another copy.
- **`cmrIngest`**: NASA CMR `granules.json` for MODIS/Landsat/Sentinel short-names; upserts `granules` + `granule_tiles` with **h3-js** `polygonToCells` (res 4). Runs every **15** minutes. Skip already-known granules, keep bounded per-run caps for new granules and tile rows, remove partial granules after failed tile writes, and use **`User-Agent: satellite-tracker-worker/0.1`** (already in job fetch).

## Web auth and saved locations

- Clerk + Supabase uses current Supabase **third-party auth**. Default to Clerk **session** tokens (`getToken()` with no template) through Supabase `accessToken`; use the legacy named template only when `NEXT_PUBLIC_CLERK_USE_LEGACY_SUPABASE_JWT=1`.
- Saved locations go through Next Route Handlers: `apps/web/src/app/api/locations/route.ts` and `apps/web/src/app/api/locations/[id]/route.ts`. These routes use Clerk `auth()`, `createSupabaseServerClient()`, RLS, and timeouts. Do not reintroduce client-side direct Supabase writes for this page.
- Web server routes should not require `SUPABASE_SERVICE_ROLE_KEY` for normal user-owned actions. Use `SUPABASE_ANON_KEY` server-side when available, with `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` as fallback.

## Supabase MCP

- Use **Supabase MCP** (`user-supabase`) to list projects/tables, **`apply_migration`** for DDL (tracked migrations), and **`execute_sql`** for ad hoc queries when appropriate.
- Repo SQL of record remains under `supabase/migrations/`; keep MCP-applied migrations aligned with those files (same name and body) so Git and the remote stay in sync.

## Commands

```bash
pnpm --filter worker dev      # tsx watch
pnpm --filter worker test     # vitest
pnpm --filter worker build    # emits dist/
```

## Railway

- Repo root; see [railway.toml](./railway.toml) for build/start.
- Required env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and a real **`N2YO_API_KEY`** for production N2YO polling.

## Vercel

- Production web project: **`satellite-tracker-web`**.
- Production alias: `https://satellite-tracker-web.vercel.app`.
- Vercel root directory: `apps/web`; `apps/web/vercel.json` handles the monorepo install/build from repo root.
- Before deploying from the repo root, confirm `.vercel/project.json` is linked to `satellite-tracker-web`. A separate project named `web` can deploy successfully but will not update the public Satellite Tracker alias.

## Definition of done (worker change)

- `pnpm --filter worker build` passes.
- `pnpm --filter worker test` passes (extend tests for new parsers).
- Job failures are logged and do not crash the process.
- For web/auth/location changes, `pnpm --filter web build` passes and Playwright MCP verifies the production or target URL hits `/api/locations` rather than browser-direct Supabase writes.
