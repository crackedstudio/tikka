# Event Parser Extensibility Guide

## Overview

The indexer now supports an extensible event parsing system that allows dynamic registration of event handlers for multiple contracts. This enables support for third-party raffle contracts with different event schemas without modifying core code.

## Architecture

The system follows the **Event-Driven Architecture** pattern with a **Registry Pattern** for handler management.

### Key Components

1. **EventHandlerRegistry** - Central registry managing all event handlers
2. **IEventHandler** - Interface that all event handlers must implement
3. **BaseEventHandler** - Abstract base class providing common utilities
4. **EventParserV2Service** - New parser service using the registry
5. **Configuration System** - JSON-based configuration for contracts and handlers

## Directory Structure

```
indexer/src/ingestor/
├── event-handler.interface.ts       # Core interfaces
├── event-handler-registry.service.ts # Registry implementation
├── event-parser-v2.service.ts       # New extensible parser
├── event-parser.service.ts          # Legacy parser (backward compatible)
├── handlers/
│   ├── base-event.handler.ts        # Base handler class
│   ├── raffle-created.handler.ts    # Example handler
│   ├── ticket-purchased.handler.ts  # Example handler
│   ├── raffle-finalized.handler.ts  # Example handler
│   └── index.ts                     # Handler exports
└── event.types.ts                   # Event type definitions

indexer/config/
└── event-handlers.json              # Contract and handler configuration
```

## Creating Custom Event Handlers

### Step 1: Implement IEventHandler

Create a new handler class that extends `BaseEventHandler`:

```typescript
import { Injectable } from "@nestjs/common";
import { xdr } from "@stellar/stellar-sdk";
import { BaseEventHandler } from "./base-event.handler";
import { DomainEvent } from "../event.types";
import { RawSorobanEvent } from "../event-parser.service";

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
      // Extract data from topics and value
      const id = this.toNumber(topics[1]);
      const address = this.toString(topics[2]);
      const data = this.toNative(value);

      if (id === null || address === null || !data) {
        this.logger.warn("Failed to parse CustomEvent: missing data");
        return null;
      }

      // Return typed domain event
      return {
        type: "CustomEvent",
        id: id,
        address: address,
        customField: data.customField,
      };
    } catch (error) {
      this.logger.error(`Error parsing CustomEvent: ${error.message}`);
      return null;
    }
  }
}
```

### Step 2: Define Event Type

Add your event type to `event.types.ts`:

```typescript
export interface CustomEvent {
  type: "CustomEvent";
  id: number;
  address: string;
  customField: any;
}

// Add to DomainEvent union
export type DomainEvent =
  | RaffleCreatedEvent
  | TicketPurchasedEvent
  // ... other events
  | CustomEvent;
```

### Step 3: Register Handler

#### Option A: Configuration File

Add to `config/event-handlers.json`:

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

#### Option B: Runtime Registration

```typescript
// In your service or module
const customHandler = new CustomEventHandler();
eventHandlerRegistry.registerHandler("CONTRACT_ADDRESS", customHandler);
```

#### Option C: Dynamic Registration

```typescript
// Register entire contract at runtime
const contractConfig: ContractConfig = {
  address: "NEW_CONTRACT_ADDRESS",
  version: "v1",
  description: "Dynamically added contract",
  enabled: true,
  eventHandlers: {
    CustomEvent: "CustomEventHandler",
  },
};

eventHandlerRegistry.registerContractAtRuntime(contractConfig);
```

## Configuration

### Contract Configuration Schema

```typescript
interface ContractConfig {
  address: string;           // Contract address/ID
  version: string;           // Contract version (e.g., "v1", "v2")
  description?: string;      // Optional description
  enabled: boolean;          // Whether this contract is active
  eventHandlers?: Record<string, string>; // Event name -> Handler class name
}
```

### Environment Variables

```bash
# Path to event handler configuration file
EVENT_HANDLER_CONFIG_PATH=config/event-handlers.json
```

## Event Handling Flow

```
1. Raw Soroban Event
   ↓
2. EventParserV2Service.parse()
   ↓
3. Extract contract address and event name
   ↓
4. EventHandlerRegistry.parseEvent()
   ↓
5. Find appropriate handler (contract-specific or default)
   ↓
6. Handler.parse() - Convert to DomainEvent
   ↓
7. Return typed DomainEvent or null
```

## Logging and Monitoring

### Event Categories

The system logs events in three categories:

1. **Handled** - Successfully parsed events
2. **Unhandled Supported** - Events from known contracts without handlers
3. **Unknown** - Events from unregistered contracts

### Log Examples

```
[EventParserV2Service] [unhandled_supported] Event "NewEventType" from known contract CDLZ...
[EventParserV2Service] [unknown] Event "CustomEvent" from unknown contract ABCD...
[EventHandlerRegistry] Registered handler for CDLZ...: RaffleCreated
```

## Best Practices

### 1. Handler Design

- Keep handlers focused on a single event type
- Use `BaseEventHandler` utilities for safe type conversion
- Always validate extracted data before returning
- Log errors with context for debugging

### 2. Error Handling

```typescript
parse(topics, value, rawEvent): DomainEvent | null {
  try {
    // Parsing logic
    const data = this.toNative(value);
    
    // Validate
    if (!data || !data.requiredField) {
      this.logger.warn("Missing required field");
      return null;
    }
    
    return { /* domain event */ };
  } catch (error) {
    this.logger.error(`Parse error: ${error.message}`);
    return null;
  }
}
```

### 3. Versioning

Support multiple contract versions:

```json
{
  "contracts": [
    {
      "address": "CONTRACT_V1",
      "version": "v1",
      "eventHandlers": { "Event": "EventHandlerV1" }
    },
    {
      "address": "CONTRACT_V2",
      "version": "v2",
      "eventHandlers": { "Event": "EventHandlerV2" }
    }
  ]
}
```

### 4. Testing

Create unit tests for each handler:

```typescript
describe('CustomEventHandler', () => {
  let handler: CustomEventHandler;

  beforeEach(() => {
    handler = new CustomEventHandler();
  });

  it('should parse valid event', () => {
    const topics = [/* mock topics */];
    const value = /* mock value */;
    const result = handler.parse(topics, value, mockRawEvent);
    
    expect(result).toBeDefined();
    expect(result.type).toBe('CustomEvent');
  });

  it('should return null for invalid data', () => {
    const result = handler.parse([], null, mockRawEvent);
    expect(result).toBeNull();
  });
});
```

## Migration from Legacy Parser

### Backward Compatibility

The legacy `EventParserService` remains available for backward compatibility. To migrate:

1. Keep using `EventParserService` for existing code
2. Gradually migrate to `EventParserV2Service`
3. Register default handlers in the registry
4. Test thoroughly before switching

### Migration Steps

```typescript
// Old way
@Injectable()
export class MyService {
  constructor(private eventParser: EventParserService) {}
  
  process(event: RawSorobanEvent) {
    const parsed = this.eventParser.parse(event);
  }
}

// New way
@Injectable()
export class MyService {
  constructor(private eventParser: EventParserV2Service) {}
  
  process(event: RawSorobanEvent) {
    const parsed = this.eventParser.parse(event);
  }
}
```

## Runtime Management

### Adding Contracts Dynamically

```typescript
// Via API endpoint or admin interface
@Post('contracts/register')
async registerContract(@Body() config: ContractConfig) {
  this.eventParser.getRegistry().registerContractAtRuntime(config);
  return { success: true };
}
```

### Listing Registered Contracts

```typescript
@Get('contracts')
async listContracts() {
  return this.eventParser.getRegistry().getRegisteredContracts();
}
```

### Unregistering Contracts

```typescript
@Delete('contracts/:address')
async unregisterContract(@Param('address') address: string) {
  this.eventParser.getRegistry().unregisterContract(address);
  return { success: true };
}
```

## Advanced Usage

### Custom Handler Factory

Create a factory for dynamic handler instantiation:

```typescript
export class EventHandlerFactory {
  private handlers = new Map<string, () => IEventHandler>();

  register(name: string, factory: () => IEventHandler) {
    this.handlers.set(name, factory);
  }

  create(name: string): IEventHandler | null {
    const factory = this.handlers.get(name);
    return factory ? factory() : null;
  }
}
```

### Middleware Pattern

Add preprocessing or postprocessing:

```typescript
export class EventHandlerMiddleware {
  constructor(private handler: IEventHandler) {}

  parse(topics, value, rawEvent): DomainEvent | null {
    // Preprocessing
    const preprocessed = this.preprocess(rawEvent);
    
    // Parse
    const result = this.handler.parse(topics, value, preprocessed);
    
    // Postprocessing
    return this.postprocess(result);
  }
}
```

## Troubleshooting

### Handler Not Found

**Problem**: Event not being parsed despite handler registration

**Solutions**:
1. Check contract address matches exactly
2. Verify event name matches (case-sensitive)
3. Ensure handler is registered before events arrive
4. Check configuration file is loaded correctly

### Parse Errors

**Problem**: Handler throws errors during parsing

**Solutions**:
1. Add null checks for all extracted data
2. Use `BaseEventHandler` utility methods
3. Add try-catch blocks
4. Log detailed error information

### Performance Issues

**Problem**: Slow event processing

**Solutions**:
1. Cache handler instances
2. Optimize handler logic
3. Use batch processing
4. Profile handler execution time

## Examples

See the `handlers/` directory for complete examples:
- `raffle-created.handler.ts` - Basic event parsing
- `ticket-purchased.handler.ts` - Array handling
- `raffle-finalized.handler.ts` - Complex data structures

## References

- [Event-Driven Architecture](https://martinfowler.com/articles/201701-event-driven.html)
- [Registry Pattern](https://martinfowler.com/eaaCatalog/registry.html)
- [Stellar SDK Documentation](https://stellar.github.io/js-stellar-sdk/)
- [NestJS Modules](https://docs.nestjs.com/modules)
