# Tikka — Performance Benchmarking Plan

> Version: 1.0 · Date: 2026-05-29 · Issue: #631

This document defines SLOs, existing measurement points, and benchmark procedures for the Tikka raffle platform. All future performance work should compare against the baselines recorded here.

---

## 1. SLO Targets

These are provisional targets. Baselines should be measured and recorded in [Section 6](#6-baseline-recording) before treating them as hard SLOs.

### 1.1 Backend API (`backend/` — port 3001)

| Endpoint | p50 | p95 | p99 | Error rate |
|----------|-----|-----|-----|------------|
| `GET /raffles` (list) | < 100 ms | < 300 ms | < 500 ms | < 0.1% |
| `GET /raffles/:id` | < 80 ms | < 200 ms | < 400 ms | < 0.1% |
| `GET /raffles/metadata` (batch) | < 120 ms | < 350 ms | < 600 ms | < 0.1% |
| `POST /raffles/:id/metadata` | < 200 ms | < 500 ms | < 1 s | < 0.5% |
| `POST /auth/nonce` | < 50 ms | < 150 ms | < 300 ms | < 0.1% |
| `POST /auth/verify` | < 100 ms | < 250 ms | < 500 ms | < 0.1% |
| `GET /health` | < 20 ms | < 50 ms | < 100 ms | < 0% |

Sustained load target: **100 req/s** across all endpoints with the above latency budgets met.

### 1.2 Indexer (`indexer/` — port 3002)

| Metric | Target |
|--------|--------|
| Ledger lag (steady state) | ≤ 5 ledgers |
| Ledger lag (degraded threshold) | ≤ 100 ledgers |
| Ledger lag (critical threshold) | ≤ 50 ledgers |
| Poll cycle duration (p95) | < 5 s |
| Poll cycle duration (p99) | < 10 s |
| Event processing throughput | ≥ 50 events/s |
| DB write latency (p95) | < 50 ms |
| Redis cache latency (p95) | < 5 ms |
| DLQ size (steady state) | 0 |
| DLQ size (warning) | > 10 |

### 1.3 Oracle (`oracle/` — port 3003)

| Metric | Target |
|--------|--------|
| VRF computation time (p95) | < 100 ms |
| End-to-end draw latency (request → tx submitted, p95) | < 30 s |
| Queue depth (steady state) | ≤ 5 |
| Queue depth (warning) | > 10 |
| Queue depth (unhealthy) | > 50 |
| Oracle success rate | ≥ 99.5% |
| Horizon stream reconnect time | < 60 s |

### 1.4 Database (PostgreSQL via Supabase)

| Query | Target p95 |
|-------|-----------|
| `SELECT` raffles list (paginated, 20 rows) | < 20 ms |
| `SELECT` raffle by ID with tickets | < 30 ms |
| `INSERT` ticket purchase | < 50 ms |
| `INSERT` raffle event | < 30 ms |
| Reorg rollback (DELETE cascade, 100 ledgers) | < 500 ms |

### 1.5 Client (`client/`)

| Metric | Target |
|--------|--------|
| Lighthouse Performance score | ≥ 85 |
| First Contentful Paint (FCP) | < 1.5 s |
| Largest Contentful Paint (LCP) | < 2.5 s |
| Total Blocking Time (TBT) | < 200 ms |
| JS bundle size (gzipped, initial) | < 200 KB |
| JS bundle size (gzipped, total) | < 500 KB |

---

## 2. Existing Measurement Points

### 2.1 Indexer — Prometheus metrics (`indexer/src/metrics/metrics.service.ts`)

Scraped at `GET /metrics` (port 3002). Prometheus config: `indexer/prometheus/prometheus.yml`.

| Metric | Type | Description |
|--------|------|-------------|
| `tikka_indexer_events_processed_total` | Counter | Events processed, labelled by `event_type` |
| `tikka_indexer_errors_total` | Counter | Polling/processing errors |
| `tikka_indexer_reorg_detected_total` | Counter | Ledger reorgs detected |
| `tikka_indexer_lag_ledgers` | Gauge | Current ledger lag behind Horizon tip |
| `tikka_indexer_poll_duration_seconds` | Histogram | Duration of each poll cycle |
| `tikka_indexer_memory_usage_bytes` | Gauge | Node.js heap used |

Existing alert rules (`indexer/prometheus/alerts.rules.yml`):
- `lag > 20 ledgers` for 5 min → critical
- `avg poll duration > 10 s` for 10 min → warning
- `error rate > 0.1/s` for 2 min → warning

### 2.2 Indexer — Health endpoint

`GET /health` returns: `status`, `lag_ledgers`, `lagStatus` (healthy/degraded/critical), `db`, `redis`, `redis_latency_ms`, `dlq_size`.

### 2.3 Oracle — Health and status endpoints

`GET /health` returns: `status` (healthy/unhealthy), `pendingLagRequests`.

`GET /oracle/status` returns: `queueDepth`, `queueDepthByTier` (high/medium/low), `lastProcessedAt`, `totalProcessed`, `totalFailed`, `successRate`, `uptimeMs`, `streamStatus`, `streamUptimeMs`, `circuitState`, `recentErrors`.

### 2.4 Backend — Health endpoint and request logging

`GET /health` returns: `status`, `indexer`, `supabase`, `timestamp`.

`RequestLoggingInterceptor` (`backend/src/middleware/request-logging.interceptor.ts`) logs method, path, and duration for every request. These logs are the primary source for backend latency baselines until a Prometheus exporter is added.

### 2.5 Gaps (no current measurement)

| Gap | Needed for |
|-----|-----------|
| Backend Prometheus metrics | API latency SLOs (p50/p95/p99) |
| VRF computation timing | Oracle SLO §1.3 |
| DB query timing | Database SLO §1.4 |
| Lighthouse CI | Client SLO §1.5 |
| Bundle size tracking | Client SLO §1.5 |
| k6 / artillery load scripts | Sustained load testing |

---

## 3. Benchmark Procedures

### 3.1 Backend API load test (k6)

Install k6: https://k6.io/docs/get-started/installation/

```bash
# Run from repo root against a local or staging backend
k6 run docs/performance/scripts/backend-load.js \
  --env BASE_URL=http://localhost:3001
```

Script (`docs/performance/scripts/backend-load.js`):

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const latency = new Trend('request_duration', true);
const errorRate = new Rate('errors');

export const options = {
  stages: [
    { duration: '30s', target: 20 },   // ramp up
    { duration: '2m',  target: 100 },  // sustained load
    { duration: '30s', target: 0 },    // ramp down
  ],
  thresholds: {
    'request_duration{endpoint:list}':     ['p(95)<300'],
    'request_duration{endpoint:detail}':   ['p(95)<200'],
    'request_duration{endpoint:health}':   ['p(95)<50'],
    errors: ['rate<0.001'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';

export default function () {
  // GET /raffles
  let r = http.get(`${BASE_URL}/raffles?limit=20`, { tags: { endpoint: 'list' } });
  latency.add(r.timings.duration, { endpoint: 'list' });
  errorRate.add(r.status >= 400);
  check(r, { 'list 200': (res) => res.status === 200 });

  // GET /raffles/:id  (use a known raffle ID in your environment)
  r = http.get(`${BASE_URL}/raffles/1`, { tags: { endpoint: 'detail' } });
  latency.add(r.timings.duration, { endpoint: 'detail' });
  errorRate.add(r.status >= 400);
  check(r, { 'detail 200/404': (res) => res.status === 200 || res.status === 404 });

  // GET /health
  r = http.get(`${BASE_URL}/health`, { tags: { endpoint: 'health' } });
  latency.add(r.timings.duration, { endpoint: 'health' });
  errorRate.add(r.status >= 400);
  check(r, { 'health 200': (res) => res.status === 200 });

  sleep(0.1);
}
```

### 3.2 Indexer lag measurement (manual)

```bash
# Poll the indexer health endpoint every 5 seconds for 2 minutes
# and record lag_ledgers values
for i in $(seq 1 24); do
  curl -s http://localhost:3002/health | \
    jq '{ts: .timestamp, lag: .lag_ledgers, status: .lagStatus}'
  sleep 5
done
```

Expected steady-state output: `lag_ledgers ≤ 5`, `lagStatus: "healthy"`.

### 3.3 Oracle VRF timing (manual)

```bash
# Trigger a draw on a test raffle and measure time to RaffleFinalized event
# 1. Note the current timestamp
START=$(date +%s%3N)

# 2. Invoke trigger_draw via the SDK or Stellar CLI
# stellar contract invoke --id <CONTRACT_ID> -- trigger_draw --raffle_id <ID>

# 3. Poll oracle/status until totalProcessed increments
while true; do
  PROCESSED=$(curl -s http://localhost:3003/oracle/status | jq '.metrics.totalProcessed')
  echo "$(date +%T) processed=$PROCESSED"
  sleep 2
done

# 4. Record elapsed time when totalProcessed increments
```

Target: ≤ 30 s from `trigger_draw` to oracle tx submitted.

### 3.4 Database query timing (psql)

Run against a staging Supabase instance. Replace `$DATABASE_URL` with the connection string from `SUPABASE_DB_URL`.

```bash
psql "$DATABASE_URL" <<'SQL'
-- Raffle list query (matches backend list endpoint)
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT r.*, m.title, m.description
FROM raffles r
LEFT JOIN raffle_metadata m ON m.raffle_id = r.id
WHERE r.status = 'OPEN'
ORDER BY r.created_ledger DESC
LIMIT 20 OFFSET 0;

-- Raffle detail with ticket count
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT r.*, COUNT(t.id) AS ticket_count
FROM raffles r
LEFT JOIN tickets t ON t.raffle_id = r.id
WHERE r.id = 1
GROUP BY r.id;
SQL
```

Record `Execution Time` from each `EXPLAIN ANALYZE` output as the baseline.

### 3.5 Client bundle size (Vite)

```bash
cd client
pnpm build 2>&1 | grep -E '\.(js|css)\s+\|'
# Or for gzip sizes:
pnpm build && find dist/assets -name '*.js' -exec gzip -c {} \; | wc -c
```

Record total gzipped JS size as the baseline.

### 3.6 Client Lighthouse (manual)

```bash
# Requires Chrome and lighthouse CLI
npm install -g lighthouse

# Run against local dev server
pnpm --filter client dev &
sleep 5
lighthouse http://localhost:5173 \
  --output json \
  --output-path docs/performance/lighthouse-baseline.json \
  --chrome-flags="--headless"

# Extract key metrics
jq '{
  performance: .categories.performance.score,
  fcp: .audits["first-contentful-paint"].numericValue,
  lcp: .audits["largest-contentful-paint"].numericValue,
  tbt: .audits["total-blocking-time"].numericValue
}' docs/performance/lighthouse-baseline.json
```

---

## 4. Grafana Dashboards

Existing dashboards in `indexer/grafana/`:
- `indexer-dashboard.json` — lag, poll duration, events/s, errors
- `dashboard.json` — general indexer overview

Import these into a local Grafana instance:
```bash
# Start Grafana + Prometheus with the indexer's docker-compose
cd indexer && docker-compose up -d
# Grafana at http://localhost:3000 (admin/admin)
# Import dashboards from indexer/grafana/
```

---

## 5. CI Integration (Future)

These checks are not yet wired into CI. Recommended additions:

| Check | Tool | Trigger |
|-------|------|---------|
| Bundle size budget | `bundlesize` or Vite plugin | PR |
| Lighthouse score | `lighthouse-ci` | PR |
| Backend smoke latency | k6 with `--exit-on-running-error` | Staging deploy |
| Indexer lag after startup | Shell script against `/health` | Staging deploy |

---

## 6. Baseline Recording

Run the procedures in Section 3 against the current staging environment and record results here before the next performance sprint.

| Date | Environment | Procedure | Result | Recorded by |
|------|-------------|-----------|--------|-------------|
| — | — | — | — | — |

Once baselines are recorded, update the SLO targets in Section 1 to reflect actual measured values and set alert thresholds accordingly.
