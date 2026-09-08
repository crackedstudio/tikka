export enum RaffleStatus {
  OPEN = "open",
  DRAWING = "drawing",
  FINALIZED = "finalized",
  CANCELLED = "cancelled",
}

export interface Raffle {
  id: number;
  creator: string;
  status: RaffleStatus;
  ticketPrice: string;
  asset: string;
  maxTickets: number;
  ticketsSold: number;
  endTime: number;
  winner: string | null;
  winningTicketId: number | null;
  prizeAmount: string | null;
  createdLedger: number;
  finalizedLedger: number | null;
  metadataCid: string | null;
}

export interface User {
  address: string;
  totalTicketsBought: number;
  totalRafflesEntered: number;
  totalRafflesWon: number;
  totalPrizeXlm: string;
  firstSeenLedger: number;
  lastTxHash: string | null;
}

export interface Ticket {
  id: number;
  raffleId: number;
  owner: string;
  purchasedAtLedger: number;
  purchaseTxHash: string;
  refunded: boolean;
  refundTxHash: string | null;
}

// On-chain event payload types
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
