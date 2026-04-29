import { Injectable } from '@nestjs/common';
import { ContractService } from '../../contract/contract.service';
import { ContractFn } from '../../contract/bindings';
import { UserParticipation, GetParticipationParams } from './user.types';
import { assertValidPublicKey } from '../../utils/validation';

import { ContractResponse } from '../../contract/response';

@Injectable()
export class UserService {
  constructor(private readonly contractService: ContractService) {}

  /**
   * Retrieves user participation data from the Soroban contract.
   * Read-only — no signing required.
   */
  async getParticipation(params: GetParticipationParams): Promise<ContractResponse<UserParticipation>> {
    const { address } = params;
    assertValidPublicKey(address);

    const response = await this.contractService.simulateReadOnly<{
      total_raffles_entered: number;
      total_tickets_bought: number;
      total_raffles_won: number;
      raffle_ids: number[];
    }>(ContractFn.GET_USER_PARTICIPATION, [address]);

    if (!response.success) {
      return { success: false, error: response.error };
    }

    const contractData = response.value!;
    return {
      success: true,
      value: {
        address,
        totalRafflesEntered: contractData.total_raffles_entered,
        totalTicketsBought: contractData.total_tickets_bought,
        totalRafflesWon: contractData.total_raffles_won,
        raffleIds: contractData.raffle_ids,
      },
    };
  }
}
