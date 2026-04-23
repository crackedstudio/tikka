import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as StellarSdk from 'stellar-sdk';
import { RandomnessResult } from '../queue/queue.types';
import { FeeEstimatorService } from './fee-estimator.service';

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
  private readonly oracleSecret: string;

  private readonly MAX_RETRIES = 5;
  private readonly INITIAL_BACKOFF_MS = 1000;
  private readonly POLL_TIMEOUT_MS = 30000;
  private readonly POLL_INTERVAL_MS = 1000;

  constructor(private readonly configService: ConfigService) {
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
    this.oracleSecret =
      this.configService.get<string>('ORACLE_SECRET_KEY') ||
      this.configService.get<string>('ORACLE_SECRET') ||
      '';

    if (!this.contractId) {
      this.logger.warn('RAFFLE_CONTRACT_ID not configured; TxSubmitter will fail to submit.');
    }
    if (!this.oracleSecret) {
      this.logger.warn('ORACLE_SECRET_KEY not configured; TxSubmitter cannot sign transactions.');
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

  async submitCommitment(raffleId: number, commitment: string): Promise<SubmitResult> {
    if (!this.contractId || !this.oracleSecret) {
      this.logger.error('Missing configuration for TxSubmitter.');
      return { txHash: '', ledger: 0, success: false };
    }
    const kp = (StellarSdk as any).Keypair.fromSecret(this.oracleSecret);
    return this.submitContractCall(kp, 'commit_randomness', [
      (StellarSdk as any).xdr.ScVal.scvU32(raffleId >>> 0),
      (StellarSdk as any).xdr.ScVal.scvBytes(this.parseToBytes(commitment, 32)),
    ]);
  }

  async submitReveal(raffleId: number, secret: string, nonce: string): Promise<SubmitResult> {
    if (!this.contractId || !this.oracleSecret) {
      this.logger.error('Missing configuration for TxSubmitter.');
      return { txHash: '', ledger: 0, success: false };
    }
    const kp = (StellarSdk as any).Keypair.fromSecret(this.oracleSecret);
    return this.submitContractCall(kp, 'reveal_randomness', [
      (StellarSdk as any).xdr.ScVal.scvU32(raffleId >>> 0),
      (StellarSdk as any).xdr.ScVal.scvBytes(this.parseToBytes(secret, 32)),
      (StellarSdk as any).xdr.ScVal.scvBytes(this.parseToBytes(nonce, 16)),
    ]);
  }

  private async submitContractCall(kp: any, method: string, args: any[]): Promise<SubmitResult> {
    const publicKey = kp.publicKey();
    let feeBump = 1;
    let attempt = 0;
    let lastError: any = null;

    while (attempt < this.MAX_RETRIES) {
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
        prepared.sign(kp);

        const sendRes = await this.rpcServer.sendTransaction(prepared);
        const txHash = sendRes.hash || sendRes?.transactionHash || '';
        if (!txHash) {
          if (this.isInsufficientFeeError(JSON.stringify(sendRes))) {
            feeBump = Math.max(feeBump * 2, feeBump + 1);
          }
          lastError = new Error('sendTransaction returned no hash');
          await this.delay(this.backoff(attempt));
          continue;
        }

        const confirm = await this.pollForConfirmation(txHash);
        if (confirm?.status === 'SUCCESS') {
          return { txHash, ledger: (confirm.ledger as number) || 0, success: true };
        }
        if (this.isInsufficientFeeError(JSON.stringify(confirm))) {
          feeBump = Math.max(feeBump * 2, feeBump + 1);
        }
        lastError = new Error(`${method} failed (status=${confirm?.status || 'UNKNOWN'})`);
        await this.delay(this.backoff(attempt));
      } catch (e: any) {
        const msg = e?.message || String(e);
        if (this.isRpcError(msg)) this.failoverRpc();
        else if (this.isInsufficientFeeError(msg)) feeBump = Math.max(feeBump * 2, feeBump + 1);
        this.logger.error(`Error calling ${method} (attempt ${attempt}/${this.MAX_RETRIES}): ${msg}`);
        lastError = e;
        await this.delay(this.backoff(attempt));
      }
    }

    this.logger.error(`Persistent failure calling ${method} after ${this.MAX_RETRIES} attempts.`);
    return { txHash: '', ledger: 0, success: false };
  }

  async submitRandomness(raffleId: number, randomness: RandomnessResult): Promise<SubmitResult> {
    if (!this.contractId || !this.oracleSecret) {
      this.logger.error('Missing configuration for TxSubmitter (contract id or oracle secret).');
      return { txHash: '', ledger: 0, success: false };
    }

    const kp = (StellarSdk as any).Keypair.fromSecret(this.oracleSecret);
    const publicKey = kp.publicKey();

    let attempt = 0;
    let lastError: any = null;
    
    // Get initial fee estimate from network stats
    const feeEstimate = await this.feeEstimator.estimateFee(rafflePrizeXLM);
    let currentFee = feeEstimate.cappedFee;
    
    this.logger.log(
      `Submitting randomness for raffle ${raffleId} with fee ${currentFee} stroops ` +
      `(p95: ${feeEstimate.priorityFee}, capped: ${feeEstimate.isCapped})`,
    );

    while (attempt < this.MAX_RETRIES) {
      attempt++;
      try {
        const prepared = await this.buildPreparedTx(publicKey, raffleId, randomness, feeBump);
        prepared.sign(kp);

        const sendRes = await this.rpcServer.sendTransaction(prepared);
        const txHash = sendRes.hash || sendRes?.transactionHash || '';

        if (!txHash) {
          const msg = JSON.stringify(sendRes);
          if (this.isInsufficientFeeError(msg)) {
            feeBump = Math.max(feeBump * 2, feeBump + 1);
            await this.delay(this.backoff(attempt));
            continue;
          }
          lastError = new Error('sendTransaction returned no hash');
          await this.delay(this.backoff(attempt));
          continue;
        }

        const confirm = await this.pollForConfirmation(txHash);
        if (confirm?.status === 'SUCCESS') {
          const ledger = (confirm.ledger as number) || (confirm.latestLedger as number) || 0;
          return { txHash, ledger, success: true };
        }

        if (confirm && this.isInsufficientFeeError(JSON.stringify(confirm))) {
          feeBump = Math.max(feeBump * 2, feeBump + 1);
          await this.delay(this.backoff(attempt));
          continue;
        }

        lastError = new Error(
          `Transaction failed or not confirmed (status=${confirm?.status || 'UNKNOWN'})`,
        );
        await this.delay(this.backoff(attempt));
      } catch (e: any) {
        const msg = e?.message || String(e);
        if (this.isRpcError(msg)) {
          this.failoverRpc();
        } else if (this.isInsufficientFeeError(msg)) {
          feeBump = Math.max(feeBump * 2, feeBump + 1);
        }
        this.logger.error(`Error submitting randomness (attempt ${attempt}/${this.MAX_RETRIES}): ${msg}`);
        lastError = e;
        await this.delay(this.backoff(attempt));
      }
    }

    this.logger.error(`Persistent failure submitting randomness after ${this.MAX_RETRIES} attempts.`);
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
    return new (StellarSdk as any).SorobanRpc.Server(url);
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
    const fee = (Number((StellarSdk as any).BASE_FEE || 100) * feeBump).toString();

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

  /**
   * Bumps the fee by 50% with a cap to avoid runaway costs.
   */
  private bumpFee(currentFee: number, maxCap: number): number {
    const bumped = Math.floor(currentFee * 1.5);
    return Math.min(bumped, maxCap);
  }

  private backoff(attempt: number): number {
    const base = this.INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
    return Math.min(base + Math.floor(Math.random() * 250), 60_000);
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
