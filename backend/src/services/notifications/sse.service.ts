import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';

export interface TicketCountEvent {
  raffleId: number;
  ticketsSold: number;
}

@Injectable()
export class SseService {
  private readonly subjects = new Map<number, Subject<TicketCountEvent>>();

  /** Get or create a Subject for the given raffle */
  private getSubject(raffleId: number): Subject<TicketCountEvent> {
    if (!this.subjects.has(raffleId)) {
      this.subjects.set(raffleId, new Subject<TicketCountEvent>());
    }
    return this.subjects.get(raffleId)!;
  }

  /** Emit a ticket count update to all subscribers of this raffle */
  emit(raffleId: number, ticketsSold: number): void {
    if (this.subjects.has(raffleId)) {
      this.subjects.get(raffleId)!.next({ raffleId, ticketsSold });
    }
  }

  /** Subscribe to events for a given raffle */
  subscribe(raffleId: number): Subject<TicketCountEvent> {
    return this.getSubject(raffleId);
  }
}
