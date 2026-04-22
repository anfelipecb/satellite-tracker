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

## Supabase MCP

- Use MCP for **read** schema validation and proposing migrations; apply migrations via Supabase CLI or SQL editor unless explicitly asked to run DDL.

## Commands

```bash
pnpm --filter worker dev      # tsx watch
pnpm --filter worker test     # vitest
pnpm --filter worker build    # emits dist/
```

## Railway

- Repo root; see [railway.toml](./railway.toml) for build/start.
- Required env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `N2YO_API_KEY`.

## Definition of done (worker change)

- `pnpm --filter worker build` passes.
- `pnpm --filter worker test` passes (extend tests for new parsers).
- Job failures are logged and do not crash the process.
