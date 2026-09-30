import { Injectable } from '@nestjs/common';
import type { TicketCountUpdatedPayload } from '@tikka/types';
import { Observable, Subject } from 'rxjs';

interface TicketCountStreamEvent {
  id: string;
  data: TicketCountUpdatedPayload;
}

@Injectable()
export class SseService {
  private readonly subjects = new Map<number, Subject<TicketCountStreamEvent>>();
  private readonly eventIds = new Map<number, number>();
  private readonly eventHistory = new Map<number, TicketCountStreamEvent[]>();
  private readonly historyLimit = 100;

  /** Get or create a Subject for the given raffle */
  private getSubject(raffleId: number): Subject<TicketCountStreamEvent> {
    if (!this.subjects.has(raffleId)) {
      this.subjects.set(raffleId, new Subject<TicketCountStreamEvent>());
    }
    return this.subjects.get(raffleId)!;
  }

  /** Emit a ticket count update to all subscribers of this raffle */
  emit(raffleId: number, ticketsSold: number): void {
    const id = (this.eventIds.get(raffleId) ?? 0) + 1;
    this.eventIds.set(raffleId, id);

    const event: TicketCountStreamEvent = {
      id: String(id),
      data: { raffleId, ticketsSold, updatedAt: Date.now() },
    };
    const history = this.eventHistory.get(raffleId) ?? [];
    history.push(event);
    if (history.length > this.historyLimit) history.shift();
    this.eventHistory.set(raffleId, history);
    this.getSubject(raffleId).next(event);
  }

  /** Subscribe to events, replaying updates newer than a valid reconnect cursor. */
  subscribe(raffleId: number, lastEventId?: string): Observable<TicketCountStreamEvent> {
    const lastId = lastEventId && /^\d+$/.test(lastEventId) ? Number(lastEventId) : undefined;

    return new Observable((observer) => {
      let cursor = lastId ?? this.eventIds.get(raffleId) ?? 0;
      const subscription = this.getSubject(raffleId).subscribe((event) => {
        const eventId = Number(event.id);
        if (eventId > cursor) {
          cursor = eventId;
          observer.next(event);
        }
      });

      if (lastId !== undefined) {
        const history = this.eventHistory.get(raffleId) ?? [];
        const oldestId = history.length ? Number(history[0].id) : undefined;
        const replay =
          oldestId !== undefined && lastId < oldestId - 1
            ? history.slice(-1)
            : history.filter((event) => Number(event.id) > lastId);
        replay.forEach((event) => {
          const eventId = Number(event.id);
          if (eventId > cursor) {
            cursor = eventId;
            observer.next(event);
          }
        });
      }

      return () => subscription.unsubscribe();
    });
  }
}
