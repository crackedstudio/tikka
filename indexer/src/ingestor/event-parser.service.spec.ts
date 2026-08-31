import { EventParserService } from './event-parser.service';
import { EventHandlerRegistry } from './registry';

describe('EventParserService', () => {
  it('works', () => {
    const service = new EventParserService(new EventHandlerRegistry());
    expect(service.parse(null as any)).toBeNull();
  });
})
