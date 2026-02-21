import { Injectable } from '@nestjs/common';
import { ContractService } from '../../contract/contract.service';
import { UserParticipation, GetParticipationParams } from './user.types';

@Injectable()
export class UserService {
  constructor(private readonly contractService: ContractService) {}

  /**
   * Retrieves user participation data from the Soroban contract.
   * This is a read-only operation that does not require signing.
   * 
   * @param params - Object containing the user's Stellar address
   * @returns UserParticipation object with raffle history summary
   * 
   * @remarks
   * This method calls the contract's `get_user_participation` function via simulation.
   * For complete historical data (timestamps, transaction details, etc.), 
   * use the backend/indexer API instead.
   */
  async getParticipation(params: GetParticipationParams): Promise<UserParticipation> {
    const { address } = params;

    try {
      // Call contract get_user_participation via read-only simulation
      const contractData = await this.contractService.simulateReadOnly<{
        total_raffles_entered: number;
        total_tickets_bought: number;
        total_raffles_won: number;
        raffle_ids: number[];
      }>('get_user_participation', [address]);

      // Map contract response to UserParticipation type
      return {
        address,
        totalRafflesEntered: contractData.total_raffles_entered,
        totalTicketsBought: contractData.total_tickets_bought,
        totalRafflesWon: contractData.total_raffles_won,
        raffleIds: contractData.raffle_ids,
      };
    } catch (error) {
      throw new Error(`Failed to fetch participation for ${address}: ${error.message}`);
    }
  }
}
