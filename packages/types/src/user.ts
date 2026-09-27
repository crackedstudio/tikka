export interface User {
  address: string;
  totalTicketsBought: number;
  totalRafflesEntered: number;
  totalRafflesWon: number;
  totalPrizeXlm: string;
  firstSeenLedger: number;
  lastTxHash: string | null;
}
