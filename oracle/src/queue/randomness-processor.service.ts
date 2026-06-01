import { Injectable, Logger, Optional } from '@nestjs/common';
import { JobStateManager } from './job-state-manager';
import { JobState } from './job-state.types';
import { RandomnessRequest, RandomnessMethod, RandomnessResult } from './queue.types';
import { ContractService } from '../contract/contract.service';
import { VrfService } from '../randomness/vrf.service';
import { PrngService } from '../randomness/prng.service';
import { TxSubmitterService } from '../submitter/tx-submitter.service';
import { HealthService } from '../health/health.service';
import { LagMonitorService } from '../health/lag-monitor.service';
import { ConfigService } from '@nestjs/config';
import { RandomnessAuditService } from '../audit/randomness-audit.service';
import { RandomnessProvider } from '../audit/randomness-audit.types';

export interface ProcessingResult {
  success: boolean;
  shouldRetry: boolean;
  error?: string;
  txHash?: string;
  ledger?: number;
}

/**
 * Core randomness request processor with explicit state machine lifecycle management.
 * Handles generation, submission, and confirmation phases with proper error handling.
 */
@Injectable()
export class RandomnessProcessorService {
  private readonly logger = new Logger(RandomnessProcessorService.name);
  private readonly vrfThresholdXlm: number;

  constructor(
    private readonly stateManager: JobStateManager,
    private readonly contractService: ContractService,
    private readonly vrfService: VrfService,
    private readonly prngService: PrngService,
    private readonly txSubmitter: TxSubmitterService,
    private readonly healthService: HealthService,
    private readonly lagMonitor: LagMonitorService,
    private readonly configService: ConfigService,
    @Optional() private readonly randomnessAudit?: RandomnessAuditService,
  ) {
    this.vrfThresholdXlm = Number(
      this.configService.get<string>('VRF_THRESHOLD_XLM', '500'),
    );
  }

  /**
   * Process a randomness request through the complete lifecycle.
   * Returns a result indicating success, retry eligibility, and error details.
   */
  async processRequest(request: RandomnessRequest): Promise<ProcessingResult> {
    const { requestId, raffleId } = request;

    // Initialize job if not already tracked
    let metadata = this.stateManager.getJobMetadata(requestId);
    if (!metadata) {
      metadata = this.stateManager.initializeJob(requestId, raffleId);
    }

    // Check if we can acquire a processing slot
    if (!this.stateManager.canAcquireProcessingSlot()) {
      this.logger.warn(
        `Job ${requestId} cannot acquire processing slot (concurrency limit reached)`,
      );
      return { success: false, shouldRetry: true, error: 'Concurrency limit reached' };
    }

    try {
      // Phase 1: Check if already submitted
      const alreadySubmitted = await this.contractService.isRandomnessSubmitted(raffleId);
      if (alreadySubmitted) {
        this.logger.warn(`Raffle ${raffleId} already finalized, marking as confirmed`);
        this.stateManager.transitionState(requestId, JobState.CONFIRMED, 'Already submitted');
        await this.recordAuditAlreadySubmitted(request);
        return { success: true, shouldRetry: false };
      }

      await this.recordAuditPending(request);

      // Phase 2: Generate randomness
      const generated = await this.generateRandomness(requestId, raffleId);
      if (!generated) {
        await this.recordAuditFailed(requestId, 'Generation failed', undefined, undefined, false);
        return { success: false, shouldRetry: true, error: 'Generation failed' };
      }

      const { randomness, provider } = generated;

      // Phase 3: Submit transaction
      const submitResult = await this.submitTransaction(requestId, raffleId, randomness);
      if (!submitResult.success) {
        await this.recordAuditFailed(
          requestId,
          submitResult.error ?? 'Submission failed',
          provider,
          randomness,
          submitResult.shouldRetry,
        );
        return submitResult;
      }

      const submissionLedger = submitResult.ledger;
      const submissionConfirmed =
        submissionLedger !== undefined && submissionLedger > 0;

      let confirmLedger = submissionLedger;

      if (!submissionConfirmed) {
        // Phase 4: Confirm when submitter did not return a ledger (legacy / pending)
        const confirmResult = await this.confirmTransaction(requestId, submitResult.txHash!);
        if (!confirmResult.success) {
          await this.recordAuditFailed(
            requestId,
            confirmResult.error ?? 'Confirmation failed',
            provider,
            randomness,
            confirmResult.shouldRetry,
          );
          return confirmResult;
        }
        confirmLedger = confirmResult.ledger;
      }

      // Success path
      this.stateManager.transitionState(
        requestId,
        JobState.CONFIRMED,
        submissionConfirmed
          ? `Transaction confirmed at ledger ${submissionLedger} (submitter)`
          : `Transaction confirmed at ledger ${confirmLedger}`,
      );
      this.stateManager.recordTransactionResult(
        requestId,
        submitResult.txHash!,
        confirmLedger ?? 0,
      );

      this.healthService.recordSuccess(requestId);
      this.lagMonitor.fulfillRequest(requestId);

      this.logger.log(
        `Successfully processed randomness for raffle ${raffleId}: tx=${submitResult.txHash}, ledger=${confirmLedger}`,
      );

      await this.recordAuditSucceeded(
        requestId,
        provider,
        randomness,
        submitResult.txHash!,
        confirmLedger,
      );

      return {
        success: true,
        shouldRetry: false,
        txHash: submitResult.txHash,
        ledger: confirmLedger,
      };
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      this.logger.error(
        `Error processing randomness request ${requestId} for raffle ${raffleId}: ${errorMessage}`,
        error.stack,
      );

      const shouldRetry = this.isRetriableError(error);
      const targetState = shouldRetry ? JobState.RETRYING : JobState.FAILED;

      this.stateManager.transitionState(requestId, targetState, errorMessage, errorMessage);
      this.healthService.recordFailure(requestId, raffleId, errorMessage);

      await this.recordAuditFailed(
        requestId,
        errorMessage,
        undefined,
        undefined,
        shouldRetry,
      );

      return { success: false, shouldRetry, error: errorMessage };
    }
  }

  /**
   * Phase 1: Generate randomness using VRF or PRNG based on prize amount.
   */
  private async generateRandomness(
    requestId: string,
    raffleId: number,
  ): Promise<{ randomness: RandomnessResult; provider: RandomnessProvider } | null> {
    this.stateManager.transitionState(requestId, JobState.GENERATING, 'Starting generation');

    try {
      const config = this.stateManager.getConfig();
      const timeoutPromise = this.createTimeout(
        config.generationTimeoutMs,
        `Generation timeout after ${config.generationTimeoutMs}ms`,
      );

      const raffleData = await this.contractService.getRaffleData(raffleId);
      const prizeAmount = raffleData.prizeAmount;
      const method = this.determineMethod(prizeAmount);

      this.logger.log(
        `Generating randomness for request ${requestId}, raffle ${raffleId}, ` +
        `prize=${prizeAmount} XLM, method=${method}`,
      );

      const generationPromise =
        method === RandomnessMethod.VRF
          ? this.vrfService.compute(requestId, raffleId)
          : this.prngService.compute(requestId, raffleId);

      const randomness = (await Promise.race([generationPromise, timeoutPromise])) as RandomnessResult;
      const provider: RandomnessProvider =
        method === RandomnessMethod.VRF ? 'vrf' : 'prng';

      this.logger.log(`Successfully generated randomness for request ${requestId}`);
      return { randomness, provider };
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      this.logger.error(`Generation failed for request ${requestId}: ${errorMessage}`);
      
      const shouldRetry = this.isRetriableError(error);
      const targetState = shouldRetry ? JobState.RETRYING : JobState.FAILED;
      this.stateManager.transitionState(requestId, targetState, 'Generation failed', errorMessage);
      
      throw error;
    }
  }

  /**
   * Phase 2: Submit transaction to the network.
   */
  private async submitTransaction(
    requestId: string,
    raffleId: number,
    randomness: RandomnessResult,
  ): Promise<ProcessingResult> {
    this.stateManager.transitionState(requestId, JobState.SUBMITTING, 'Starting submission');

    try {
      const config = this.stateManager.getConfig();
      const timeoutPromise = this.createTimeout(
        config.submissionTimeoutMs,
        `Submission timeout after ${config.submissionTimeoutMs}ms`,
      );

      const submissionPromise = this.txSubmitter.submitRandomness(raffleId, randomness);
      const result = await Promise.race([submissionPromise, timeoutPromise]);

      if (!result || typeof result !== 'object' || !('success' in result)) {
        throw new Error('Invalid submission result');
      }

      if (!result.success) {
        const error = 'Transaction submission returned success=false';
        this.logger.error(`Submission failed for request ${requestId}: ${error}`);
        this.stateManager.transitionState(requestId, JobState.RETRYING, 'Submission failed', error);
        return { success: false, shouldRetry: true, error };
      }

      this.logger.log(
        `Transaction submitted for request ${requestId}: ${result.txHash}, ledger=${result.ledger}`,
      );
      return {
        success: true,
        shouldRetry: false,
        txHash: result.txHash,
        ledger: result.ledger,
      };
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      this.logger.error(`Submission error for request ${requestId}: ${errorMessage}`);
      
      const shouldRetry = this.isRetriableError(error);
      const targetState = shouldRetry ? JobState.RETRYING : JobState.FAILED;
      this.stateManager.transitionState(requestId, targetState, 'Submission error', errorMessage);
      
      return { success: false, shouldRetry, error: errorMessage };
    }
  }

  /**
   * Phase 3: Confirm transaction on-chain.
   */
  private async confirmTransaction(
    requestId: string,
    txHash: string,
  ): Promise<ProcessingResult> {
    this.stateManager.transitionState(requestId, JobState.CONFIRMING, `Confirming tx ${txHash}`);

    try {
      const config = this.stateManager.getConfig();
      const started = Date.now();

      while (Date.now() - started < config.confirmationTimeoutMs) {
        const status = await this.checkTransactionStatus(txHash);

        if (status.confirmed) {
          this.logger.log(
            `Transaction ${txHash} confirmed for request ${requestId} at ledger ${status.ledger}`,
          );
          return {
            success: true,
            shouldRetry: false,
            txHash,
            ledger: status.ledger,
          };
        }

        if (status.failed) {
          const error = `Transaction ${txHash} failed on-chain`;
          this.logger.error(`Confirmation failed for request ${requestId}: ${error}`);
          this.stateManager.transitionState(requestId, JobState.FAILED, error, error);
          return { success: false, shouldRetry: false, error };
        }

        // Still pending, wait and retry
        await this.delay(1000);
      }

      // Timeout
      const error = `Confirmation timeout after ${config.confirmationTimeoutMs}ms for tx ${txHash}`;
      this.logger.warn(`Confirmation timeout for request ${requestId}`);
      this.stateManager.transitionState(requestId, JobState.RETRYING, error, error);
      return { success: false, shouldRetry: true, error };
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      this.logger.error(`Confirmation error for request ${requestId}: ${errorMessage}`);
      
      const shouldRetry = this.isRetriableError(error);
      const targetState = shouldRetry ? JobState.RETRYING : JobState.FAILED;
      this.stateManager.transitionState(requestId, targetState, 'Confirmation error', errorMessage);
      
      return { success: false, shouldRetry, error: errorMessage };
    }
  }

  /**
   * Check transaction status on-chain.
   */
  private async checkTransactionStatus(
    txHash: string,
  ): Promise<{ confirmed: boolean; failed: boolean; ledger?: number }> {
    try {
      return await this.txSubmitter.getTransactionConfirmationStatus(txHash);
    } catch (error) {
      this.logger.error(`Error checking transaction status for ${txHash}: ${error}`);
      return { confirmed: false, failed: false };
    }
  }

  /**
   * Determine randomness method based on prize amount.
   */
  private determineMethod(prizeAmount: number): RandomnessMethod {
    return prizeAmount >= this.vrfThresholdXlm
      ? RandomnessMethod.VRF
      : RandomnessMethod.PRNG;
  }

  /**
   * Determine if an error is retriable.
   */
  private isRetriableError(error: any): boolean {
    const message = (error?.message || String(error)).toLowerCase();

    // Retriable errors
    if (
      message.includes('timeout') ||
      message.includes('temporarily unavailable') ||
      message.includes('try again') ||
      message.includes('rate limit') ||
      message.includes('too many requests') ||
      message.includes('insufficient fee') ||
      message.includes('tx_insufficient_fee') ||
      message.includes('econnrefused') ||
      message.includes('enotfound') ||
      message.includes('503') ||
      message.includes('502') ||
      message.includes('500')
    ) {
      return true;
    }

    // Non-retriable errors
    if (
      message.includes('invalid') ||
      message.includes('malformed') ||
      message.includes('unauthorized') ||
      message.includes('forbidden') ||
      message.includes('revert') ||
      message.includes('failed (status=failed)')
    ) {
      return false;
    }

    // Default to retriable for unknown errors
    return true;
  }

  /**
   * Create a timeout promise that rejects after the specified duration.
   */
  private createTimeout(ms: number, message: string): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), ms);
    });
  }

  /**
   * Delay helper for polling.
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async recordAuditPending(request: RandomnessRequest): Promise<void> {
    if (!this.randomnessAudit) {
      return;
    }

    try {
      await this.randomnessAudit.ensurePending({
        requestInput: {
          raffleId: request.raffleId,
          requestId: request.requestId,
          stableRequestId: request.stableRequestId,
          prizeAmount: request.prizeAmount,
          priority: request.priority,
          replayOverride: request.replayOverride,
        },
        contractEventId: request.stableRequestId,
        queueJobId: request.queueJobId,
      });
    } catch (error: any) {
      this.logger.warn(
        `Randomness audit pending write failed for ${request.requestId}: ${error?.message}`,
      );
    }
  }

  private async recordAuditSucceeded(
    requestId: string,
    provider: RandomnessProvider,
    randomness: RandomnessResult,
    submissionTxHash: string,
    submissionLedger?: number,
  ): Promise<void> {
    if (!this.randomnessAudit) {
      return;
    }

    try {
      await this.randomnessAudit.markSucceeded({
        requestId,
        provider,
        seed: randomness.seed,
        proof: randomness.proof,
        submissionTxHash,
        submissionLedger,
      });
    } catch (error: any) {
      this.logger.warn(
        `Randomness audit success write failed for ${requestId}: ${error?.message}`,
      );
    }
  }

  private async recordAuditAlreadySubmitted(request: RandomnessRequest): Promise<void> {
    if (!this.randomnessAudit) {
      return;
    }

    try {
      await this.randomnessAudit.ensurePending({
        requestInput: {
          raffleId: request.raffleId,
          requestId: request.requestId,
          stableRequestId: request.stableRequestId,
          prizeAmount: request.prizeAmount,
          priority: request.priority,
          replayOverride: request.replayOverride,
        },
        contractEventId: request.stableRequestId,
        queueJobId: request.queueJobId,
      });
      await this.randomnessAudit.markAlreadySubmitted(request.requestId);
    } catch (error: any) {
      this.logger.warn(
        `Randomness audit already-submitted write failed for ${request.requestId}: ${error?.message}`,
      );
    }
  }

  private async recordAuditFailed(
    requestId: string,
    errorMessage: string,
    provider?: RandomnessProvider,
    randomness?: RandomnessResult,
    shouldRetry = false,
  ): Promise<void> {
    if (!this.randomnessAudit || shouldRetry) {
      return;
    }

    try {
      await this.randomnessAudit.markFailed({
        requestId,
        errorMessage,
        provider,
        seed: randomness?.seed,
        proof: randomness?.proof,
      });
    } catch (error: any) {
      this.logger.warn(
        `Randomness audit failure write failed for ${requestId}: ${error?.message}`,
      );
    }
  }
}
