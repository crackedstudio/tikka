import { EventParserService } from './event-parser.service';

export class EventDispatcher {
  constructor(private readonly parser: EventParserService) {}

  dispatch(raw: any) {
    return this.parser.parse(raw);
  }
}
