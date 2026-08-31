import { DEFAULT_HANDLERS } from './handlers';
import { RawSorobanEvent, DomainEvent } from './event-parser.interface';

export class EventHandlerRegistry {
  private handlers = new Map<string, any>();

  constructor() {
    for (const [name, Handler] of Object.entries(DEFAULT_HANDLERS)) {
      this.handlers.set(name, new Handler());
    }
  }

  handle(raw: RawSorobanEvent): DomainEvent | null {
    const name = raw.topics?[0] ? Buffer.from(raw.topics[0], 'base64').toString() : null;
    const handler = name ? this.handlers.get(name) : undefined;
    return handler ? handler.handle(raw) : null;
  }
}
