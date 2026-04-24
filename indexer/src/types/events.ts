export interface TicketPurchasedEvent {
    tx_hash: string;
    raffle_id: string;
    ticket_ids: string[]; // Array of individual ticket IDs
    buyer: string;
    amount: number; // Total amount or per-ticket amount
    timestamp: number;
  }
  
  export interface TicketRefundedEvent {
    refund_tx_hash: string;
    raffle_id: string;
    ticket_ids: string[];
    refund_amount: number;
    timestamp: number;
  }