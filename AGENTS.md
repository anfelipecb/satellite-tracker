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

## Definition of done (worker change)

- `pnpm --filter worker build` passes.
- `pnpm --filter worker test` passes (extend tests for new parsers).
- Job failures are logged and do not crash the process.
