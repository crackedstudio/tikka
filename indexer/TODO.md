# TODO - DLQ Prometheus Metrics + Grafana

## Step 1 (done)
Edit `indexer/src/metrics/metrics.service.ts` to add:
- `indexer_dlq_depth` Gauge (label: `contract_address`)
- `indexer_dlq_events_total` Counter (labels: `reason`, `event_type`)
- helper methods for updating/incrementing metrics.



## Step 2 (done)
Edit `indexer/src/ingestor/dead-letter-queue.service.ts` (in-memory DLQ) to:
- increment `indexer_dlq_events_total` on enqueue
- update `indexer_dlq_depth` on enqueue/clear


## Step 3 (done)
Edit `indexer/src/ingestor/dlq.service.ts` (DB DLQ) to:
- increment `indexer_dlq_events_total` on insert
- update `indexer_dlq_depth` appropriately when replay is performed (gauge decremented when entries successfully replayed; incremented when added)




## Step 4 (done)
Update Grafana dashboards:
- `indexer/grafana/dashboard.json`
- `indexer/grafana/indexer-dashboard.json`

Add a panel visualizing DLQ depth (`indexer_dlq_depth`).



## Step 5 (pending)
Verify acceptance criteria:
- `GET /metrics` includes both new metrics
- Grafana JSON contains DLQ depth panel



