# Indexer OpenTelemetry tracing

> Issue: [#1124](https://github.com/crackedstudio/tikka/issues/1124) · Package: `indexer/`

Each ingested event becomes one distributed **trace** spanning handler execution, the DB apply transaction, and webhook fan-out. Metrics remain on the Prometheus path (`@opentelemetry/sdk-metrics`); this document covers **traces**.

Related: [README.md](./README.md) (metric naming), [METRICS_MAP.md](./METRICS_MAP.md).

---

## Span tree (one event)

```
indexer.event.process          event.type, event.id, handler.name, stellar.ledger
└── indexer.event.handler      event.type, event.id, db.system
    └── indexer.event.db       event.type, event.id, db.operation=apply_event
        └── indexer.event.webhook          (when processors fan out)
            └── indexer.event.webhook.deliver   http.url, http.method
```

All spans share the same `trace_id`. Webhook spans nest under the active process/handler context because processors call `WebhookService.dispatch` while the dispatcher’s `startActiveSpan` callback is still open.

---

## Setup

### Dependencies

Already wired in `indexer/package.json`:

- `@opentelemetry/api`
- `@opentelemetry/sdk-trace-base`
- `@opentelemetry/sdk-trace-node` (AsyncLocalStorage context + `register()`)
- `@opentelemetry/resources`
- `@opentelemetry/exporter-trace-otlp-http`
- (metrics) `@opentelemetry/sdk-metrics`, `@opentelemetry/exporter-prometheus`

### Bootstrap

`main.ts` calls `initTracing()` before Nest boots. `TracingModule` is global and injects `TracingService` into:

- `IngestionDispatcherService` — `indexer.event.process` / `.handler` / `.db`
- `WebhookService` — `indexer.event.webhook` / `.webhook.deliver`

### Environment

| Variable | Purpose |
|----------|---------|
| `OTEL_SERVICE_NAME` | Resource `service.name` (default `tikka-indexer`) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP/HTTP collector base or full `/v1/traces` URL |
| `OTEL_TRACES_CONSOLE` | Set `true` to print spans to stdout (local debug) |

Example (Jaeger all-in-one OTLP):

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces
export OTEL_SERVICE_NAME=tikka-indexer
npm run start:dev
```

Example (console only):

```bash
export OTEL_TRACES_CONSOLE=true
npm run start:dev
```

With neither set, the tracer provider still registers so in-process nesting works (unit tests use `InMemorySpanExporter`).

---

## Code entry points

| File | Role |
|------|------|
| `indexer/src/tracing/tracing.ts` | `initTracing`, `withSpan`, shutdown |
| `indexer/src/tracing/tracing.service.ts` | Nest injectable wrapper |
| `indexer/src/ingestor/ingestion-dispatcher.service.ts` | Process / handler / DB spans |
| `indexer/src/webhooks/webhook.service.ts` | Webhook spans |

---

## Verification

1. Enable `OTEL_TRACES_CONSOLE=true` or point OTLP at a collector.
2. Ingest a `RaffleCreated` (or any event that triggers a webhook).
3. Confirm one `trace_id` contains `indexer.event.process`, `indexer.event.handler`, `indexer.event.db`, and (when webhooks are registered) `indexer.event.webhook`.

Automated check: `indexer/src/tracing/tracing.spec.ts` asserts nested spans share a trace id.
