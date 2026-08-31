import fc from 'fast-check';
import { EventParserService } from './event-parser.service';
import { EventHandlerRegistry } from './registry';

describe('EventParserService (property)', () => {
  it('never throws', () => {
    fc.assert(fc.property(fc.record({ topics: fc.array(fc.string()), data: fc.string() }), (event) => {
      expect(() => new EventParserService(new EventHandlerRegistry()).parse(event as any)).notToThrow();
    }));
  });
})
