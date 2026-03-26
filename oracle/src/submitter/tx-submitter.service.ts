import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as StellarSdk from 'stellar-sdk';
import { RandomnessResult } from '../queue/queue.types';

export interface SubmitResult {
  txHash: string;
  ledger: number;
  success: boolean;
}

@Injectable()
export class TxSubmitterService {
  private readonly logger = new Logger(TxSubmitterService.name);
  private readonly rpcServer: any;
  private readonly contractId: string;
  private readonly networkPassphrase: string;
  private readonly oracleSecret: string;

  private readonly MAX_RETRIES = 5;
  private readonly INITIAL_BACKOFF_MS = 1000;
  private readonly POLL_TIMEOUT_MS = 30000;
  private readonly POLL_INTERVAL_MS = 1000;

  constructor(private readonly configService: ConfigService) {
    const rpcUrl =
      this.configService.get<string>('SOROBAN_RPC_URL') ||
      'https://soroban-testnet.stellar.org';
    this.rpcServer = new (StellarSdk as any).SorobanRpc.Server(rpcUrl);

    this.contractId =
      this.configService.get<string>('RAFFLE_CONTRACT_ID') || '';
    this.networkPassphrase =
      this.configService.get<string>('NETWORK_PASSPHRASE') ||
      (StellarSdk as any).Networks?.TESTNET ||
      'Test SDF Network ; September 2015';
    this.oracleSecret =
      this.configService.get<string>('ORACLE_SECRET_KEY') ||
      this.configService.get<string>('ORACLE_SECRET') ||
      '';

    if (!this.contractId) {
      this.logger.warn(
        'RAFFLE_CONTRACT_ID not configured; TxSubmitter will fail to submit.',
      );
    }
    if (!this.oracleSecret) {
      this.logger.warn(
        'ORACLE_SECRET_KEY not configured; TxSubmitter cannot sign transactions.',
      );
    }
  }
  /**
   * Submits receive_randomness transaction to the Soroban contract
   * @param raffleId The raffle ID
   * @param randomness The seed and proof
   * @returns Transaction result
   */
  async submitRandomness(
    raffleId: number,
    randomness: RandomnessResult,
  ): Promise<SubmitResult> {
    if (!this.contractId || !this.oracleSecret) {
      this.logger.error(
        'Missing configuration for TxSubmitter (contract id or oracle secret).',
      );
      return { txHash: '', ledger: 0, success: false };
    }

    const kp = (StellarSdk as any).Keypair.fromSecret(this.oracleSecret);
    const publicKey = kp.publicKey();

    let attempt = 0;
    let feeBump = 1;
    let lastError: any = null;

    while (attempt < this.MAX_RETRIES) {
      attempt++;
      try {
        const prepared = await this.buildPreparedTx(
          publicKey,
          raffleId,
          randomness,
          feeBump,
        );

        prepared.sign(kp);

        const sendRes = await this.rpcServer.sendTransaction(prepared);
        const txHash = sendRes.hash || sendRes?.transactionHash || '';

        if (!txHash) {
          // If server returned immediate error with no hash
          const msg = JSON.stringify(sendRes);
          // Heuristic: adjust fee on insufficient fee
          if (this.isInsufficientFeeError(msg)) {
            this.logger.warn(
              `Insufficient fee detected on attempt ${attempt}; increasing fee and retrying.`,
            );
            feeBump = Math.max(feeBump * 2, feeBump + 1);
            await this.delay(this.backoff(attempt));
            continue;
          }
          this.logger.error(
            `Unexpected sendTransaction response without hash: ${msg}`,
          );
          lastError = new Error('sendTransaction returned no hash');
          await this.delay(this.backoff(attempt));
          continue;
        }

        const confirm = await this.pollForConfirmation(txHash);
        if (confirm?.status === 'SUCCESS') {
          const ledger =
            (confirm.ledger as number) ||
            (confirm.latestLedger as number) ||
            0;
          return { txHash, ledger, success: true };
        }

        if (confirm && this.isInsufficientFeeError(JSON.stringify(confirm))) {
          this.logger.warn(
            `Confirmation indicates insufficient fee on attempt ${attempt}; increasing fee.`,
          );
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
        this.logger.error(
          `Error submitting randomness (attempt ${attempt}/${this.MAX_RETRIES}): ${msg}`,
        );
        // Heuristic: bump fee if looks like insufficient fee
        if (this.isInsufficientFeeError(msg)) {
          feeBump = Math.max(feeBump * 2, feeBump + 1);
        }
        lastError = e;
        await this.delay(this.backoff(attempt));
      }
    }

    this.logger.error(
      `Persistent failure submitting randomness after ${this.MAX_RETRIES} attempts.`,
    );
    return { txHash: '', ledger: 0, success: false };
  }

  private async buildPreparedTx(
    sourceAddress: string,
    raffleId: number,
    randomness: RandomnessResult,
    feeBump: number,
  ) {
    const account = await this.rpcServer.getAccount(sourceAddress);
    const fee =
      (Number((StellarSdk as any).BASE_FEE || 100) * feeBump).toString();

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
    if (
      simulated?.error ||
      simulated?.result === 'error' ||
      simulated?.restorePreamble?.error
    ) {
      this.logger.warn(
        `Simulation returned an error: ${JSON.stringify(simulated)}`,
      );
      // Continue to prepare anyway; some nodes still allow prepare to populate footprint
    }

    const prepared = await this.rpcServer.prepareTransaction(tx);
    return prepared;
  }

  private async pollForConfirmation(hash: string) {
    const started = Date.now();
    while (Date.now() - started < this.POLL_TIMEOUT_MS) {
      const res = await this.rpcServer.getTransaction(hash);
      const status = res?.status;
      if (status === 'SUCCESS' || status === 'FAILED') {
        return res;
      }
      await this.delay(this.POLL_INTERVAL_MS);
    }
    return { status: 'TIMEOUT' };
  }

  private isInsufficientFeeError(message: string): boolean {
    const m = message.toLowerCase();
    return (
      m.includes('insufficient fee') ||
      m.includes('tx_insufficient_fee') ||
      m.includes('insufficient_fee')
    );
  }

  private backoff(attempt: number): number {
    const base = this.INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
    const jitter = Math.floor(Math.random() * 250);
    return Math.min(base + jitter, 60_000);
  }

  private delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private parseToBytes(input: string, expectedLen?: number): Buffer {
    if (!input) return Buffer.alloc(expectedLen ?? 0);
    const hexLike = /^[0-9a-fA-F]+$/.test(input) && input.length % 2 === 0;
    let buf = hexLike ? Buffer.from(input, 'hex') : Buffer.from(input, 'utf8');
    if (expectedLen !== undefined) {
      if (buf.length > expectedLen) {
        buf = buf.subarray(0, expectedLen);
      } else if (buf.length < expectedLen) {
        const padded = Buffer.alloc(expectedLen);
        buf.copy(padded, 0);
        buf = padded;
      }
    }
    return buf;
  }
}
