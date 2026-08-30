/**
 * Parameters for buying tickets
 */
export interface BuyTicketParams {
  raffleId: number;
  ticketCount: number;
  maxPricePerTicket: string; // Maximum price willing to pay (slippage protection)
}
