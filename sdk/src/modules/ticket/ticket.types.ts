export interface BuyTicketParams {
  raffleId: number;
  quantity: number;
}

export interface BuyTicketResult {
  ticketIds: number[];
  txHash: string;
  ledger: number;
  feePaid: string;
}

export interface RefundTicketParams {
  raffleId: number;
  ticketId: number;
}

export interface RefundTicketResult {
  txHash: string;
  ledger: number;
}

export interface GetUserTicketsParams {
  raffleId: number;
  userAddress: string;
}
