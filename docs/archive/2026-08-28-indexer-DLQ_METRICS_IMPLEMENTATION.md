# DLQ Prometheus Metrics - Implementation Notes

## Metrics added
- `indexer_dlq_depth{contract_address}`: Gauge
- `indexer_dlq_events_total{reason,event_type}`: Counter

## Instrumentation locations
- `indexer/src/ingestor/dead-letter-queue.service.ts`
  - `enqueue()` increments counter and updates depth for in-memory DLQ.
  - `clear()` sets touched contract depths to 0.

- `indexer/src/ingestor/dlq.service.ts`
  - `insert()` increments counter and updates depth for `contractId`.
  - `replayAll()` increments counter per replay attempt and decrements depth after successful replay.

## Grafana
Panels are pending addition in Grafana dashboard JSON files.

