# Backend health endpoints

The backend separates **liveness** (process up) from **readiness** (safe to serve traffic) and exposes a detailed **health** view for operators.

## Endpoints

| Endpoint | HTTP | Purpose | Kubernetes probe |
|----------|------|---------|------------------|
| `GET /health/live` | 200 | Process is running; no dependency checks | `livenessProbe` |
| `GET /health/ready` | 200 / 503 | Critical dependencies must be `ok` | `readinessProbe` |
| `GET /health` | 200 / 503 | Full dependency matrix for ops | Monitoring / alerting |

Legacy callers may keep using `GET /health`; orchestrators should prefer `/health/live` and `/health/ready`.

## Dependency checks

Each probe runs with a timeout (`HEALTH_CHECK_TIMEOUT_MS`, default 3000 ms). Indexer and Horizon use their service-specific timeout env vars when set.

| Dependency | Readiness-critical | Notes |
|------------|-------------------|-------|
| `database` | Yes | Lightweight Supabase/Postgres query |
| `redis` | Yes | `PING` against `REDIS_URL` |
| `supabase` | Yes | REST API reachability |
| `indexer` | Yes | `GET {INDEXER_URL}/health` |
| `horizon` | No | Stellar Horizon root; failure → `degraded` |
| `storage` | No | Supabase storage bucket list; failure → `degraded` |
| `notifications` | No | FCM metrics; disabled → `skipped` |

Response bodies include safe `detail` strings (hostnames, HTTP codes, failure class). Secrets, tokens, and connection URLs are never returned.

## Status values

- **`ok` / `ready`**: All checked dependencies healthy.
- **`degraded`**: Optional dependency impaired; critical path still up (`GET /health` returns 200).
- **`unhealthy` / `not_ready`**: Critical dependency failed (`GET /health` or `/health/ready` returns 503).

## Example

```bash
curl -s http://localhost:3001/health/ready | jq .
curl -s http://localhost:3001/health | jq .
```
