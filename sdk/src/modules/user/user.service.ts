import { Injectable } from '@nestjs/common';
import { ContractService } from '../../contract/contract.service';
import { ContractFn } from '../../contract/bindings';
import { UserParticipation, GetParticipationParams } from './user.types';
import { assertValidPublicKey } from '../../utils/validation';

import { ContractResponse } from '../../contract/response';

/**
 * @category User
 * @remarks
 * Service for querying user participation data on the Tikka raffle contract.
 * Provides read-only access to user participation statistics including
 * raffle count, ticket purchases, and win history.
 *
 * @example
 * ```ts
 * const userService = app.get(UserService);
 *
 * // Get user's participation data
 * const result = await userService.getParticipation({
 *   address: 'GBIQ4VH3TRO5A72SCCSHV5QZJVUHMFAZVD5K4PIWL3RBQFKBDLPHJ36'
 * });
 *
 * if (result.success && result.value) {
 *   console.log('User participation:');
 *   console.log(`  - Raffles entered: ${result.value.totalRafflesEntered}`);
 *   console.log(`  - Tickets bought: ${result.value.totalTicketsBought}`);
 *   console.log(`  - Raffles won: ${result.value.totalRafflesWon}`);
 *   console.log(`  - Raffle IDs: ${result.value.raffleIds.join(', ')}`);
 * }
 * ```
 */
@Injectable()
export class UserService {
  constructor(private readonly contractService: ContractService) {}

  /**
   * Retrieves user participation data from the Soroban contract.
   * Aggregates all user's raffle and ticket activity on the contract.
   * Read-only — no signing required.
   *
   * @param params - Parameters containing the user's Stellar public key
   * @returns Promise containing user participation statistics
   * @throws Will reject if address is invalid
   *
   * @example
   * ```ts
   * const participation = await userService.getParticipation({
   *   address: userAddress
   * });
   *
   * if (participation.success) {
   *   console.log(`${participation.value?.totalTicketsBought} tickets purchased`);
   *   console.log(`Participated in raffles: ${participation.value?.raffleIds}`);
   * }
   * ```
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
