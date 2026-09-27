import { EventParserService } from './event-parser.service';
import { RawSorobanEvent } from './event-parser.interface';

export class EventDispatcher {
  constructor(private readonly parser: EventParserService) {}

  dispatch(raw: RawSorobanEvent) {
    return this.parser.parse(raw);
  }
}
