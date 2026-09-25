/**
 * Parameters for buying tickets
 */
export interface BuyTicketParams {
  raffleId: number;
  ticketCount: number;
  maxPricePerTicket: string; // Maximum price willing to pay (slippage protection)
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
