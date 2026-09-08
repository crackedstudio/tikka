import { Test, TestingModule } from '@nestjs/testing';
import { Subject } from 'rxjs';
import { RaffleEventsController } from './raffle-events.controller';
import { SseService, TicketCountEvent } from '../../../services/sse.service';

describe('RaffleEventsController', () => {
  let controller: RaffleEventsController;
  let subject: Subject<TicketCountEvent>;

  beforeEach(async () => {
    subject = new Subject<TicketCountEvent>();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RaffleEventsController],
      providers: [
        {
          provide: SseService,
          useValue: {
            subscribe: jest.fn().mockReturnValue(subject),
          },
        },
      ],
    }).compile();

    controller = module.get(RaffleEventsController);
  });

  it('streams ticket count events for a raffle', (done) => {
    const stream$ = controller.stream(42);
    stream$.subscribe({
      next: (event) => {
        expect(event.data).toEqual({ raffleId: 42, ticketsSold: 7 });
        done();
      },
    });
    subject.next({ raffleId: 42, ticketsSold: 7 });
  });
});
