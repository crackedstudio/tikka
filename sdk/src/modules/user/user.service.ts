import { Injectable } from '@nestjs/common';
import { nativeToScVal } from '@stellar/stellar-sdk';
import { ContractService } from '../../contract/contract.service';
import { UserParticipation, GetParticipationParams } from './user.types';

@Injectable()
export class UserService {
  constructor(private readonly contractService: ContractService) {}

  /**
   * Retrieves user participation data from the Soroban contract.
   * This is a read-only operation that does not require signing.
   *
   * @remarks
   * Calls the contract's `get_user_participation` function via simulation.
   * For complete historical data (timestamps, transaction details, etc.),
   * use the backend/indexer API instead.
   */
  async getParticipation(params: GetParticipationParams): Promise<UserParticipation> {
    const { address } = params;

    const contractData = await this.contractService.simulateReadOnly<{
      total_raffles_entered: number;
      total_tickets_bought: number;
      total_raffles_won: number;
      raffle_ids: number[];
    }>('get_user_participation', [nativeToScVal(address, { type: 'address' })]);

    return {
      address,
      totalRafflesEntered: contractData.total_raffles_entered,
      totalTicketsBought: contractData.total_tickets_bought,
      totalRafflesWon: contractData.total_raffles_won,
      raffleIds: contractData.raffle_ids,
    };
  }
}
