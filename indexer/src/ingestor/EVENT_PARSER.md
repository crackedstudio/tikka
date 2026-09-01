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

Covered end-to-end (real XDR → parser → handler) in `event-parser.service.spec.ts`.

## Adding a new event

1. Add the event shape to `event.types.ts` and the `DomainEvent` union.
2. Add an `IEventHandler` in `handlers/` (extend `BaseEventHandler`).
3. Register it in `event-handlers.module.ts`.
4. Add a decode test to `event-parser.service.spec.ts`.

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
