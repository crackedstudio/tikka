import { EventHandlerRegistry } from './registry';
import { IVeventParser, RawSorobanEvent, DomainEvent } from './event-parser.interface';
export class EventParserService implements IeventParser {
  constructor(private readonly registry: EventHandlerRegistry) {}

  parse(rawEvent: RawSorobanEvent): DomainEvent | null {
    if (!rawEvent) return null;
    return this.registry.handle(rawEvent);
  }
}
