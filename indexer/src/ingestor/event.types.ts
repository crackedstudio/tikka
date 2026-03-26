export interface RaffleCreatedEvent {
  type: "RaffleCreated";
  raffle_id: number;
  creator: string;
  params: any;
}

export interface TicketPurchasedEvent {
  type: "TicketPurchased";
  raffle_id: number;
  buyer: string;
  ticket_ids: number[];
  total_paid: string;
}

export interface DrawTriggeredEvent {
  type: "DrawTriggered";
  raffle_id: number;
  ledger: number;
}

export interface RandomnessRequestedEvent {
  type: "RandomnessRequested";
  raffle_id: number;
  request_id: number;
}

export interface RandomnessReceivedEvent {
  type: "RandomnessReceived";
  raffle_id: number;
  seed: string;
  proof: string;
}

export interface RaffleFinalizedEvent {
  type: "RaffleFinalized";
  raffle_id: number;
  winner: string;
  winning_ticket_id: number;
  prize_amount: string;
}

export interface RaffleCancelledEvent {
  type: "RaffleCancelled";
  raffle_id: number;
  reason: string;
}

export interface TicketRefundedEvent {
  type: "TicketRefunded";
  raffle_id: number;
  ticket_id: number;
  recipient: string;
  amount: string;
}

export type DomainEvent =
  | RaffleCreatedEvent
  | TicketPurchasedEvent
  | DrawTriggeredEvent
  | RandomnessRequestedEvent
  | RandomnessReceivedEvent
  | RaffleFinalizedEvent
  | RaffleCancelledEvent
  | TicketRefundedEvent;
