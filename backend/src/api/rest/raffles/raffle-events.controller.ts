import { Controller, Headers, Param, ParseIntPipe, Sse } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { Observable, map } from 'rxjs';
import { TICKET_COUNT_UPDATED_EVENT, type TicketCountUpdatedPayload } from '@tikka/types';
import { Public } from '../../../auth/decorators/public.decorator';
import { SseService } from '../../../services/notifications/sse.service';

interface TicketCountSseFrame {
  id: string;
  type: typeof TICKET_COUNT_UPDATED_EVENT;
  data: TicketCountUpdatedPayload;
}

@ApiTags('Raffles')
@Controller('raffles')
export class RaffleEventsController {
  constructor(private readonly sseService: SseService) {}

  /**
   * GET /raffles/:id/events — Server-sent events stream of ticket-count updates.
   * Excluded from OpenAPI so the published spec stays unchanged.
   */
  @Public()
  @ApiExcludeEndpoint()
  @Sse(':id/events')
  stream(
    @Param('id', ParseIntPipe) id: number,
    @Headers('last-event-id') lastEventId?: string,
  ): Observable<TicketCountSseFrame> {
    return this.sseService.subscribe(id, lastEventId).pipe(
      map(({ id: eventId, data }) => ({
        id: eventId,
        type: TICKET_COUNT_UPDATED_EVENT,
        data,
      })),
    );
  }
}
