export interface RaffleCreatedEvent {
  raffleId: number;
  creator: string;
  metadataId: string;
  ticketPrice: string;
  totalTickets: number;
  endTime: number;
}

export interface TicketPurchasedEvent {
  raffleId: number;
  buyer: string;
  ticketCount: number;
  totalCost: string;
  ticketsSoldTotal: number;
}

export interface RaffleEndedEvent {
  raffleId: number;
  winner: string;
  totalTicketsSold: number;
  prizeAmount: string;
}

export interface RaffleCancelledEvent {
  raffleId: number;
}

export const TICKET_COUNT_UPDATED_EVENT = 'ticket_count_updated';

export interface TicketCountUpdatedPayload {
  raffleId: number;
  ticketsSold: number;
  updatedAt: number;
}
