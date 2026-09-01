import { Controller, Param, ParseIntPipe, Sse } from "@nestjs/common";
import { ApiExcludeEndpoint, ApiTags } from "@nestjs/swagger";
import { Observable, map } from "rxjs";
import { Public } from "../../../auth/decorators/public.decorator";
import { SseService } from "../../../services/sse.service";

@ApiTags("Raffles")
@Controller("raffles")
export class RaffleEventsController {
  constructor(private readonly sseService: SseService) {}

  /**
   * GET /raffles/:id/events — Server-sent events stream of ticket-count updates.
   * Excluded from OpenAPI so the published spec stays unchanged.
   */
  @Public()
  @ApiExcludeEndpoint()
  @Sse(":id/events")
  stream(@Param("id", ParseIntPipe) id: number): Observable<MessageEvent> {
    return this.sseService.subscribe(id).pipe(
      map(
        (data) =>
          ({
            data,
          }) as MessageEvent,
      ),
    );
  }
}
