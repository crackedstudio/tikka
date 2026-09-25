# Event parser

The indexer ships a single Soroban event parser. It decodes raw XDR once, then
delegates to an `EventHandlerRegistry` of per-event `IEventHandler`s. Schema
versioning of *events* (see `handlers/schema-version.ts`) is a separate concept
from this parser implementation — do not conflate the two.

## Contract

The parser contract lives in `event-parser.interface.ts`:

```ts
export interface IEventParser {
  parse(rawEvent: RawSorobanEvent): DomainEvent | null;
}
```

- Returns a typed `DomainEvent` for a supported, well-formed contract event.
- Returns `null` (never throws) for non-contract events, malformed XDR, unknown
  event symbols, or events from unregistered contracts.

`RawSorobanEvent` (the raw Horizon event shape) is defined in the same file.

Ingestion services depend on this contract through the `EVENT_PARSER` DI token,
bound to `EventParserService`:

```ts
{ provide: EVENT_PARSER, useExisting: EventParserService }
```

`LedgerPollerService` injects `@Inject(EVENT_PARSER) eventParser: IEventParser`,
so it depends on the interface rather than a concrete class.

## Architecture

Key components:

1. **EventHandlerRegistry** — central registry of event handlers
2. **IEventHandler** — interface every handler implements
3. **BaseEventHandler** — shared utilities for handlers
4. **EventParserService** — canonical parser used by the ingestion pipeline
5. **Configuration** — JSON config for contracts and handlers (`config/event-handlers.json`)

### Directory structure

```
indexer/src/ingestor/
├── event-handler.interface.ts
├── event-handler-registry.service.ts
├── event-parser.service.ts
├── event-parser.interface.ts
├── event-handlers.module.ts
├── handlers/
│   ├── base-event.handler.ts
│   ├── schema-version.ts
│   └── ...
└── event.types.ts
```

### Handling flow

```
1. Raw Soroban Event
   ↓
2. EventParserService.parse()
   ↓
3. Extract contract address, event name, schemaVersion
   ↓
4. EventHandlerRegistry.parseEvent()
   ↓
5. Handler.parse() → DomainEvent | null
```

## Known Tikka contract events

`RaffleCreated`, `TicketPurchased`, `DrawTriggered`, `RandomnessRequested`,
`RandomnessReceived`, `RaffleFinalized`, `RaffleCancelled`, `TicketRefunded`,
`ContractPaused`, `ContractUnpaused`, `AdminTransferProposed`,
`AdminTransferAccepted`.

All are covered end-to-end (real XDR → parser → handler) in
`event-parser.service.spec.ts`, and structurally in
`handlers/event-coverage.spec.ts`.

## The typed event union

`event.types.ts` defines `DomainEvent` as a **discriminated union keyed by the
contract event topic** (the symbol in `topics[0]`): a `ContractEventPayloadMap`
maps each topic to its decoded payload shape, and the union adds the `type`
discriminant plus a required `schemaVersion` to every entry. The parser returns
this union, so downstream code narrows once at compile time instead of
re-narrowing payloads by hand in every handler.

- `CONTRACT_EVENT_TOPICS` — exhaustive runtime list of topics.
- `EventOfType<T>` / `RaffleCreatedEvent` etc. — single-variant extracts.
- `EventPayload<E>` — a variant's payload without the tags; what
  `BaseEventHandler<E>.decode()` returns so the base class can stamp
  `type` + `schemaVersion` exactly once.
- `assertNever` — exhaustiveness guard for switches over the union.

The payload shapes mirror the contract ABI documented in
`sdk/src/contract/bindings.ts`. When the SDK ships machine-generated contract
bindings (`stellar contract bindings typescript … --output-dir
./src/contract/generated`), re-point `ContractEventPayloadMap` at those
generated types instead of re-declaring the shapes here a second time — the
map is the single seam.

## Adding a new event

1. Add the topic + payload shape to `ContractEventPayloadMap` in
   `event.types.ts` (this extends the `DomainEvent` union).
2. Add a handler in `handlers/` extending `BaseEventHandler<ThatEvent>` and
   implementing the typed `decode()`.
3. Register it in `event-handlers.module.ts` (`handlersByTopic` record).
4. Route it in `CursorAdvance.applyEvent` and the
   `DuplicateDetector.eventNeedsDatabase` / `getHandlerName` switches
   (the dispatcher still mirrors those switches for leftover helpers).
5. Add a decode test to `event-parser.service.spec.ts` and a fixture to
   `handlers/event-coverage.spec.ts`.

Steps 3–4 are enforced by the compiler: the `Record<ContractEventTopic, …>`
handler map and the exhaustive `never`-checked switches fail the build until
the new event is handled.

No changes to `EventParserService` are required.

### Custom handler sketch

```typescript
import { Injectable } from "@nestjs/common";
import { xdr } from "@stellar/stellar-sdk";
import { BaseEventHandler } from "./base-event.handler";
import { DomainEvent } from "../event.types";
import { RawSorobanEvent } from "../event-parser.interface";

@Injectable()
export class CustomEventHandler extends BaseEventHandler {
  constructor() {
    super("CustomEventName");
  }

  parse(
    topics: xdr.ScVal[],
    value: xdr.ScVal,
    rawEvent: RawSorobanEvent,
  ): DomainEvent | null {
    try {
      const id = this.toNumber(topics[1]);
      const address = this.toString(topics[2]);
      const data = this.toNative(value);
      if (id === null || address === null || !data) return null;
      return {
        type: "CustomEvent",
        id,
        address,
        customField: data.customField,
      } as DomainEvent;
    } catch {
      return null;
    }
  }
}
```

### Registration options

**Config file** (`config/event-handlers.json`):

```json
{
  "contracts": [
    {
      "address": "YOUR_CONTRACT_ADDRESS",
      "version": "v1",
      "description": "Your custom contract",
      "enabled": true,
      "eventHandlers": {
        "CustomEventName": "CustomEventHandler"
      }
    }
  ]
}
```

**Runtime:**

```typescript
eventHandlerRegistry.registerHandler("CONTRACT_ADDRESS", customHandler);
// or
eventHandlerRegistry.registerContractAtRuntime(contractConfig);
```

Env: `EVENT_HANDLER_CONFIG_PATH=config/event-handlers.json`

## Schema versioning (events, not the parser)

- Every parsed `DomainEvent` includes `schemaVersion` (defaults to `1`).
- `EventParserService` resolves the version via `resolveSchemaVersion` (see
  `handlers/schema-version.ts`).
- `EventHandlerRegistry` routes by `{ contractAddress, eventName, schemaVersion }`.
- Multiple handler versions for the same event can coexist for rolling upgrades.
- When no exact versioned handler exists, the registry falls back to schema
  version `1`.
- `raffle_events.schema_version` persists the parsed version for audit/replay.

```typescript
eventHandlerRegistry.registerHandler("CONTRACT_A", raffleCreatedV1Handler, 1);
eventHandlerRegistry.registerHandler("CONTRACT_A", raffleCreatedV2Handler, 2);
```

## Logging

1. **Handled** — successfully parsed
2. **Unhandled supported** — known contract, no handler for that event
3. **Unknown** — unregistered contract

```
[EventParserService] [unhandled_supported] Event "NewEventType" from known contract CDLZ...
[EventParserService] [unknown] Event "CustomEvent" from unknown contract ABCD...
[EventHandlerRegistry] Registered handler for CDLZ...: RaffleCreated
```

## Best practices

- One handler per event type; use `BaseEventHandler` utilities.
- Validate extracted data; return `null` rather than throwing.
- Prefer config or registry registration over editing the parser class.
- Unit-test each handler; add an end-to-end case in `event-parser.service.spec.ts`.

## Runtime management

```typescript
this.eventParser.getRegistry().registerContractAtRuntime(config);
this.eventParser.getRegistry().getRegisteredContracts();
this.eventParser.getRegistry().unregisterContract(address);
```

Prefer injecting `IEventParser` via `EVENT_PARSER` in production code paths.

## Historical note

An earlier monolithic `switch`-based parser was removed after the registry-based
implementation became the sole runtime parser. File and class names no longer
carry a `-v2` / `V2` suffix.
