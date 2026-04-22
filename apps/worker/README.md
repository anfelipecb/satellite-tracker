# `apps/worker`

Railway-deployable Node worker: CelesTrak TLE sync, SGP4 overhead counts, N2YO `/above` snapshots, NOAA Kp, Launch Library 2.

## Env

See `.env.example` in this folder.

## Local

```bash
pnpm --filter worker dev
```

## Docker

From **repository root**:

```bash
docker build -f apps/worker/Dockerfile -t satellite-worker .
docker run --env-file apps/worker/.env satellite-worker
```
