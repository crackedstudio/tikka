# Event parser migration (V1 → V2)

The indexer historically shipped two Soroban event parsers. This document
records the comparison, the chosen target, and the contract contributors should
build against. The migration is now **complete**: V2 is the only parser.

## The two implementations

### V1 — `EventParserService` (removed)
- A single class with a `switch (eventName)` over every event type and a private
  `parseX` method per event.
- Version handling via a hard-coded `CONTRACT_VERSION_MAP` and a `parseV2`
  override that simply fell back to V1 logic.
- Adding a new event or a new contract meant editing the parser class itself.
- Not wired into the running pipeline — it was dead code kept only for its
  tests.

### V2 — `EventParserV2Service` (chosen)
- Decodes the raw XDR once, then delegates to an `EventHandlerRegistry`.
- One `IEventHandler` implementation per event type (`handlers/`), registered as
  default handlers and routable per contract address and schema version.
- New events/contracts are added by registering a handler — no change to the
  parser.
- Already the parser used by `LedgerPollerService` at runtime.

### Behavioural comparison

| Aspect                | V1                                  | V2                                            |
| --------------------- | ----------------------------------- | --------------------------------------------- |
| Dispatch              | `switch` in one class               | registry → per-event handler                  |
| Multi-contract        | single version map                  | per-contract + per-schema-version routing     |
| Extensibility         | edit the parser                     | register a handler                            |
| Non-contract event    | `null`                              | `null`                                        |
| Malformed XDR         | `null` (never throws)               | `null` (never throws)                         |
| Unknown event symbol  | `null`                              | `null`                                        |
| Output                | `DomainEvent`                       | `DomainEvent` tagged with `schemaVersion`     |

For the supported events, both produce equivalent `DomainEvent`s for the same
input; V2 additionally annotates each event with the `schemaVersion` taken from
the topics. All known Tikka events decode identically, so the switch is safe.

## Target parser contract

The single contract lives in `event-parser.interface.ts`:

```ts
export interface IEventParser {
  parse(rawEvent: RawSorobanEvent): DomainEvent | null;
}
```

- Returns a typed `DomainEvent` for a supported, well-formed contract event.
- Returns `null` (never throws) for non-contract events, malformed XDR, unknown
  event symbols, or events from unregistered contracts.

`RawSorobanEvent` (the raw Horizon event shape) is also defined here — it is the
canonical home now that the V1 file is gone.

Ingestion services depend on this contract through the `EVENT_PARSER` DI token,
which is bound to `EventParserV2Service`:

```ts
{ provide: EVENT_PARSER, useExisting: EventParserV2Service }
```

`LedgerPollerService` injects `@Inject(EVENT_PARSER) eventParser: IEventParser`,
so it depends on the interface rather than a concrete parser.

## Known Tikka contract events

`RaffleCreated`, `TicketPurchased`, `DrawTriggered`, `RandomnessRequested`,
`RandomnessReceived`, `RaffleFinalized`, `RaffleCancelled`, `TicketRefunded`,
`ContractPaused`, `ContractUnpaused`, `AdminTransferProposed`,
`AdminTransferAccepted`.

All are covered end-to-end (real XDR → parser → handler) in
`event-parser-v2.service.spec.ts`.

## Adding a new event

1. Add the event shape to `event.types.ts` and the `DomainEvent` union.
2. Add an `IEventHandler` in `handlers/` (extend `BaseEventHandler`).
3. Register it in `event-handlers.module.ts`.
4. Add a decode test to `event-parser-v2.service.spec.ts`.

No changes to `EventParserV2Service` are required.
