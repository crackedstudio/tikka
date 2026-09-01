import { OracleLoggerService, OracleLogFields } from '../logger/oracle-logger';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as StellarSdk from '@stellar/stellar-sdk';
import { RandomnessResult } from '../queue/queue.types';
import { FeeEstimatorService, FeeEstimate } from './fee-estimator.service';
import { KeyService } from '../keys/key.service';
import { FeeStrategyService } from './fee-strategy';
import { ContractBuilders } from '../contract/contract.builders';
import { MetricsService } from '../metrics/metrics.service';
import { TxBuilderService } from './tx-builder';
import { SubmissionService } from './submission';
import { ErrorClassifier } from './error-classifier';

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

export type TransactionOutcome =
  | { status: 'SUCCESS'; txHash: string; ledger: number; feePaid: number; retriable: false }
  | { status: 'DUPLICATE_SUCCESS'; txHash: string; ledger: number; message: string; retriable: false }
  | { status: 'TIMEOUT'; txHash?: string; error: string; retriable: true; pollAttempts: number }
  | { status: 'INSUFFICIENT_FEE'; error: string; retriable: true; currentFee: number; suggestedFee?: number }
  | { status: 'NETWORK_ERROR'; error: string; retriable: true; rpcUrl?: string; errorCode?: string }
  | { status: 'FAILED'; txHash?: string; error: string; retriable: false; failureReason?: string }
  | { status: 'INVALID_TRANSACTION'; error: string; retriable: false; validationError?: string };

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
  private readonly maxFeeBump: number;
  private readonly alertWebhookUrl?: string;
  private readonly errorClassifier: ErrorClassifier;

  constructor(
    private readonly logger: OracleLoggerService,
    private readonly configService: ConfigService,
    private readonly feeEstimator: FeeEstimatorService,
    private readonly keyService: KeyService,
    private readonly feeStrategy: FeeStrategyService,
    private readonly txBuilder: TxBuilderService,
    private readonly submissionService: SubmissionService,
    @Optional() private readonly metricsService?: MetricsService,
  ) {
    const primary = this.configService.get<string>('SOROBAN_RPC_URL') || 'https://soroban-testnet.stellar.org';
    const fallbacks = (this.configService.get<string>('SOROBAN_RPC_FALLBACK_URLS') || '').split(',').map((u) => u.trim()).filter(Boolean);
    this.rpcUrls = [primary, ...fallbacks];
    this.rpcServer = this.submissionService.buildServer(this.rpcUrls[0]);

    this.contractId = this.configService.get<string>('RAFFLE_CONTRACT_ID') || '';
    this.networkPassphrase = this.configService.get<string>('NETWORK_PASSPHRASE') || (StellarSdk as any).Networks?.TESTNET || 'Test SDF Network ; September 2015';

    if (!this.contractId) {
      this.logger.warn('RAFFLE_CONTRACT_ID not configured; TxSubmitter will fail to submit.');
    }

    this.maxAttempts = this.configService.get<number>('TX_SUBMIT_MAX_ATTEMPTS', 5);
    this.initialBackoffMs = this.configService.get<number>('TX_SUBMIT_INITIAL_BACKOFF_MS', 1000);
    this.maxFeeBump = this.configService.get<number>('TX_SUBMIT_MAX_FEE_BUMP', 10);
    this.alertWebhookUrl = this.configService.get<string>('TX_SUBMIT_ALERT_WEBHOOK_URL');
    this.errorClassifier = new ErrorClassifier(this.rpcUrls, this.currentRpcIndex);
  }

  async submitRandomnessTyped(
    raffleId: number,
    requestId: string,
    randomness: RandomnessResult,
  ): Promise<TransactionOutcome> {
    this.metricsService?.recordComponentHeartbeat('submitter');
    const startTime = Date.now();
    const telemetry: TelemetryContext = { raffleId, requestId, attempt: 0, timestamp: new Date().toISOString() };

    if (!this.contractId) {
      return this.createInvalidTransactionOutcome('Missing RAFFLE_CONTRACT_ID configuration', telemetry);
    }

    try {
      const publicKey = await this.keyService.getPublicKey();
      let feeBump = 1;
      const feeEstimate = await this.feeEstimator.estimateFee(0);
      const baseFee = feeEstimate.cappedFee;

      this.logTelemetry({ ...telemetry, currentState: TransactionState.BUILDING }, `Starting randomness submission with fee ${baseFee} stroops`);

      for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
        telemetry.attempt = attempt;

        try {
          telemetry.currentState = TransactionState.BUILDING;
          const prepared = await this.txBuilder.buildPreparedTx(this.rpcServer, this.contractId, this.networkPassphrase, publicKey, raffleId, randomness, feeBump);

          telemetry.currentState = TransactionState.SIGNING;
          await this.keyService.signTransaction(prepared);

          telemetry.currentState = TransactionState.SUBMITTING;
          const submitResult = await this.submissionService.submitTransactionWithRetry(this.rpcServer, prepared, telemetry, this.errorClassifier, this.logTelemetry.bind(this));

          if (submitResult.outcome) {
            telemetry.durationMs = Date.now() - startTime;
            telemetry.finalOutcome = this.mapOutcomeToState(submitResult.outcome);
            telemetry.txHash = 'txHash' in submitResult.outcome ? submitResult.outcome.txHash : undefined;
            
            if (submitResult.outcome.status === 'SUCCESS') {
               const feePaid = (submitResult.outcome as any).feePaid || (Number((StellarSdk as any).BASE_FEE || 100) * feeBump);
               this.feeStrategy.recordRevealCost(raffleId, 'PRNG', feePaid);
               submitResult.outcome.feePaid = feePaid;
            } else if (submitResult.outcome.status === 'FAILED' || submitResult.outcome.status === 'TIMEOUT') {
               this.feeStrategy.recordSubmissionFailure(raffleId, 'PRNG', submitResult.outcome.error);
            }
            this.logTelemetry(telemetry, `Transaction completed: ${submitResult.outcome.status}`);
            return submitResult.outcome;
          }

          if (submitResult.shouldRetry) {
            if (submitResult.bumpFee) {
              const prevBump = feeBump;
              feeBump = Math.min(Math.max(feeBump * 2, feeBump + 1), this.maxFeeBump);
              if (feeBump > prevBump) this.feeStrategy.recordFeeBump(telemetry.raffleId || 0, 'PRNG', feeBump);
              this.logTelemetry(telemetry, `Bumping fee multiplier to ${feeBump}x`);
            }
            await this.logRetryAndBackoff('submitRandomnessTyped', attempt, new Error('Retry requested'));
          } else {
             const outcome = this.errorClassifier.classifyError(new Error('Unknown non-retriable error'), 'Unknown non-retriable error', telemetry);
             telemetry.durationMs = Date.now() - startTime;
             telemetry.finalOutcome = this.mapOutcomeToState(outcome);
             this.logTelemetry(telemetry, `Transaction completed: ${outcome.status}`);
             return outcome;
          }
        } catch (e: any) {
          if (this.errorClassifier.isRpcError(this.errorClassifier.errorToString(e))) {
             this.failoverRpc();
          }
          await this.logRetryAndBackoff('submitRandomnessTyped', attempt, e);
        }
      }

      const exhaustedOutcome = this.createExhaustedOutcome(telemetry);
      this.feeStrategy.recordSubmissionFailure(raffleId, 'PRNG', exhaustedOutcome.error);
      telemetry.durationMs = Date.now() - startTime;
      telemetry.finalOutcome = TransactionState.FAILED;
      this.logTelemetry(telemetry, `Transaction exhausted max attempts: ${exhaustedOutcome.error}`);
      return exhaustedOutcome;
    } catch (fatalError: any) {
      return this.createFatalOutcome(fatalError, telemetry);
    }
  }

  async submitRandomness(raffleId: number, randomness: RandomnessResult): Promise<SubmitResult> {
    const requestId = `legacy-req-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const outcome = await this.submitRandomnessTyped(raffleId, requestId, randomness);

    if (outcome.status === 'SUCCESS' || outcome.status === 'DUPLICATE_SUCCESS') {
      return { txHash: outcome.txHash, ledger: outcome.ledger, success: true, feePaid: 'feePaid' in outcome ? outcome.feePaid : undefined };
    }
    return { txHash: 'txHash' in outcome && outcome.txHash ? outcome.txHash : '', ledger: 0, success: false };
  }

  async submitCommitment(raffleId: number, commitment: string): Promise<SubmitResult> {
    try {
      const publicKey = await this.keyService.getPublicKey();
      const prepared = await this.txBuilder.buildCommitmentTx(this.rpcServer, this.contractId, this.networkPassphrase, publicKey, raffleId, commitment, 1);
      await this.keyService.signTransaction(prepared);
      const sendRes = await this.rpcServer.sendTransaction(prepared);
      const txHash = sendRes.hash || sendRes?.transactionHash || '';
      if (!txHash) return { txHash: '', ledger: 0, success: false };
      
      const confirm = await this.submissionService.pollForConfirmation(this.rpcServer, txHash);
      return { txHash, ledger: (confirm.ledger as number) || 0, success: confirm?.status === 'SUCCESS' };
    } catch (e: any) {
      this.logger.error(`Error calling submitCommitment: ${this.errorClassifier.errorToString(e)}`);
      return { txHash: '', ledger: 0, success: false };
    }
  }

  async submitReveal(raffleId: number, secret: string, nonce: string): Promise<SubmitResult> {
    try {
      const publicKey = await this.keyService.getPublicKey();
      const prepared = await this.txBuilder.buildRevealTx(this.rpcServer, this.contractId, this.networkPassphrase, publicKey, raffleId, secret, nonce, 1);
      await this.keyService.signTransaction(prepared);
      const sendRes = await this.rpcServer.sendTransaction(prepared);
      const txHash = sendRes.hash || sendRes?.transactionHash || '';
      if (!txHash) return { txHash: '', ledger: 0, success: false };

      const confirm = await this.submissionService.pollForConfirmation(this.rpcServer, txHash);
      return { txHash, ledger: (confirm.ledger as number) || 0, success: confirm?.status === 'SUCCESS' };
    } catch (e: any) {
      this.logger.error(`Error calling submitReveal: ${this.errorClassifier.errorToString(e)}`);
      return { txHash: '', ledger: 0, success: false };
    }
  }

  async estimateRandomnessSubmission(): Promise<RandomnessSubmissionPreview> {
    const sourceAddress = await this.keyService.getPublicKey();
    const feeEstimate = await this.feeEstimator.estimateFee(0);
    return { networkPassphrase: this.networkPassphrase, sourceAddress, feeEstimate, contractId: this.contractId, rpcUrl: this.rpcUrls[this.currentRpcIndex] };
  }

  async getRpcStatus(): Promise<{ url: string; healthy: boolean }[]> {
    return this.submissionService.getRpcStatus(this.rpcUrls);
  }

  private failoverRpc(): void {
    const prev = this.rpcUrls[this.currentRpcIndex];
    this.currentRpcIndex = (this.currentRpcIndex + 1) % this.rpcUrls.length;
    const next = this.rpcUrls[this.currentRpcIndex];
    this.logger.warn(`RPC failover: ${prev} → ${next}`);
    if (process.env.NODE_ENV !== 'test') {
      this.rpcServer = this.submissionService.buildServer(next);
      (this.errorClassifier as any).currentRpcIndex = this.currentRpcIndex;
    }
  }

  private createInvalidTransactionOutcome(message: string, telemetry: TelemetryContext): TransactionOutcome {
    this.logTelemetry({ ...telemetry, finalOutcome: TransactionState.INVALID_TRANSACTION }, `Invalid transaction: ${message}`);
    return { status: 'INVALID_TRANSACTION', error: message, retriable: false, validationError: 'CONFIGURATION_ERROR' };
  }

  private createExhaustedOutcome(telemetry: TelemetryContext): TransactionOutcome {
    const message = `Exhausted ${this.maxAttempts} retry attempts`;
    this.logTelemetry({ ...telemetry, finalOutcome: TransactionState.FAILED }, message);
    return { status: 'FAILED', txHash: telemetry.txHash, error: message, retriable: false, failureReason: 'MAX_ATTEMPTS_EXCEEDED' };
  }

  private createFatalOutcome(error: any, telemetry: TelemetryContext): TransactionOutcome {
    const errorMessage = this.errorClassifier.errorToString(error);
    this.logTelemetry({ ...telemetry, finalOutcome: TransactionState.FAILED }, `Fatal unexpected error: ${errorMessage}`);
    return { status: 'FAILED', txHash: telemetry.txHash, error: `Fatal error: ${errorMessage}`, retriable: false, failureReason: 'UNHANDLED_EXCEPTION' };
  }

  private mapOutcomeToState(outcome: TransactionOutcome): TransactionState {
    switch (outcome.status) {
      case 'SUCCESS': return TransactionState.SUCCESS;
      case 'DUPLICATE_SUCCESS': return TransactionState.DUPLICATE_SUCCESS;
      case 'TIMEOUT': return TransactionState.TIMEOUT;
      case 'INSUFFICIENT_FEE': return TransactionState.INSUFFICIENT_FEE;
      case 'NETWORK_ERROR': return TransactionState.NETWORK_ERROR;
      case 'INVALID_TRANSACTION': return TransactionState.INVALID_TRANSACTION;
      case 'FAILED': return TransactionState.FAILED;
    }
  }

  private backoff(attempt: number): number {
    if (attempt <= 0) return 0;
    const base = this.initialBackoffMs * Math.pow(2, attempt - 1);
    return Math.min(base, 60_000);
  }

  private async logRetryAndBackoff(operation: string, attempt: number, reason: unknown): Promise<void> {
    if (attempt >= this.maxAttempts) return;
    const waitMs = this.backoff(attempt);
    const reasonText = this.errorClassifier.errorToString(reason);
    this.logger.warn(`Retrying ${operation} (attempt ${attempt + 1}/${this.maxAttempts}) in ${waitMs}ms: ${reasonText}`);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  private logTelemetry(telemetry: TelemetryContext, message: string): void {
    const { currentState, finalOutcome, ...fields } = telemetry;
    const logLevel = finalOutcome === TransactionState.FAILED ? 'error' : (finalOutcome === TransactionState.TIMEOUT || finalOutcome === TransactionState.NETWORK_ERROR ? 'warn' : 'log');
    const enrichedFields: OracleLogFields = { ...fields, outcome: finalOutcome?.toString() || currentState?.toString() || 'unknown', context: TxSubmitterService.name };
    if (logLevel === 'error') {
      this.logger.error(`[TX-${telemetry.raffleId}-${telemetry.attempt}] ${message}`, JSON.stringify(enrichedFields));
    } else if (logLevel === 'warn') {
      this.logger.warn(`[TX-${telemetry.raffleId}-${telemetry.attempt}] ${message}`, JSON.stringify(enrichedFields));
    } else {
      this.logger.log(`[TX-${telemetry.raffleId}-${telemetry.attempt}] ${message}`, JSON.stringify(enrichedFields));
    }
  }
}
