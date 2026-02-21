export interface UserParticipation {
  address: string;
  totalRafflesEntered: number;
  totalTicketsBought: number;
  totalRafflesWon: number;
  raffleIds: number[];
}

export interface GetParticipationParams {
  address: string;
}
