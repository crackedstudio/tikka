import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as StellarSdk from '@stellar/stellar-sdk';
import { RandomnessResult } from '../queue/queue.types';
import { FeeEstimatorService } from './fee-estimator.service';
import { KeyService } from '../keys/key.service';

export interface SubmitResult {
  txHash: string;
  ledger: number;
  success: boolean;
  feePaid?: number;
}

@Injectable()
export class TxSubmitterService {
  private readonly logger = new Logger(TxSubmitterService.name);
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
    private readonly configService: ConfigService,
    private readonly feeEstimator: FeeEstimatorService,
    private readonly keyService: KeyService,
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

  async submitCommitment(raffleId: number, commitment: string): Promise<SubmitResult> {
    if (!this.contractId) {
      this.logger.error('Missing configuration for TxSubmitter (RAFFLE_CONTRACT_ID).');
      return { txHash: '', ledger: 0, success: false };
    }
    return this.submitContractCall('commit_randomness', [
      (StellarSdk as any).xdr.ScVal.scvU32(raffleId >>> 0),
      (StellarSdk as any).xdr.ScVal.scvBytes(this.parseToBytes(commitment, 32)),
    ]);
  }

  async submitReveal(raffleId: number, secret: string, nonce: string): Promise<SubmitResult> {
    if (!this.contractId) {
      this.logger.error('Missing configuration for TxSubmitter (RAFFLE_CONTRACT_ID).');
      return { txHash: '', ledger: 0, success: false };
    }
    return this.submitContractCall('reveal_randomness', [
      (StellarSdk as any).xdr.ScVal.scvU32(raffleId >>> 0),
      (StellarSdk as any).xdr.ScVal.scvBytes(this.parseToBytes(secret, 32)),
      (StellarSdk as any).xdr.ScVal.scvBytes(this.parseToBytes(nonce, 16)),
    ]);
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
          return { txHash, ledger: (confirm.ledger as number) || 0, success: true };
        }
        const confirmMessage = JSON.stringify(confirm);
        if (this.isInsufficientFeeError(confirmMessage)) {
          feeBump = Math.max(feeBump * 2, feeBump + 1);
        }
        const failure = new Error(`${method} failed (status=${confirm?.status || 'UNKNOWN'})`);
        lastError = failure;
        if (!this.isRetriableError(failure, confirmMessage)) {
          break;
        }
        await this.logRetryAndBackoff(method, attempt, lastError);
      } catch (e: any) {
        const msg = e?.message || String(e);
        if (this.isRpcError(msg)) this.failoverRpc();
        else if (this.isInsufficientFeeError(msg)) feeBump = Math.max(feeBump * 2, feeBump + 1);
        this.logger.error(`Error calling ${method} (attempt ${attempt}/${this.maxAttempts}): ${msg}`);
        lastError = e;
        if (!this.isRetriableError(e, msg)) {
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

  async submitRandomness(raffleId: number, randomness: RandomnessResult): Promise<SubmitResult> {
    if (!this.contractId) {
      this.logger.error('Missing configuration for TxSubmitter (RAFFLE_CONTRACT_ID).');
      return { txHash: '', ledger: 0, success: false };
    }

    const publicKey = await this.keyService.getPublicKey();

    let attempt = 0;
    let lastError: unknown = null;
    let feeBump = 1;

    // Get initial fee estimate from network stats
    const feeEstimate = await this.feeEstimator.estimateFee(0);
    this.logger.log(
      `Submitting randomness for raffle ${raffleId} with fee ${feeEstimate.cappedFee} stroops ` +
      `(p95: ${feeEstimate.priorityFee}, capped: ${feeEstimate.isCapped})`,
    );

    while (attempt < this.maxAttempts) {
      attempt++;
      try {
        const prepared = await this.buildPreparedTx(publicKey, raffleId, randomness, feeBump);
        await this.keyService.signTransaction(prepared);

        const sendRes = await this.rpcServer.sendTransaction(prepared);
        const txHash = sendRes.hash || sendRes?.transactionHash || '';

        if (!txHash) {
          const msg = JSON.stringify(sendRes);
          if (this.isInsufficientFeeError(msg)) {
            feeBump = Math.max(feeBump * 2, feeBump + 1);
            await this.logRetryAndBackoff('receive_randomness', attempt, msg);
            continue;
          }
          lastError = new Error('sendTransaction returned no hash');
          await this.logRetryAndBackoff('receive_randomness', attempt, lastError);
          continue;
        }

        const confirm = await this.pollForConfirmation(txHash);
        if (confirm?.status === 'SUCCESS') {
          const ledger = (confirm.ledger as number) || (confirm.latestLedger as number) || 0;
          return { txHash, ledger, success: true };
        }

        if (confirm && this.isInsufficientFeeError(JSON.stringify(confirm))) {
          feeBump = Math.max(feeBump * 2, feeBump + 1);
          await this.logRetryAndBackoff('receive_randomness', attempt, JSON.stringify(confirm));
          continue;
        }

        lastError = new Error(
          `Transaction failed or not confirmed (status=${confirm?.status || 'UNKNOWN'})`,
        );
        if (!this.isRetriableError(lastError, JSON.stringify(confirm))) {
          break;
        }
        await this.logRetryAndBackoff('receive_randomness', attempt, lastError);
      } catch (e: any) {
        const msg = e?.message || String(e);
        if (this.isRpcError(msg)) {
          this.failoverRpc();
        } else if (this.isInsufficientFeeError(msg)) {
          feeBump = Math.max(feeBump * 2, feeBump + 1);
        }
        this.logger.error(`Error submitting randomness (attempt ${attempt}/${this.maxAttempts}): ${msg}`);
        lastError = e;
        if (!this.isRetriableError(e, msg)) {
          break;
        }
        await this.logRetryAndBackoff('receive_randomness', attempt, lastError);
      }
    }

    await this.handleFinalFailure(
      'receive_randomness',
      attempt,
      lastError,
      `Persistent failure submitting randomness for raffle ${raffleId} after ${attempt} attempts.`,
    );
    return { txHash: '', ledger: 0, success: false };
  }

  private failoverRpc(): void {
    const prev = this.rpcUrls[this.currentRpcIndex];
    this.currentRpcIndex = (this.currentRpcIndex + 1) % this.rpcUrls.length;
    const next = this.rpcUrls[this.currentRpcIndex];
    this.logger.warn(`RPC failover: ${prev} → ${next}`);
    this.rpcServer = this.buildServer(next);
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

    const seedBytes = this.parseToBytes(randomness.seed, 32);
    const proofBytes = this.parseToBytes(randomness.proof, 64);

    const contract = new (StellarSdk as any).Contract(this.contractId);
    const u32 = (StellarSdk as any).xdr.ScVal.scvU32(raffleId >>> 0);
    const seedVal = (StellarSdk as any).xdr.ScVal.scvBytes(seedBytes);
    const proofVal = (StellarSdk as any).xdr.ScVal.scvBytes(proofBytes);

    const tx = new (StellarSdk as any).TransactionBuilder(account, {
      fee,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(contract.call('receive_randomness', u32, seedVal, proofVal))
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
  ): Promise<void> {
    this.logger.error(`${logMessage} Last error: ${this.errorToString(error)}`);
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

  private parseToBytes(input: string, expectedLen?: number): Buffer {
    if (!input) return Buffer.alloc(expectedLen ?? 0);
    const hexLike = /^[0-9a-fA-F]+$/.test(input) && input.length % 2 === 0;
    let buf = hexLike ? Buffer.from(input, 'hex') : Buffer.from(input, 'utf8');
    if (expectedLen !== undefined) {
      if (buf.length > expectedLen) buf = buf.subarray(0, expectedLen);
      else if (buf.length < expectedLen) {
        const padded = Buffer.alloc(expectedLen);
        buf.copy(padded);
        buf = padded;
      }
    }
    return buf;
  }
}
