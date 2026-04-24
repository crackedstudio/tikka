export interface UserParticipation {
  /** User's Stellar G... public key */
  address: string;
  totalRafflesEntered: number;
  /** Total tickets bought across all raffles */
  totalTicketsBought: number;
  totalRafflesWon: number;
  raffleIds: number[];
}

export interface GetParticipationParams {
  /**
   * User's Stellar G... public key.
   * Validated against Ed25519 format before contract call.
   */
  address: string;
}
