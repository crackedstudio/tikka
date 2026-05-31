# Ingestion pipeline state machine

The ledger ingestion pipeline is modelled as an explicit state machine
(`pipeline-state.ts`). Ledger polling, parsing, dispatch, cursor update,
dead-letter handling, reorg rollback, and shutdown are each represented as
distinct states, so operators can always tell what the indexer is doing and so
failure/recovery paths are enforced rather than implicit.

## States

| State             | Meaning                                                            |
| ----------------- | ------------------------------------------------------------------ |
| `idle`            | Process constructed; ingestion has not started.                    |
| `polling`         | Listening for / fetching ledger events from Horizon (resting).     |
| `parsing`         | Decoding raw ledger events into domain events.                     |
| `dispatching`     | Applying parsed events to handlers/processors.                     |
| `updating_cursor` | Persisting the new cursor position after a successful batch.       |
| `dead_letter`     | A failed event has been routed to the dead-letter queue (DLQ).     |
| `retrying`        | Replaying a previously dead-lettered event.                        |
| `rolling_back`    | A reorg was detected; indexed state is being rolled back.          |
| `shutting_down`   | Graceful shutdown in progress (draining buffers).                  |
| `stopped`         | Pipeline has stopped.                                              |

`polling` is the resting state: the pipeline returns there after every
completed unit of work and waits for the next batch.

## Transition rules

```
                 START
        idle ───────────────► polling ◄──────────────────────────┐
          │                    │  ▲                               │
   SHUTDOWN│        EVENTS_     │  │ CURSOR_UPDATED                │
          │        RECEIVED    ▼  │                               │
          │                  parsing            updating_cursor   │
          │            ┌───────┴────────┐            ▲            │
          │   PARSE_   │                │ PARSE_     │ DISPATCH_  │
          │   FAILURE  ▼                ▼ SUCCESS    │ SUCCESS    │
          │        dead_letter ◄──┐  dispatching ────┘            │
          │          │  ▲  │      │      │                        │
          │   RETRY  │  │  │ DLQ_ │      │ HANDLER_FAILURE        │
          │          ▼  │  │ ENQ. │      ▼                        │
          │       retrying │  └─► (back to polling) ──────────────┘
          │        │  │    │
          │ RETRY_ │  │RETRY_EXHAUSTED
          │ SUCCESS▼  └─────────► dead_letter
          │     polling
          │
          │  REORG_DETECTED (from polling/parsing/dispatching/updating_cursor)
          │        └──────────► rolling_back ──ROLLBACK_COMPLETE──► polling
          │
          └──SHUTDOWN (from any active state)──► shutting_down ──STOP──► stopped
```

### Success
`polling` → **EVENTS_RECEIVED** → `parsing` → **PARSE_SUCCESS** →
`dispatching` → **DISPATCH_SUCCESS** → `updating_cursor` →
**CURSOR_UPDATED** → `polling`.

Driven by `LedgerPollerService` (batch flow) and `CursorManagerService`
(`CURSOR_UPDATED` on `saveCursor`).

### DLQ (parser & handler failure)
- Parser failure: `parsing` → **PARSE_FAILURE** → `dead_letter` →
  **DLQ_ENQUEUED** → `polling`.
- Handler failure: `dispatching` → **HANDLER_FAILURE** → `dead_letter` →
  **DLQ_ENQUEUED** → `polling`.

`HANDLER_FAILURE`/`DLQ_ENQUEUED` are reported by `IngestionDispatcherService`
when an event fails and is enqueued; `DlqService.insert` also reports
`DLQ_ENQUEUED` for persistently stored failures.

### Retry
`dead_letter` → **RETRY** → `retrying` → **RETRY_SUCCESS** → `polling`.
On failure: `retrying` → **HANDLER_FAILURE** → `dead_letter`, or once the
retry budget is exhausted `retrying` → **RETRY_EXHAUSTED** → `dead_letter`.

Driven by `DlqService.replayAll`.

### Rollback (reorg)
From any active state (`polling`, `parsing`, `dispatching`, `updating_cursor`):
**REORG_DETECTED** → `rolling_back` → **ROLLBACK_COMPLETE** → `polling`.

Driven by `LedgerPollerService` around `ReorgRollbackService.rollback`.

### Shutdown
From any active state: **SHUTDOWN** → `shutting_down` → **STOP** → `stopped`.
A `stopped` pipeline may **START** again, returning to `polling`.

Driven by `LedgerPollerService` (`onModuleDestroy`).

## Inspecting the current state

The live state is exposed for operators on the indexer's health server:

- `GET /health` — includes a `pipeline` snapshot alongside the other checks.
- `GET /health/pipeline` — returns just the pipeline snapshot:

```json
{
  "pipeline": {
    "state": "polling",
    "previousState": "updating_cursor",
    "lastTransition": "cursor_updated",
    "since": "2024-01-01T00:00:00.000Z",
    "transitionCount": 128,
    "recent": [
      { "from": "dispatching", "to": "updating_cursor", "transition": "dispatch_success", "at": "..." },
      { "from": "updating_cursor", "to": "polling", "transition": "cursor_updated", "at": "..." }
    ]
  }
}
```

Illegal transitions (e.g. a racy or out-of-order report from the concurrent,
buffered pipeline) are rejected and leave the recorded state unchanged, so the
snapshot always reflects a coherent walk through the state machine.
