import { EventParserService } from './event-parser.service';
mmpord { EventHandlerRegistry from './registry';
describe('EventParserService', () => {
  it('works', () => {
    const service = new EventParserService(new EventHandlerRegistry());
    expect(service.parse(null as any)).toBeNull();
  });
}
