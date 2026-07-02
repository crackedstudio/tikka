import { Injectable } from "@nestjs/common";
import { ContractService } from "../../contract/contract.service";
import { ContractFn } from "../../contract/bindings";
import {
  BuyTicketParams,
  BuyTicketsParams,
  RefundTicketParams,
  RefundTicketResult,
  GetUserTicketsParams,
  BuyBatchParams,
  BuyBatchResult,
  BatchPurchaseResult,
  TICKET_CONSTRAINTS,
  BuyTicketResult,
  ClaimPrizeParams,
  ClaimPrizeResult,
} from './ticket.types';
import { ContractResponse } from '../../contract/response';
import { assertPositiveInt } from '../../utils/validation';
import { TikkaSdkError, TikkaSdkErrorCode, toTypedSdkError } from '../../utils/errors';
import { validateLifecycleTransition } from '../../contract/lifecycle';

@Injectable()
export class TicketService {
  private readonly submissionTracker = new Map<string, Set<string>>();

  constructor(private readonly contractService: ContractService) {}

  /**
   * Validates ticket purchase quantity constraints.
   * @throws TikkaSdkError if quantity is invalid
   */
  private validateQuantity(quantity: number, fieldName = "quantity"): void {
    if (!Number.isInteger(quantity)) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.InvalidParams,
        `${fieldName} must be an integer, got ${quantity}`,
      );
    }
    if (quantity < TICKET_CONSTRAINTS.MIN_QUANTITY) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.InvalidParams,
        `${fieldName} must be at least ${TICKET_CONSTRAINTS.MIN_QUANTITY}, got ${quantity}`,
      );
    }
    if (quantity > TICKET_CONSTRAINTS.MAX_QUANTITY) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.InvalidParams,
        `${fieldName} must not exceed ${TICKET_CONSTRAINTS.MAX_QUANTITY}, got ${quantity}`,
      );
    }
  }

  /**
   * Checks for duplicate submission attempts.
   * Prevents accidental resubmission of the same purchase.
   */
  private checkDuplicateSubmission(
    raffleId: number,
    quantity: number,
    userAddress: string,
  ): void {
    const userKey = userAddress;
    if (!this.submissionTracker.has(userKey)) {
      this.submissionTracker.set(userKey, new Set());
    }

    const recentSubmissions = this.submissionTracker.get(userKey)!;
    const submissionId = `${raffleId}:${quantity}`;

    if (recentSubmissions.has(submissionId)) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.InvalidParams,
        `Duplicate submission detected: raffle ${raffleId} with quantity ${quantity} was already submitted. Please wait before retrying.`,
      );
    }

    // Track this submission
    recentSubmissions.add(submissionId);

    // Clear old submissions after 30 seconds to allow retry
    setTimeout(() => {
      recentSubmissions.delete(submissionId);
    }, 30000);
  }

  /**
   * Fetches current raffle state and throws RaffleEnded if the given
   * operation is not permitted in that state. Called before any
   * simulation/submission so invalid purchases never reach the network.
   */
  private async assertRaffleOpenFor(
    operation: string,
    raffleId: number,
  ): Promise<void> {
    const stateResp = await this.contractService.simulateReadOnly<{ status: number } | number>(
      ContractFn.GET_RAFFLE_STATE,
      [raffleId],
    );
    const currentStatus =
      (stateResp.value as any)?.status ?? (stateResp.value as any) ?? -1;
    validateLifecycleTransition(operation, currentStatus as number, raffleId);
  }

  /**
   * Purchases tickets for a raffle.
   * Requires wallet signature and submission.
   *
   * Validates the raffle is in OPEN state before simulating/submitting —
   * see issue #929.
   *
   * Token transfer failures (e.g. malicious SEP-41 token rejecting the call)
   * are surfaced as `ExternalContractError` so callers can handle them
   * separately from generic network/contract errors.
   *
   * @throws TikkaSdkError if validation fails, raffle is not OPEN, or submission is duplicate
   */
  async buy(
    params: BuyTicketParams,
  ): Promise<ContractResponse<BuyTicketResult>> {
    const { raffleId, quantity } = params;
    assertPositiveInt(raffleId, "raffleId");
    this.validateQuantity(quantity);

    // Fetch current raffle state and validate before simulating/submitting.
    await this.assertRaffleOpenFor(ContractFn.BUY_TICKET, raffleId);

    const publicKey = await this.contractService["wallet"]?.getPublicKey();
    if (!publicKey) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.WalletNotInstalled,
        "Wallet required for ticket purchase",
      );
    }

    // Check for duplicate submission
    this.checkDuplicateSubmission(raffleId, quantity, publicKey);

    try {
      const result = await this.contractService.invoke<number[]>(
        ContractFn.BUY_TICKET,
        [raffleId, publicKey, quantity],
        { memo: params.memo },
      );

      // Transform generic contract response to typed BuyTicketResult
      return {
        success: result.success,
        value: {
          ticketIds: result.value || [],
          transactionHash: result.transactionHash || "",
          ledger: result.ledger || 0,
          feePaid: result.feeCharged || '0',
        } as BuyTicketResult,
        transactionHash: result.transactionHash,
        ledger: result.ledger,
        feePaid: result.feeCharged,
      } as ContractResponse<BuyTicketResult>;
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
      throw toTypedSdkError(err);
    }
  }

  /**
   * Purchases multiple tickets for a raffle in a single transaction.
   * Uses the batch purchase contract entry point.
   *
   * Validates the raffle is in OPEN state before simulating/submitting —
   * see issue #929.
   *
   * @throws TikkaSdkError if validation fails, raffle is not OPEN, or submission is duplicate
   */
  async buyTickets(params: BuyTicketsParams): Promise<ContractResponse<BuyTicketResult>> {
    const { raffleId, count, maxPricePerTicket } = params;
    assertPositiveInt(raffleId, 'raffleId');
    this.validateQuantity(count, 'count');

    // Fetch current raffle state and validate before simulating/submitting.
    await this.assertRaffleOpenFor(ContractFn.BUY_TICKET, raffleId);

    const publicKey = await this.contractService['wallet']?.getPublicKey();
    if (!publicKey) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.WalletNotInstalled,
        'Wallet required for ticket purchase',
      );
    }

    // Check for duplicate submission
    this.checkDuplicateSubmission(raffleId, count, publicKey);

    try {
      const result = await this.contractService.invoke<number[]>(
        ContractFn.BUY_TICKETS_BATCH,
        [raffleId, publicKey, count, maxPricePerTicket],
        { memo: params.memo },
      );

      return {
        success: result.success,
        value: {
          ticketIds: result.value || [],
          transactionHash: result.transactionHash || '',
          ledger: result.ledger || 0,
          feePaid: result.feeCharged || '0',
        } as BuyTicketResult,
        transactionHash: result.transactionHash,
        ledger: result.ledger,
        feePaid: result.feeCharged,
      } as ContractResponse<BuyTicketResult>;
    } catch (err) {
      if (
        err instanceof TikkaSdkError &&
        err.code === TikkaSdkErrorCode.ExternalContractError
      ) {
        throw new TikkaSdkError(
          TikkaSdkErrorCode.ExternalContractError,
          `Token contract rejected batch ticket purchase for raffle ${raffleId}: ${err.message}`,
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
   *
   * @throws TikkaSdkError if validation fails or refund fails
   */
  async refund(
    params: RefundTicketParams,
  ): Promise<ContractResponse<RefundTicketResult>> {
    const { raffleId, ticketId } = params;
    assertPositiveInt(raffleId, "raffleId");
    assertPositiveInt(ticketId, "ticketId");

    try {
      const result = await this.contractService.invoke<void>(
        ContractFn.REFUND_TICKET,
        [raffleId, ticketId],
        { memo: params.memo },
      );

      // Transform generic contract response to typed RefundTicketResult
      return {
        success: result.success,
        value: {
          transactionHash: result.transactionHash || "",
          ledger: result.ledger || 0,
          feePaid: result.feeCharged || '0',
        } as RefundTicketResult,
        transactionHash: result.transactionHash,
        ledger: result.ledger,
        feePaid: result.feeCharged,
      } as ContractResponse<RefundTicketResult>;
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
      throw toTypedSdkError(err);
    }
  }

  /**
   * Claims the prize for a finalized raffle.
   * Requires wallet signature and submission.
   *
   * @throws TikkaSdkError if validation fails or prize claim fails
   */
  async claimPrize(
    params: ClaimPrizeParams,
  ): Promise<ContractResponse<ClaimPrizeResult>> {
    const { raffleId } = params;
    assertPositiveInt(raffleId, "raffleId");

    const result = await this.contractService.invoke<void>(
      ContractFn.CLAIM_PRIZE,
      [raffleId],
      { memo: params.memo },
    );

    return {
      success: result.success,
      value: {
        transactionHash: result.transactionHash || result.txHash || "",
        ledger: result.ledger || 0,
        feePaid: result.feePaid || "0",
      } as ClaimPrizeResult,
      transactionHash: result.transactionHash || result.txHash,
      ledger: result.ledger,
      feePaid: result.feePaid,
    } as ContractResponse<ClaimPrizeResult>;
  }

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
    assertPositiveInt(raffleId, "raffleId");

    if (!userAddress || typeof userAddress !== "string") {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.InvalidParams,
        "userAddress must be a non-empty string",
      );
    }

    return this.contractService.simulateReadOnly<number[]>(
      ContractFn.GET_USER_TICKETS,
      [raffleId, userAddress],
    );
  }

  /**
   * Purchases tickets for multiple raffles in a single operation.
   *
   * This method handles batch ticket purchases with individual validation for each raffle.
   * Returns individual success/failure results for each purchase, allowing partial failures.
   *
   * Constraints:
   * - Maximum 100 purchases per batch
   * - Each purchase quantity: 1-1000 tickets
   * - Follows same duplicate submission detection as single purchase
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
  async buyBatch(
    params: BuyBatchParams,
  ): Promise<ContractResponse<BuyBatchResult>> {
    const { purchases, memo } = params;

    // Validate inputs
    if (!purchases || purchases.length === 0) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.InvalidParams,
        "Purchases array cannot be empty",
      );
    }

    if (purchases.length > TICKET_CONSTRAINTS.MAX_BATCH_SIZE) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.InvalidParams,
        `Batch size cannot exceed ${TICKET_CONSTRAINTS.MAX_BATCH_SIZE}, got ${purchases.length}`,
      );
    }

    // Validate each purchase
    purchases.forEach((purchase, index) => {
      try {
        assertPositiveInt(purchase.raffleId, `purchases[${index}].raffleId`);
        this.validateQuantity(
          purchase.quantity,
          `purchases[${index}].quantity`,
        );
      } catch (err) {
        throw new TikkaSdkError(
          TikkaSdkErrorCode.InvalidParams,
          `Invalid purchase at index ${index}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    });

    const publicKey = await this.contractService["wallet"]?.getPublicKey();
    if (!publicKey) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.WalletNotInstalled,
        "Wallet required for batch purchase",
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
      simulationResults[index].success === true
    );

    if (validPurchases.length === 0) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.SimulationFailed,
        "All batch purchases failed simulation",
      );
    }

    // Execute purchases sequentially but in a single transaction context
    // Note: Soroban doesn't support true atomic multi-call in a single tx,
    // so we execute them individually but track results together
    const results: BatchPurchaseResult[] = [];
    let lastTxHash = "";
    let lastLedger = 0;
    let totalFeeLamports = 0;

    for (const purchase of validPurchases) {
      try {
        // Check for duplicate before executing
        this.checkDuplicateSubmission(
          purchase.raffleId,
          purchase.quantity,
          publicKey,
        );

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
        // Accumulate fees as integers (stroops) to avoid floating point issues
        const feeLamports = parseInt(res.feeCharged || '0', 10);
        totalFeeLamports += feeLamports;
      } catch (err) {
        results.push({
          raffleId: purchase.raffleId,
          ticketIds: [],
          success: false,
          error:
            err instanceof TikkaSdkError
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
      if (simulationResults[i].success === true) {
        finalResults.push(results[validIndex]);
        validIndex++;
      } else {
        finalResults.push(simulationResults[i]);
      }
    }

    // Transform to typed result
    return {
      success: true,
      value: {
        results: finalResults,
        transactionHash: lastTxHash,
        ledger: lastLedger,
        feePaid: totalFeeLamports.toString(),
      } as BuyBatchResult,
      transactionHash: lastTxHash,
      ledger: lastLedger,
      feePaid: totalFeeLamports.toString(),
    } as ContractResponse<BuyBatchResult>;
  }
}
