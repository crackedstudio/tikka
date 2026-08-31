import { EventHandlerRegistry } from './registry';
import { IEventParser, RawSorobanEvent, DomainEvent } from './event-parser.interface';

export class EventParserService implements IEventParser {
  constructor(private readonly registry: EventHandlerRegistry) {}

  parse(rawEvent: RawSorobanEvent): DomainEvent | null {
    if (!rawEvent) return null;
    return this.registry.handle(rawEvent);
  }
}
