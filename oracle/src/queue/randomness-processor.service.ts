import { Injectable, Logger } from '@nestjs/common';
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
  ) {
    this.vrfThresholdXlm = Number(
      this.configService.get<string>('VRF_THRESHOLD_XLM', '500'),
    );
  }

  /**
   * Process a randomness request through the complete lifecycle.
   * Returns a result indicating success, retry eligibility, and error details.
   */
  async function processRequest(request: RandomnessRequest): Promise<ProcessingResult> {
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
        return { success: true, shouldRetry: false };
      }

      // Phase 2: Generate randomness
      const randomness = await this.generateRandomness(requestId, raffleId);
      if (!randomness) {
        return { success: false, shouldRetry: true, error: 'Generation failed' };
      }

      // Phase 3: Submit transaction
      const submitResult = await this.submitTransaction(requestId, raffleId, randomness);
      if (!submitResult.success) {
        return submitResult;
      }

      // Phase 4: Confirm transaction
      const confirmResult = await this.confirmTransaction(requestId, submitResult.txHash!);
      if (!confirmResult.success) {
        return confirmResult;
      }

      // Success path
      this.stateManager.transitionState(
        requestId,
        JobState.CONFIRMED,
        `Transaction confirmed at ledger ${confirmResult.ledger}`,
      );
      this.stateManager.recordTransactionResult(requestId, submitResult.txHash!, confirmResult.ledger!);

      this.healthService.recordSuccess(requestId);
      this.lagMonitor.fulfillRequest(requestId);

      this.logger.log(
        `Successfully processed randomness for raffle ${raffleId}: tx=${submitResult.txHash}, ledger=${confirmResult.ledger}`,
      );

      return {
        success: true,
        shouldRetry: false,
        txHash: submitResult.txHash,
        ledger: confirmResult.ledger,
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

      return { success: false, shouldRetry, error: errorMessage };
    }
  }

  /**
   * Phase 1: Generate randomness using VRF or PRNG based on prize amount.
   */
  private async generateRandomness(
    requestId: string,
    raffleId: number,
  ): Promise<RandomnessResult | null> {
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

      const randomness = await Promise.race([generationPromise, timeoutPromise]);

      this.logger.log(`Successfully generated randomness for request ${requestId}`);
      return randomness as RandomnessResult;
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

      this.logger.log(`Transaction submitted for request ${requestId}: ${result.txHash}`);
      return {
        success: true,
        shouldRetry: false,
        txHash: result.txHash,
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
      // This would typically call the RPC server's getTransaction method
      // For now, we'll delegate to the submitter service's internal logic
      // In a real implementation, this should be extracted to a shared service
      return { confirmed: false, failed: false };
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
}
