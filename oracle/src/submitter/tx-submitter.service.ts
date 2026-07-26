import { OracleLoggerService, OracleLogFields } from '../logger/oracle-logger';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as StellarSdk from '@stellar/stellar-sdk';
import { RandomnessResult } from '../queue/queue.types';
import { FeeEstimatorService, FeeEstimate } from './fee-estimator.service';
import { KeyService } from '../keys/key.service';
import { CostEstimatorService } from './cost-estimator.service';
import { ContractBuilders } from '../contract/contract.builders';

/**
 * Explicit transaction lifecycle states for state machine tracking
 */
export enum TransactionState {
  BUILDING = 'BUILDING',
  SIGNING = 'SIGNING',
  SUBMITTING = 'SUBMITTING',
  POLLING = 'POLLING',
  SUCCESS = 'SUCCESS',
  DUPLICATE_SUCCESS = 'DUPLICATE_SUCCESS',
  TIMEOUT = 'TIMEOUT',
  INSUFFICIENT_FEE = 'INSUFFICIENT_FEE',
  NETWORK_ERROR = 'NETWORK_ERROR',
  FAILED = 'FAILED',
  INVALID_TRANSACTION = 'INVALID_TRANSACTION',
}

/**
 * Strictly typed transaction outcome union for deterministic result handling
 */
export type TransactionOutcome =
  | {
      status: 'SUCCESS';
      txHash: string;
      ledger: number;
      feePaid: number;
      retriable: false;
    }
  | {
      status: 'DUPLICATE_SUCCESS';
      txHash: string;
      ledger: number;
      message: string;
      retriable: false;
    }
  | {
      status: 'TIMEOUT';
      txHash?: string;
      error: string;
      retriable: true;
      pollAttempts: number;
    }
  | {
      status: 'INSUFFICIENT_FEE';
      error: string;
      retriable: true;
      currentFee: number;
      suggestedFee?: number;
    }
  | {
      status: 'NETWORK_ERROR';
      error: string;
      retriable: true;
      rpcUrl?: string;
      errorCode?: string;
    }
  | {
      status: 'FAILED';
      txHash?: string;
      error: string;
      retriable: false;
      failureReason?: string;
    }
  | {
      status: 'INVALID_TRANSACTION';
      error: string;
      retriable: false;
      validationError?: string;
    };

/**
 * Structured telemetry context for comprehensive logging
 */
export interface TelemetryContext {
  txHash?: string;
  raffleId: number;
  requestId: string;
  finalOutcome?: TransactionState;
  attempt: number;
  timestamp: string;
  durationMs?: number;
  currentState?: TransactionState;
  feePaid?: number;
}

/**
 * Legacy interface for backward compatibility
 * @deprecated Use TransactionOutcome instead
 */
export interface SubmitResult {
  txHash: string;
  ledger: number;
  success: boolean;
  feePaid?: number;
}

export interface RandomnessSubmissionPreview {
  networkPassphrase: string;
  sourceAddress: string;
  feeEstimate: FeeEstimate;
  contractId: string;
  rpcUrl: string;
}

@Injectable()
export class TxSubmitterService {
  
  private readonly rpcUrls: string[];
  private currentRpcIndex = 0;
  private rpcServer: any;

  private readonly contractId: string;
  private readonly networkPassphrase: string;

  private readonly maxAttempts: number;
  private readonly initialBackoffMs: number;
  private readonly POLL_TIMEOUT_MS = 30000;
  private readonly POLL_INTERVAL_MS = 1000;
  private readonly alertWebhookUrl?: string;

  constructor(
    private readonly logger: OracleLoggerService,
    private readonly configService: ConfigService,
    private readonly feeEstimator: FeeEstimatorService,
    private readonly keyService: KeyService,
    private readonly costEstimator: CostEstimatorService,
  ) {
    const primary =
      this.configService.get<string>('SOROBAN_RPC_URL') ||
      'https://soroban-testnet.stellar.org';

    // Additional fallback URLs as a comma-separated env var, e.g.:
    // SOROBAN_RPC_FALLBACK_URLS=https://rpc2.example.com,https://rpc3.example.com
    const fallbacks = (this.configService.get<string>('SOROBAN_RPC_FALLBACK_URLS') || '')
      .split(',')
      .map((u) => u.trim())
      .filter(Boolean);

    this.rpcUrls = [primary, ...fallbacks];
    this.rpcServer = this.buildServer(this.rpcUrls[0]);

    this.contractId = this.configService.get<string>('RAFFLE_CONTRACT_ID') || '';
    this.networkPassphrase =
      this.configService.get<string>('NETWORK_PASSPHRASE') ||
      (StellarSdk as any).Networks?.TESTNET ||
      'Test SDF Network ; September 2015';

    if (!this.contractId) {
      this.logger.warn('RAFFLE_CONTRACT_ID not configured; TxSubmitter will fail to submit.');
    }

    this.maxAttempts = this.configService.get<number>('TX_SUBMIT_MAX_ATTEMPTS', 5);
    this.initialBackoffMs = this.configService.get<number>('TX_SUBMIT_INITIAL_BACKOFF_MS', 1000);
    this.alertWebhookUrl = this.configService.get<string>('TX_SUBMIT_ALERT_WEBHOOK_URL');
  }

  /**
   * Submit randomness transaction with strict typed outcomes and explicit state machine.
   * This is the primary method that should be used by queue workers.
   *
   * @param raffleId - Raffle identifier
   * @param requestId - Request identifier for telemetry
   * @param randomness - VRF/PRNG randomness result
   * @returns Strictly typed transaction outcome
   */
  async submitRandomnessTyped(
    raffleId: number,
    requestId: string,
    randomness: RandomnessResult,
  ): Promise<TransactionOutcome> {
    const startTime = Date.now();
    const telemetry: TelemetryContext = {
      raffleId,
      requestId,
      attempt: 0,
      timestamp: new Date().toISOString(),
    };

    if (!this.contractId) {
      return this.createInvalidTransactionOutcome(
        'Missing RAFFLE_CONTRACT_ID configuration',
        telemetry,
      );
    }

    try {
      const publicKey = await this.keyService.getPublicKey();
      let feeBump = 1;

      // Get initial fee estimate
      const feeEstimate = await this.feeEstimator.estimateFee(0);
      const baseFee = feeEstimate.cappedFee;

      this.logTelemetry({
        ...telemetry,
        currentState: TransactionState.BUILDING,
      }, `Starting randomness submission with fee ${baseFee} stroops`);

      for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
        telemetry.attempt = attempt;

        try {
          // State: BUILDING
          telemetry.currentState = TransactionState.BUILDING;
          const prepared = await this.buildPreparedTx(publicKey, raffleId, randomness, feeBump);

          // State: SIGNING
          telemetry.currentState = TransactionState.SIGNING;
          await this.keyService.signTransaction(prepared);

          // State: SUBMITTING
          telemetry.currentState = TransactionState.SUBMITTING;
          const submitResult = await this.submitTransactionWithRetry(prepared, telemetry);

          if (submitResult.outcome) {
            telemetry.durationMs = Date.now() - startTime;
            telemetry.finalOutcome = this.mapOutcomeToState(submitResult.outcome);
            telemetry.txHash = 'txHash' in submitResult.outcome ? submitResult.outcome.txHash : undefined;
            this.logTelemetry(telemetry, `Transaction completed: ${submitResult.outcome.status}`);
            return submitResult.outcome;
          }

          // Handle retriable errors with backoff
          if (submitResult.shouldRetry) {
            if (submitResult.bumpFee) {
              feeBump = Math.max(feeBump * 2, feeBump + 1);
              this.logTelemetry(telemetry, `Bumping fee multiplier to ${feeBump}x`);
            }

            if (attempt < this.maxAttempts) {
              const backoffMs = this.backoff(attempt);
              this.logTelemetry(
                telemetry,
                `Retrying in ${backoffMs}ms (attempt ${attempt + 1}/${this.maxAttempts})`,
              );
              await this.delay(backoffMs);
            }
          } else {
            // Non-retriable error
            break;
          }
        } catch (error: any) {
          const errorMessage = this.errorToString(error);
          this.logTelemetry(
            { ...telemetry, currentState: TransactionState.NETWORK_ERROR },
            `Attempt ${attempt} failed: ${errorMessage}`,
          );

          if (this.isRpcError(errorMessage)) {
            this.failoverRpc();
          }

          if (attempt === this.maxAttempts || !this.isRetriableError(error, errorMessage)) {
            telemetry.durationMs = Date.now() - startTime;
            return this.classifyError(error, errorMessage, telemetry);
          }

          const backoffMs = this.backoff(attempt);
          await this.delay(backoffMs);
        }
      }

      // Exhausted all attempts
      telemetry.durationMs = Date.now() - startTime;
      telemetry.finalOutcome = TransactionState.FAILED;
      return {
        status: 'FAILED',
        error: `Exhausted ${this.maxAttempts} attempts without success`,
        retriable: false,
        failureReason: 'MAX_ATTEMPTS_EXCEEDED',
      };
    } catch (error: any) {
      telemetry.durationMs = Date.now() - startTime;
      return this.classifyError(error, this.errorToString(error), telemetry);
    }
  }

  /** Returns status of all configured RPC endpoints. */
  async getRpcStatus(): Promise<{ url: string; healthy: boolean }[]> {
    return Promise.all(
      this.rpcUrls.map(async (url) => {
        try {
          const server = this.buildServer(url);
          await server.getLatestLedger();
          return { url, healthy: true };
        } catch {
          return { url, healthy: false };
        }
      }),
    );
  }

  /**
   * Submit transaction with explicit retry logic and duplicate detection.
   * Returns outcome or retry signal.
   */
  private async submitTransactionWithRetry(
    preparedTx: any,
    telemetry: TelemetryContext,
  ): Promise<{
    outcome?: TransactionOutcome;
    shouldRetry: boolean;
    bumpFee: boolean;
  }> {
    try {
      const sendRes = await this.rpcServer.sendTransaction(preparedTx);
      const txHash = sendRes.hash || sendRes?.transactionHash || '';

      // Check for duplicate submission
      if (this.isDuplicateError(sendRes)) {
        telemetry.txHash = txHash || 'unknown';
        this.logTelemetry(
          { ...telemetry, currentState: TransactionState.DUPLICATE_SUCCESS },
          'Transaction already submitted, querying existing result',
        );

        // Query the existing transaction
        const existingResult = await this.queryExistingTransaction(txHash, telemetry);
        return { outcome: existingResult, shouldRetry: false, bumpFee: false };
      }

      if (!txHash) {
        const responseStr = JSON.stringify(sendRes);
        
        // Check for insufficient fee
        if (this.isInsufficientFeeError(responseStr)) {
          return { shouldRetry: true, bumpFee: true };
        }

        // Check for timeout - try polling anyway
        if (this.isTimeoutError(responseStr)) {
          this.logTelemetry(telemetry, 'Submission timeout, attempting hash recovery');
          // In some cases, the transaction may have been submitted despite timeout
          // We'll retry with backoff
          return { shouldRetry: true, bumpFee: false };
        }

        return { shouldRetry: true, bumpFee: false };
      }

      telemetry.txHash = txHash;

      // State: POLLING
      telemetry.currentState = TransactionState.POLLING;
      this.logTelemetry(telemetry, `Polling for confirmation: ${txHash}`);

      const outcome = await this.pollForConfirmationTyped(txHash, telemetry);
      return { outcome, shouldRetry: outcome.retriable, bumpFee: false };
    } catch (error: any) {
      const errorMessage = this.errorToString(error);

      // Check for duplicate in exception
      if (this.isDuplicateError(error) || errorMessage.toLowerCase().includes('duplicate')) {
        const txHash = this.extractTxHashFromError(error);
        if (txHash) {
          telemetry.txHash = txHash;
          const existingResult = await this.queryExistingTransaction(txHash, telemetry);
          return { outcome: existingResult, shouldRetry: false, bumpFee: false };
        }
      }

      // Check for insufficient fee
      if (this.isInsufficientFeeError(errorMessage)) {
        return { shouldRetry: true, bumpFee: true };
      }

      // Check for network errors
      if (this.isRpcError(errorMessage)) {
        return { shouldRetry: true, bumpFee: false };
      }

      // Check if retriable
      if (this.isRetriableError(error, errorMessage)) {
        return { shouldRetry: true, bumpFee: false };
      }

      // Non-retriable error
      const outcome = this.classifyError(error, errorMessage, telemetry);
      return { outcome, shouldRetry: false, bumpFee: false };
    }
  }

  /**
   * Poll for transaction confirmation with explicit state tracking.
   * Implements timeout fallback and duplicate detection.
   */
  private async pollForConfirmationTyped(
    txHash: string,
    telemetry: TelemetryContext,
  ): Promise<TransactionOutcome> {
    const started = Date.now();
    let pollAttempts = 0;

    while (Date.now() - started < this.POLL_TIMEOUT_MS) {
      pollAttempts++;

      try {
        const res = await this.rpcServer.getTransaction(txHash);
        const status = res?.status;

        if (status === 'SUCCESS') {
          const ledger = (res.ledger as number) || (res.latestLedger as number) || 0;
          this.logTelemetry(
            { ...telemetry, finalOutcome: TransactionState.SUCCESS },
            `Transaction confirmed at ledger ${ledger}`,
          );

          return {
            status: 'SUCCESS',
            txHash,
            ledger,
            feePaid: 0, // TODO: Extract from transaction result
            retriable: false,
          };
        }

        if (status === 'FAILED') {
          const failureReason = this.extractFailureReason(res);
          this.logTelemetry(
            { ...telemetry, finalOutcome: TransactionState.FAILED },
            `Transaction failed: ${failureReason}`,
          );

          return {
            status: 'FAILED',
            txHash,
            error: `Transaction failed on-chain: ${failureReason}`,
            retriable: false,
            failureReason,
          };
        }

        if (status === 'NOT_FOUND') {
          // Transaction not yet in ledger, continue polling
          await this.delay(this.POLL_INTERVAL_MS);
          continue;
        }

        // Unknown status, continue polling
        await this.delay(this.POLL_INTERVAL_MS);
      } catch (error: any) {
        const errorMessage = this.errorToString(error);

        // If we get a network error while polling, continue trying
        if (this.isRpcError(errorMessage)) {
          this.logTelemetry(telemetry, `Polling error (attempt ${pollAttempts}): ${errorMessage}`);
          await this.delay(this.POLL_INTERVAL_MS);
          continue;
        }

        // Other errors during polling
        this.logTelemetry(telemetry, `Polling exception: ${errorMessage}`);
        await this.delay(this.POLL_INTERVAL_MS);
      }
    }

    // Timeout reached
    this.logTelemetry(
      { ...telemetry, finalOutcome: TransactionState.TIMEOUT },
      `Polling timeout after ${pollAttempts} attempts`,
    );

    return {
      status: 'TIMEOUT',
      txHash,
      error: `Transaction confirmation timeout after ${this.POLL_TIMEOUT_MS}ms`,
      retriable: true,
      pollAttempts,
    };
  }

  /**
   * Query an existing transaction that was already submitted (duplicate detection).
   */
  private async queryExistingTransaction(
    txHash: string,
    telemetry: TelemetryContext,
  ): Promise<TransactionOutcome> {
    try {
      if (!txHash || txHash === 'unknown') {
        return {
          status: 'DUPLICATE_SUCCESS',
          txHash: 'unknown',
          ledger: 0,
          message: 'Transaction was duplicate but hash unavailable',
          retriable: false,
        };
      }

      const res = await this.rpcServer.getTransaction(txHash);
      const status = res?.status;

      if (status === 'SUCCESS') {
        const ledger = (res.ledger as number) || (res.latestLedger as number) || 0;
        this.logTelemetry(
          { ...telemetry, finalOutcome: TransactionState.DUPLICATE_SUCCESS },
          `Duplicate transaction confirmed at ledger ${ledger}`,
        );

        return {
          status: 'DUPLICATE_SUCCESS',
          txHash,
          ledger,
          message: 'Transaction was already submitted and confirmed',
          retriable: false,
        };
      }

      // If not yet confirmed, treat as regular success since it's in the network
      return {
        status: 'DUPLICATE_SUCCESS',
        txHash,
        ledger: 0,
        message: 'Transaction was already submitted, pending confirmation',
        retriable: false,
      };
    } catch (error: any) {
      // If we can't query it, still treat as duplicate success
      return {
        status: 'DUPLICATE_SUCCESS',
        txHash,
        ledger: 0,
        message: 'Transaction was duplicate, query failed but assuming success',
        retriable: false,
      };
    }
  }

  /**
   * Classify error into strictly typed outcome.
   */
  private classifyError(
    error: any,
    errorMessage: string,
    telemetry: TelemetryContext,
  ): TransactionOutcome {
    const normalized = errorMessage.toLowerCase();

    // Insufficient fee
    if (this.isInsufficientFeeError(normalized)) {
      return {
        status: 'INSUFFICIENT_FEE',
        error: errorMessage,
        retriable: true,
        currentFee: 0, // TODO: Extract from context
      };
    }

    // Network errors
    if (this.isRpcError(normalized)) {
      return {
        status: 'NETWORK_ERROR',
        error: errorMessage,
        retriable: true,
        rpcUrl: this.rpcUrls[this.currentRpcIndex],
      };
    }

    // Timeout
    if (this.isTimeoutError(normalized)) {
      return {
        status: 'TIMEOUT',
        error: errorMessage,
        retriable: true,
        pollAttempts: 0,
      };
    }

    // Invalid transaction
    if (this.isInvalidTransactionError(normalized)) {
      return {
        status: 'INVALID_TRANSACTION',
        error: errorMessage,
        retriable: false,
        validationError: errorMessage,
      };
    }

    // Generic failure
    return {
      status: 'FAILED',
      error: errorMessage,
      retriable: false,
      failureReason: 'UNKNOWN_ERROR',
    };
  }

  /**
   * Create invalid transaction outcome with telemetry.
   */
  private createInvalidTransactionOutcome(
    error: string,
    telemetry: TelemetryContext,
  ): TransactionOutcome {
    this.logTelemetry(
      { ...telemetry, finalOutcome: TransactionState.INVALID_TRANSACTION },
      error,
    );

    return {
      status: 'INVALID_TRANSACTION',
      error,
      retriable: false,
      validationError: error,
    };
  }

  /**
   * Map outcome status to transaction state for telemetry.
   */
  private mapOutcomeToState(outcome: TransactionOutcome): TransactionState {
    switch (outcome.status) {
      case 'SUCCESS':
        return TransactionState.SUCCESS;
      case 'DUPLICATE_SUCCESS':
        return TransactionState.DUPLICATE_SUCCESS;
      case 'TIMEOUT':
        return TransactionState.TIMEOUT;
      case 'INSUFFICIENT_FEE':
        return TransactionState.INSUFFICIENT_FEE;
      case 'NETWORK_ERROR':
        return TransactionState.NETWORK_ERROR;
      case 'FAILED':
        return TransactionState.FAILED;
      case 'INVALID_TRANSACTION':
        return TransactionState.INVALID_TRANSACTION;
    }
  }

  /**
   * Log structured telemetry with all required context.
   */
  private logTelemetry(telemetry: TelemetryContext, message: string): void {
    const logEntry = {
      message,
      txHash: telemetry.txHash,
      raffleId: telemetry.raffleId,
      requestId: telemetry.requestId,
      finalOutcome: telemetry.finalOutcome,
      currentState: telemetry.currentState,
      attempt: telemetry.attempt,
      timestamp: telemetry.timestamp,
      durationMs: telemetry.durationMs,
      feePaid: telemetry.feePaid,
    };

    if (telemetry.finalOutcome === TransactionState.FAILED ||
        telemetry.finalOutcome === TransactionState.INVALID_TRANSACTION) {
      this.logger.error(JSON.stringify(logEntry));
    } else if (telemetry.finalOutcome === TransactionState.TIMEOUT ||
               telemetry.finalOutcome === TransactionState.NETWORK_ERROR) {
      this.logger.warn(JSON.stringify(logEntry));
    } else {
      this.logger.log(JSON.stringify(logEntry));
    }
  }

  /**
   * Check if error indicates duplicate transaction.
   */
  private isDuplicateError(errorOrResponse: any): boolean {
    const str = JSON.stringify(errorOrResponse).toLowerCase();
    return (
      str.includes('duplicate') ||
      str.includes('tx_duplicate') ||
      str.includes('already exists') ||
      str.includes('already submitted')
    );
  }

  /**
   * Check if error indicates timeout.
   */
  private isTimeoutError(message: string): boolean {
    const m = message.toLowerCase();
    return m.includes('timeout') || m.includes('504') || m.includes('timed out');
  }

  /**
   * Check if error indicates invalid transaction.
   */
  private isInvalidTransactionError(message: string): boolean {
    const m = message.toLowerCase();
    return (
      m.includes('invalid') ||
      m.includes('malformed') ||
      m.includes('unauthorized') ||
      m.includes('forbidden')
    );
  }

  /**
   * Extract transaction hash from error message or object.
   */
  private extractTxHashFromError(error: any): string | null {
    try {
      const str = JSON.stringify(error);
      const hashMatch = str.match(/[0-9a-f]{64}/i);
      return hashMatch ? hashMatch[0] : null;
    } catch {
      return null;
    }
  }

  /**
   * Extract failure reason from transaction result.
   */
  private extractFailureReason(result: any): string {
    try {
      if (result.resultXdr) {
        return `XDR: ${result.resultXdr}`;
      }
      if (result.error) {
        return result.error;
      }
      return 'Unknown failure reason';
    } catch {
      return 'Failed to extract failure reason';
    }
  }

  /**
   * Legacy method for backward compatibility.
   * @deprecated Use submitRandomnessTyped for strict typed outcomes
   */
  async submitRandomness(raffleId: number, randomness: RandomnessResult): Promise<SubmitResult> {
    const outcome = await this.submitRandomnessTyped(raffleId, `raffle-${raffleId}`, randomness);

    // Convert typed outcome to legacy format
    if (outcome.status === 'SUCCESS' || outcome.status === 'DUPLICATE_SUCCESS') {
      return {
        txHash: outcome.txHash,
        ledger: outcome.ledger,
        success: true,
        feePaid: outcome.status === 'SUCCESS' ? outcome.feePaid : undefined,
      };
    }

    return {
      txHash: ('txHash' in outcome ? outcome.txHash : undefined) || '',
      ledger: 0,
      success: false,
    };
  }

  async submitCommitment(raffleId: number, commitment: string): Promise<SubmitResult> {
    if (!this.contractId) {
      this.logger.error('Missing configuration for TxSubmitter (RAFFLE_CONTRACT_ID).');
      return { txHash: '', ledger: 0, success: false };
    }
    const inv = ContractBuilders.buildCommitRandomness(raffleId, commitment);
    return this.submitContractCall(inv.method, inv.args);
  }

  async estimateRandomnessSubmission(
    raffleId: number,
    randomness: RandomnessResult,
  ): Promise<RandomnessSubmissionPreview> {
    const sourceAddress = await this.keyService.getPublicKey();
    const feeEstimate = await this.feeEstimator.estimateFee(0);

    return {
      networkPassphrase: this.networkPassphrase,
      sourceAddress,
      feeEstimate,
      contractId: this.contractId,
      rpcUrl: this.rpcUrls[this.currentRpcIndex],
    };
  }

  async submitReveal(raffleId: number, secret: string, nonce: string): Promise<SubmitResult> {
    if (!this.contractId) {
      this.logger.error('Missing configuration for TxSubmitter (RAFFLE_CONTRACT_ID).');
      return { txHash: '', ledger: 0, success: false };
    }
    const inv = ContractBuilders.buildRevealRandomness(raffleId, secret, nonce);
    return this.submitContractCall(inv.method, inv.args);
  }

  private async submitContractCall(method: string, args: any[]): Promise<SubmitResult> {
    const publicKey = await this.keyService.getPublicKey();
    let feeBump = 1;
    let attempt = 0;
    let lastError: unknown = null;

    while (attempt < this.maxAttempts) {
      attempt++;
      try {
        const account = await this.rpcServer.getAccount(publicKey);
        const fee = (Number((StellarSdk as any).BASE_FEE || 100) * feeBump).toString();
        const contract = new (StellarSdk as any).Contract(this.contractId);
        const tx = new (StellarSdk as any).TransactionBuilder(account, {
          fee,
          networkPassphrase: this.networkPassphrase,
        })
          .addOperation(contract.call(method, ...args))
          .setTimeout(30)
          .build();

        const prepared = await this.rpcServer.prepareTransaction(tx);
        await this.keyService.signTransaction(prepared);

        const sendRes = await this.rpcServer.sendTransaction(prepared);
        const txHash = sendRes.hash || sendRes?.transactionHash || '';
        if (!txHash) {
          if (this.isInsufficientFeeError(JSON.stringify(sendRes))) {
            feeBump = Math.max(feeBump * 2, feeBump + 1);
          }
          lastError = new Error('sendTransaction returned no hash');
          await this.logRetryAndBackoff(method, attempt, lastError);
          continue;
        }

        const confirm = await this.pollForConfirmation(txHash);
        if (confirm?.status === 'SUCCESS') {
          const feePaid = Number(confirm.feeCharged) || Number(fee);
          const raffleIdArg = args.find(arg => arg.switch?.name === 'scvU32')?.u32 || 0;
          this.costEstimator.recordRevealCost(raffleIdArg, 'PRNG', feePaid);
          return { txHash, ledger: (confirm.ledger as number) || 0, success: true, feePaid };
        }
        const confirmMessage = JSON.stringify(confirm);
        if (this.isInsufficientFeeError(confirmMessage)) {
          feeBump = Math.max(feeBump * 2, feeBump + 1);
          this.costEstimator.recordSubmissionRetry(0, 'PRNG');
        }
        const failure = new Error(`${method} failed (status=${confirm?.status || 'UNKNOWN'})`);
        lastError = failure;
        if (!this.isRetriableError(failure, confirmMessage)) {
          this.costEstimator.recordSubmissionFailure(0, 'PRNG', confirmMessage);
          break;
        }
        await this.logRetryAndBackoff(method, attempt, lastError);
      } catch (e: any) {
        const msg = e?.message || String(e);
        if (this.isRpcError(msg)) this.failoverRpc();
        else if (this.isInsufficientFeeError(msg)) {
          feeBump = Math.max(feeBump * 2, feeBump + 1);
          this.costEstimator.recordSubmissionRetry(0, 'PRNG');
        }
        this.logger.error(`Error calling ${method} (attempt ${attempt}/${this.maxAttempts}): ${msg}`);
        lastError = e;
        if (!this.isRetriableError(e, msg)) {
          this.costEstimator.recordSubmissionFailure(0, 'PRNG', msg);
          break;
        }
        await this.logRetryAndBackoff(method, attempt, lastError);
      }
    }

    await this.handleFinalFailure(
      method,
      attempt,
      lastError,
      `Persistent failure calling ${method} after ${attempt} attempts.`,
    );
    return { txHash: '', ledger: 0, success: false };
  }

  private failoverRpc(): void {
    const prev = this.rpcUrls[this.currentRpcIndex];
    this.currentRpcIndex = (this.currentRpcIndex + 1) % this.rpcUrls.length;
    const next = this.rpcUrls[this.currentRpcIndex];
    this.logger.warn(`RPC failover: ${prev} → ${next}`);
    // If running in tests, preserve the mocked rpcServer rather than overwriting it
    if (process.env.NODE_ENV !== 'test') {
      this.rpcServer = this.buildServer(next);
    }
  }

  private buildServer(url: string) {
    return new StellarSdk.rpc.Server(url);
  }

  private isRpcError(message: string): boolean {
    const m = message.toLowerCase();
    return (
      m.includes('timeout') ||
      m.includes('econnrefused') ||
      m.includes('enotfound') ||
      m.includes('503') ||
      m.includes('502') ||
      m.includes('500')
    );
  }

  private async buildPreparedTx(
    sourceAddress: string,
    raffleId: number,
    randomness: RandomnessResult,
    feeStroops: number,
  ) {
    const account = await this.rpcServer.getAccount(sourceAddress);
    const fee = (Number((StellarSdk as any).BASE_FEE || 100) * feeStroops).toString();

    const contract = new (StellarSdk as any).Contract(this.contractId);
    const inv = ContractBuilders.buildReceiveRandomness(raffleId, randomness);

    const tx = new (StellarSdk as any).TransactionBuilder(account, {
      fee,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(contract.call(inv.method, ...inv.args))
      .setTimeout(30)
      .build();

    const simulated = await this.rpcServer.simulateTransaction(tx);
    if (simulated?.error || simulated?.restorePreamble?.error) {
      this.logger.warn(`Simulation returned an error: ${JSON.stringify(simulated)}`);
    }

    return this.rpcServer.prepareTransaction(tx);
  }

  private async pollForConfirmation(hash: string) {
    const started = Date.now();
    while (Date.now() - started < this.POLL_TIMEOUT_MS) {
      const res = await this.rpcServer.getTransaction(hash);
      const status = res?.status;
      if (status === 'SUCCESS' || status === 'FAILED') return res;
      await this.delay(this.POLL_INTERVAL_MS);
    }
    return { status: 'TIMEOUT' };
  }

  private isInsufficientFeeError(message: string): boolean {
    const m = message.toLowerCase();
    return m.includes('insufficient fee') || m.includes('tx_insufficient_fee');
  }

  private isRetriableError(error: unknown, message?: string): boolean {
    const normalized = (message || (error as any)?.message || String(error)).toLowerCase();

    if (this.isInsufficientFeeError(normalized) || this.isRpcError(normalized)) {
      return true;
    }

    if (
      normalized.includes('timeout') ||
      normalized.includes('temporarily unavailable') ||
      normalized.includes('try again') ||
      normalized.includes('rate limit') ||
      normalized.includes('too many requests')
    ) {
      return true;
    }

    if (
      normalized.includes('invalid') ||
      normalized.includes('malformed') ||
      normalized.includes('unauthorized') ||
      normalized.includes('forbidden') ||
      normalized.includes('revert') ||
      normalized.includes('failed (status=failed)')
    ) {
      return false;
    }

    return false;
  }

  private backoff(attempt: number): number {
    if (attempt <= 0) return 0;
    const base = this.initialBackoffMs * Math.pow(2, attempt - 1);
    return Math.min(base, 60_000);
  }

  private async logRetryAndBackoff(operation: string, attempt: number, reason: unknown): Promise<void> {
    if (attempt >= this.maxAttempts) {
      return;
    }

    const waitMs = this.backoff(attempt);
    const reasonText = this.errorToString(reason);
    this.logger.warn(
      `Retrying ${operation} (attempt ${attempt + 1}/${this.maxAttempts}) in ${waitMs}ms: ${reasonText}`,
    );
    await this.delay(waitMs);
  }

  private async handleFinalFailure(
    operation: string,
    attempts: number,
    error: unknown,
    logMessage: string,
    fields?: OracleLogFields,
  ): Promise<void> {
    this.logger.error(
      `${logMessage} Last error: ${this.errorToString(error)}`,
      fields ? JSON.stringify({ ...fields, outcome: 'failure' } as OracleLogFields) : undefined,
    );
    await this.sendFailureAlert(operation, attempts, error);
  }

  private async sendFailureAlert(operation: string, attempts: number, error: unknown): Promise<void> {
    if (!this.alertWebhookUrl) {
      return;
    }

    try {
      await fetch(this.alertWebhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          source: 'tikka-oracle',
          operation,
          attempts,
          error: this.errorToString(error),
          timestamp: new Date().toISOString(),
        }),
      });
    } catch (alertError) {
      this.logger.error(`Failed to send tx submitter alert webhook: ${this.errorToString(alertError)}`);
    }
  }

  private errorToString(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }

  private delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
