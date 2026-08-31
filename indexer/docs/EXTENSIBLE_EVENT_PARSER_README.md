# Extensible Event Parser - Quick Start

## What's New?

The indexer now supports an extensible event parsing system that allows:
- ✅ Multiple contract support
- ✅ Dynamic handler registration
- ✅ Runtime contract management
- ✅ Third-party event schemas
- ✅ Configuration-based setup

## Quick Start

### 1. Using the New Parser

```typescript
import { EventParserV2Service } from './ingestor/event-parser-v2.service';

@Injectable()
export class MyService {
  constructor(private eventParser: EventParserV2Service) {}

  processEvent(rawEvent: RawSorobanEvent) {
    const parsed = this.eventParser.parse(rawEvent);
    if (parsed) {
      // Handle parsed event
    }
  }
}
```

### 2. Adding a New Contract

Edit `config/event-handlers.json`:

```json
{
  "contracts": [
    {
      "address": "YOUR_CONTRACT_ADDRESS",
      "version": "v1",
      "description": "My custom raffle contract",
      "enabled": true,
      "eventHandlers": {
        "RaffleCreated": "RaffleCreatedHandler",
        "CustomEvent": "CustomEventHandler"
      }
    }
  ]
}
```

### 3. Creating a Custom Handler

```typescript
// src/ingestor/handlers/custom-event.handler.ts
import { Injectable } from "@nestjs/common";
import { BaseEventHandler } from "./base-event.handler";

@Injectable()
export class CustomEventHandler extends BaseEventHandler {
  constructor() {
    super("CustomEvent");
  }

  parse(topics, value, rawEvent) {
    const id = this.toNumber(topics[1]);
    const data = this.toNative(value);
    
    return {
      type: "CustomEvent",
      id: id,
      data: data,
    };
  }
}
```

### 4. Runtime Registration

```typescript
// Register a contract at runtime
const config: ContractConfig = {
  address: "NEW_CONTRACT",
  version: "v1",
  enabled: true,
  eventHandlers: {
    "NewEvent": "NewEventHandler"
  }
};

eventParser.getRegistry().registerContractAtRuntime(config);
```

## Event Logging

The system categorizes events:

- **Handled**: Successfully parsed
- **Unhandled Supported**: From known contract, no handler
- **Unknown**: From unregistered contract

Example logs:
```
[EventParserV2Service] [unhandled_supported] Event "NewType" from known contract CDLZ...
[EventParserV2Service] [unknown] Event "CustomEvent" from unknown contract ABCD...
```

## Configuration

### Environment Variables

```bash
EVENT_HANDLER_CONFIG_PATH=config/event-handlers.json
```

### Contract Config Schema

```typescript
{
  address: string;        // Contract address
  version: string;        // Version identifier
  description?: string;   // Optional description
  enabled: boolean;       // Active/inactive
  eventHandlers?: {       // Event name -> Handler mapping
    [eventName: string]: string;
  }
}
```

## Migration from Legacy Parser

The old `EventParserService` still works. To migrate:

1. Import `EventParserV2Service` instead of `EventParserService`
2. Update dependency injection
3. Test thoroughly
4. No code changes needed - API is compatible

## Key Features

### 1. Multiple Contracts
Support different contracts with different event schemas.

### 2. Dynamic Registration
Add/remove contracts without restarting the service.

### 3. Extensible Handlers
Create custom handlers for any event type.

### 4. Configuration-Based
Manage contracts via JSON configuration.

### 5. Backward Compatible
Legacy parser still available.

## Common Tasks

### List Registered Contracts
```typescript
const contracts = eventParser.getRegistry().getRegisteredContracts();
```

### Check if Contract is Registered
```typescript
const isRegistered = eventParser.getRegistry().isContractRegistered(address);
```

### Unregister a Contract
```typescript
eventParser.getRegistry().unregisterContract(address);
```

### Register a Handler
```typescript
const handler = new CustomEventHandler();
eventParser.getRegistry().registerHandler(contractAddress, handler);
```

## Testing

```typescript
describe('CustomEventHandler', () => {
  it('should parse event correctly', () => {
    const handler = new CustomEventHandler();
    const result = handler.parse(mockTopics, mockValue, mockRawEvent);
    expect(result).toBeDefined();
    expect(result.type).toBe('CustomEvent');
  });
});
```

## Documentation

For detailed documentation, see:
- `EVENT_PARSER_EXTENSIBILITY.md` - Complete guide
- `src/ingestor/event-handler.interface.ts` - Interfaces
- `src/ingestor/handlers/` - Example handlers

## Architecture

```
RawSorobanEvent
    ↓
EventParserV2Service
    ↓
EventHandlerRegistry
    ↓
IEventHandler (contract-specific or default)
    ↓
DomainEvent
```

## Support

For issues or questions:
1. Check `EVENT_PARSER_EXTENSIBILITY.md`
2. Review example handlers in `src/ingestor/handlers/`
3. Check logs for `[unhandled_supported]` or `[unknown]` events

## Examples

See the `handlers/` directory for complete examples:
- `raffle-created.handler.ts`
- `ticket-purchased.handler.ts`
- `raffle-finalized.handler.ts`
- `all-handlers.ts`
