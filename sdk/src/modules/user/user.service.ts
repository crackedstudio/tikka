import { Injectable } from '@nestjs/common';
import { ContractService } from '../../contract/contract.service';
import { ContractFn } from '../../contract/bindings';
import { UserParticipation, GetParticipationParams } from './user.types';
import { assertValidPublicKey } from '../../utils/validation';

@Injectable()
export class UserService {
  constructor(private readonly contractService: ContractService) {}

  /**
   * Retrieves user participation data from the Soroban contract.
   * Read-only — no signing required.
   */
  async getParticipation(params: GetParticipationParams): Promise<UserParticipation> {
    const { address } = params;
    assertValidPublicKey(address);

    const contractData = await this.contractService.simulateReadOnly<{
      total_raffles_entered: number;
      total_tickets_bought: number;
      total_raffles_won: number;
      raffle_ids: number[];
    }>(ContractFn.GET_USER_PARTICIPATION, [address]);

    return {
      address,
      totalRafflesEntered: contractData.total_raffles_entered,
      totalTicketsBought: contractData.total_tickets_bought,
      totalRafflesWon: contractData.total_raffles_won,
      raffleIds: contractData.raffle_ids,
    };
  }
}
