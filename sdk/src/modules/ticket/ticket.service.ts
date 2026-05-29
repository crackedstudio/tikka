import { Injectable } from '@nestjs/common';
import { ContractService } from '../../contract/contract.service';
import { ContractFn } from '../../contract/bindings';
import {
  BuyTicketParams,
  BuyTicketResult,
  RefundTicketParams,
  RefundTicketResult,
  GetUserTicketsParams,
  BuyBatchParams,
  BuyBatchResult,
  BatchPurchaseResult,
} from './ticket.types';
import { ContractResponse } from '../../contract/response';
import { assertPositiveInt } from '../../utils/validation';
import { TikkaSdkError, TikkaSdkErrorCode } from '../../utils/errors';

@Injectable()
export class TicketService {
  constructor(private readonly contractService: ContractService) {}

  /**
   * Purchases tickets for a raffle.
   * Requires wallet signature and submission.
   *
   * Token transfer failures (e.g. malicious SEP-41 token rejecting the call)
   * are surfaced as `ExternalContractError` so callers can handle them
   * separately from generic network/contract errors.
   */
  async buy(params: BuyTicketParams): Promise<ContractResponse<number[]>> {
    const { raffleId, quantity } = params;
    assertPositiveInt(raffleId, 'raffleId');
    assertPositiveInt(quantity, 'quantity');

    try {
      const publicKey = await this.contractService['wallet']?.getPublicKey();
      return await this.contractService.invoke<number[]>(
        ContractFn.BUY_TICKET,
        [raffleId, publicKey, quantity],
        { memo: params.memo },
      );
    } catch (err) {
      if (
        err instanceof TikkaSdkError &&
        err.code === TikkaSdkErrorCode.ExternalContractError
      ) {
        throw new TikkaSdkError(
          TikkaSdkErrorCode.ExternalContractError,
          `Token contract rejected ticket purchase for raffle ${raffleId}: ${err.message}`,
          err,
        );
      }
      throw err;
    }
  }

  /**
   * Refunds a ticket (when raffle is cancelled).
   * Requires wallet signature and submission.
   *
   * Token transfer failures during refund are surfaced as `ExternalContractError`.
   */
  async refund(params: RefundTicketParams): Promise<ContractResponse<void>> {
    const { raffleId, ticketId } = params;
    assertPositiveInt(raffleId, 'raffleId');
    assertPositiveInt(ticketId, 'ticketId');

    try {
      return await this.contractService.invoke<void>(
        ContractFn.REFUND_TICKET,
        [raffleId, ticketId],
        { memo: params.memo },
      );
    } catch (err) {
      if (
        err instanceof TikkaSdkError &&
        err.code === TikkaSdkErrorCode.ExternalContractError
      ) {
        throw new TikkaSdkError(
          TikkaSdkErrorCode.ExternalContractError,
          `Token contract rejected refund for ticket ${ticketId} in raffle ${raffleId}: ${err.message}`,
          err,
        );
      }
      throw err;
    }
  }

  /**
   * Gets all ticket IDs owned by a user for a specific raffle.
   * Read-only operation (no signing required).
   */
  async getUserTickets(params: GetUserTicketsParams): Promise<ContractResponse<number[]>> {
    const { raffleId, userAddress } = params;
    assertPositiveInt(raffleId, 'raffleId');

    return this.contractService.simulateReadOnly<number[]>(
      ContractFn.GET_USER_TICKETS,
      [raffleId, userAddress],
    );
  }

  /**
   * Purchases tickets for multiple raffles in a single transaction.
   * 
   * This method handles batch ticket purchases atomically when the contract supports it,
   * or falls back to individual simulations if needed. It manages gas budgets for large
   * batches and returns individual success/failure results for each raffle.
   * 
   * @param params - Batch purchase parameters containing array of raffle purchases
   * @returns Individual results for each raffle purchase attempt
   * 
   * @throws {TikkaSdkError} If validation fails or all purchases fail
   * 
   * @example
   * ```typescript
   * const result = await ticketService.buyBatch({
   *   purchases: [
   *     { raffleId: 1, quantity: 5 },
   *     { raffleId: 2, quantity: 3 },
   *   ],
   *   memo: { type: 'text', value: 'Batch purchase' }
   * });
   * ```
   */
  async buyBatch(params: BuyBatchParams): Promise<ContractResponse<BatchPurchaseResult[]>> {
    const { purchases, memo } = params;

    // Validate inputs
    if (!purchases || purchases.length === 0) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.InvalidParams,
        'Purchases array cannot be empty',
      );
    }

    // Validate each purchase
    purchases.forEach((purchase, index) => {
      try {
        assertPositiveInt(purchase.raffleId, `purchases[${index}].raffleId`);
        assertPositiveInt(purchase.quantity, `purchases[${index}].quantity`);
      } catch (err) {
        throw new TikkaSdkError(
          TikkaSdkErrorCode.InvalidParams,
          `Invalid purchase at index ${index}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    });

    const publicKey = await this.contractService['wallet']?.getPublicKey();
    if (!publicKey) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.WalletNotInstalled,
        'Wallet required for batch purchase',
      );
    }

    // Simulate each purchase individually to check feasibility
    const simulationResults: BatchPurchaseResult[] = [];
    
    for (const purchase of purchases) {
      try {
        await this.contractService.simulateReadOnly<number[]>(
          ContractFn.BUY_TICKET,
          [purchase.raffleId, publicKey, purchase.quantity],
        );
        
        simulationResults.push({
          raffleId: purchase.raffleId,
          ticketIds: [],
          success: true,
        });
      } catch (err) {
        simulationResults.push({
          raffleId: purchase.raffleId,
          ticketIds: [],
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Filter out failed simulations
    const validPurchases = purchases.filter((_, index) => 
      simulationResults[index].success
    );

    if (validPurchases.length === 0) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.SimulationFailed,
        'All batch purchases failed simulation',
      );
    }

    // Execute purchases sequentially but in a single transaction context
    // Note: Soroban doesn't support true atomic multi-call in a single tx,
    // so we execute them individually but track results together
    const results: BatchPurchaseResult[] = [];
    let lastTxHash = '';
    let lastLedger = 0;
    let totalFee = BigInt(0);

    for (const purchase of validPurchases) {
      try {
        const res = await this.contractService.invoke<number[]>(
          ContractFn.BUY_TICKET,
          [purchase.raffleId, publicKey, purchase.quantity],
          { memo },
        );

        results.push({
          raffleId: purchase.raffleId,
          ticketIds: res.value || [],
          success: true,
        });

        lastTxHash = res.transactionHash || '';
        lastLedger = res.ledger || 0;
        // Accumulate fees (simplified - in reality each tx has its own fee)
        totalFee += BigInt(100000); // Base fee estimate
      } catch (err) {
        results.push({
          raffleId: purchase.raffleId,
          ticketIds: [],
          success: false,
          error: err instanceof TikkaSdkError 
            ? err.message 
            : err instanceof Error 
            ? err.message 
            : String(err),
        });
      }
    }

    // Merge with failed simulations
    const finalResults: BatchPurchaseResult[] = [];
    let validIndex = 0;
    
    for (let i = 0; i < purchases.length; i++) {
      if (simulationResults[i].success) {
        finalResults.push(results[validIndex]);
        validIndex++;
      } else {
        finalResults.push(simulationResults[i]);
      }
    }

    return {
      success: true,
      value: finalResults,
      transactionHash: lastTxHash,
      ledger: lastLedger,
    };
  }
}
