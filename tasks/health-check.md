# Health Check Endpoint

## Context

No `/health` endpoint exists. This blocks use of Docker health checks, load balancer probes, and basic uptime monitoring.

## Changes

### `src/server.ts`
- Add `GET /health` before other routes
- Check DB connectivity with a lightweight query: `SELECT COUNT(*) FROM resources`
- Return `200 { status: 'ok', resources: N }` on success
- Return `503 { status: 'error', message: '...' }` if the DB query fails
- No rate limiting on this route

### `docker-compose.yml` (optional)
- Add `healthcheck` to the app service if one is defined, pointing to `/health`

## Verification

1. `GET /health` returns `200` with resource count when DB is up
2. Returns `503` when DB is unreachable
