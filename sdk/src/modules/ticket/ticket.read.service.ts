import { Injectable } from '@nestjs/common';
import { ContractService } from '../../contract/contract.service';
import { ContractFn } from '../../contract/bindings';
import { GetUserTicketsParams } from './ticket.types';
import { ContractResponse } from '../../contract/response';
import { assertPositiveInt } from '../../utils/validation';
import { TikkaSdkError, TikkaSdkErrorCode } from '../../utils/errors';

/**
 * Read-only ticket queries — no wallet or signing dependencies required.
 * Suitable for public dashboards, SSR pages, and anywhere tickets need to be queried without a wallet.
 */
@Injectable()
export class TicketReadService {
  constructor(private readonly contractService: ContractService) {}

  /**
   * Gets all ticket IDs owned by a user for a specific raffle.
   * Read-only operation (no signing required).
   *
   * @throws TikkaSdkError if validation fails or query fails
   */
  async getUserTickets(
    params: GetUserTicketsParams,
  ): Promise<ContractResponse<number[]>> {
    const { raffleId, userAddress } = params;
    assertPositiveInt(raffleId, 'raffleId');

    if (!userAddress || typeof userAddress !== 'string') {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.InvalidParams,
        'userAddress must be a non-empty string',
      );
    }

    return this.contractService.simulateReadOnly<number[]>(
      ContractFn.GET_USER_TICKETS,
      [raffleId, userAddress],
    );
  }

  /**
   * Gets the count of tickets owned by a user for a specific raffle.
   * Read-only operation (no signing required).
   *
   * Convenience method that returns the count instead of the full ticket ID array.
   *
   * @throws TikkaSdkError if validation fails or query fails
   */
  async getUserTicketCount(
    params: GetUserTicketsParams,
  ): Promise<ContractResponse<number>> {
    const result = await this.getUserTickets(params);
    
    return {
      success: result.success,
      value: result.value?.length || 0,
      transactionHash: result.transactionHash,
      ledger: result.ledger,
      feePaid: result.feePaid,
    };
  }
}
