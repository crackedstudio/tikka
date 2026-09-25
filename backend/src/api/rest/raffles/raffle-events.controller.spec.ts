import { Test, TestingModule } from '@nestjs/testing';
import { firstValueFrom, take } from 'rxjs';
import { TICKET_COUNT_UPDATED_EVENT } from '@tikka/types';
import { RaffleEventsController } from './raffle-events.controller';
import { SseService } from '../../../services/notifications/sse.service';

describe('RaffleEventsController', () => {
  let controller: RaffleEventsController;
  let sseService: SseService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RaffleEventsController],
      providers: [SseService],
    }).compile();

    controller = module.get(RaffleEventsController);
    sseService = module.get(SseService);
  });

  it('emits a named ticket-count frame matching the shared payload contract', (done) => {
    const subscription = controller.stream(42).subscribe((frame) => {
      expect(frame.id).toBe('1');
      expect(frame.type).toBe(TICKET_COUNT_UPDATED_EVENT);
      expect(frame.data).toEqual({
        raffleId: 42,
        ticketsSold: 7,
        updatedAt: expect.any(Number),
      });
      subscription.unsubscribe();
      done();
    });

    sseService.emit(42, 7);
  });

  it('replays updates newer than Last-Event-ID after reconnect', async () => {
    sseService.emit(42, 6);
    sseService.emit(42, 7);

    const frame = await firstValueFrom(controller.stream(42, '1').pipe(take(1)));
    expect(frame.id).toBe('2');
    expect(frame.data.ticketsSold).toBe(7);
  });
});
