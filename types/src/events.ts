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
