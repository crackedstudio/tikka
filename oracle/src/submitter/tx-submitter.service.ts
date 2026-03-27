import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as StellarSdk from 'stellar-sdk';
import { RandomnessResult } from '../queue/queue.types';
import { RevealItem, BatchSubmitResult } from '../queue/batch-reveal.types';

const ALREADY_FINALISED_ERROR_CODE = 1;

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

  /**
   * Submits a batch of reveal items in a single Soroban transaction.
   * Falls back to single-item submitRandomness when items.length === 1.
   */
  async submitBatch(items: RevealItem[]): Promise<BatchSubmitResult> {
    if (items.length === 1) {
      const item = items[0];
      const result = await this.submitRandomness(item.raffleId, {
        seed: item.seed,
        proof: item.proof,
      } as RandomnessResult);
      return {
        txHash: result.txHash,
        ledger: result.ledger,
        items: [{ raffleId: item.raffleId, success: result.success }],
      };
    }

    if (!this.contractId || !this.oracleSecret) {
      this.logger.error(
        'Missing configuration for TxSubmitter (contract id or oracle secret).',
      );
      return {
        txHash: '',
        ledger: 0,
        items: items.map((i) => ({ raffleId: i.raffleId, success: false })),
      };
    }

    const kp = (StellarSdk as any).Keypair.fromSecret(this.oracleSecret);
    const publicKey = kp.publicKey();

    let attempt = 0;
    let feeBump = 1;

    while (attempt < this.MAX_RETRIES) {
      attempt++;
      try {
        const prepared = await this.buildBatchPreparedTx(
          publicKey,
          items,
          feeBump,
        );

        prepared.sign(kp);

        const sendRes = await this.rpcServer.sendTransaction(prepared);
        const txHash = sendRes.hash || sendRes?.transactionHash || '';

        if (!txHash) {
          const msg = JSON.stringify(sendRes);
          if (this.isInsufficientFeeError(msg)) {
            this.logger.warn(
              `Batch: insufficient fee on attempt ${attempt}; increasing fee and retrying.`,
            );
            feeBump = Math.max(feeBump * 2, feeBump + 1);
            await this.delay(this.backoff(attempt));
            continue;
          }
          this.logger.error(
            `Batch: unexpected sendTransaction response without hash: ${msg}`,
          );
          await this.delay(this.backoff(attempt));
          continue;
        }

        const confirm = await this.pollForConfirmation(txHash);
        if (confirm?.status === 'SUCCESS') {
          const ledger =
            (confirm.ledger as number) ||
            (confirm.latestLedger as number) ||
            0;
          const perItem = this.parseBatchReturnValue(
            confirm,
            items.map((i) => i.raffleId),
          );
          return { txHash, ledger, items: perItem };
        }

        if (confirm && this.isInsufficientFeeError(JSON.stringify(confirm))) {
          this.logger.warn(
            `Batch: confirmation indicates insufficient fee on attempt ${attempt}; increasing fee.`,
          );
          feeBump = Math.max(feeBump * 2, feeBump + 1);
          await this.delay(this.backoff(attempt));
          continue;
        }

        this.logger.error(
          `Batch: transaction failed or not confirmed (status=${confirm?.status || 'UNKNOWN'}) on attempt ${attempt}.`,
        );
        await this.delay(this.backoff(attempt));
      } catch (e: any) {
        const msg = e?.message || String(e);
        this.logger.error(
          `Batch: error submitting (attempt ${attempt}/${this.MAX_RETRIES}): ${msg}`,
        );
        if (this.isInsufficientFeeError(msg)) {
          feeBump = Math.max(feeBump * 2, feeBump + 1);
        }
        await this.delay(this.backoff(attempt));
      }
    }

    this.logger.error(
      `Batch: persistent failure after ${this.MAX_RETRIES} attempts.`,
    );
    return {
      txHash: '',
      ledger: 0,
      items: items.map((i) => ({ raffleId: i.raffleId, success: false })),
    };
  }

  private async buildBatchPreparedTx(
    sourceAddress: string,
    items: RevealItem[],
    feeBump: number,
  ) {
    const account = await this.rpcServer.getAccount(sourceAddress);
    const fee =
      (Number((StellarSdk as any).BASE_FEE || 100) * feeBump).toString();

    const tuples = items.map((item) => {
      const seedBytes = this.parseToBytes(item.seed, 32);
      const proofBytes = this.parseToBytes(item.proof, 64);
      return (StellarSdk as any).xdr.ScVal.scvVec([
        (StellarSdk as any).xdr.ScVal.scvU32(item.raffleId >>> 0),
        (StellarSdk as any).xdr.ScVal.scvBytes(seedBytes),
        (StellarSdk as any).xdr.ScVal.scvBytes(proofBytes),
      ]);
    });

    const batchVec = (StellarSdk as any).xdr.ScVal.scvVec(tuples);

    const contract = new (StellarSdk as any).Contract(this.contractId);

    const tx = new (StellarSdk as any).TransactionBuilder(account, {
      fee,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(contract.call('receive_randomness_batch', batchVec))
      .setTimeout(30)
      .build();

    const simulated = await this.rpcServer.simulateTransaction(tx);
    if (
      simulated?.error ||
      simulated?.result === 'error' ||
      simulated?.restorePreamble?.error
    ) {
      this.logger.warn(
        `Batch simulation warning: ${JSON.stringify(simulated)}`,
      );
      // Continue — log warnings without aborting (Req 3.2)
    }

    const prepared = await this.rpcServer.prepareTransaction(tx);
    return prepared;
  }

  /**
   * Parses Vec<Result<(), Error>> from the confirmed transaction return value.
   * Each inner vec is either [scvSymbol('Ok'), scvVoid()] or [scvSymbol('Err'), scvU32(errorCode)].
   */
  private parseBatchReturnValue(
    confirm: any,
    raffleIds: number[],
  ): Array<{ raffleId: number; success: boolean; errorCode?: string }> {
    try {
      const returnValue = confirm?.returnValue ?? confirm?.result?.retval;
      if (!returnValue) {
        return raffleIds.map((id) => ({ raffleId: id, success: false, errorCode: 'NO_RETURN_VALUE' }));
      }

      const outerVec: any[] = returnValue?.value?.() ?? returnValue?._value ?? [];

      return raffleIds.map((raffleId, idx) => {
        const entry = outerVec[idx];
        if (!entry) {
          return { raffleId, success: false, errorCode: 'MISSING_ENTRY' };
        }

        // Inner vec: [symbol, void|u32]
        const innerVec: any[] = entry?.value?.() ?? entry?._value ?? [];
        const tag = innerVec[0];
        const tagStr: string =
          tag?.value?.() ?? tag?._value ?? tag?.toString() ?? '';

        if (tagStr === 'Ok' || tagStr === 'ok') {
          return { raffleId, success: true };
        }

        // Err variant — extract error code
        const errVal = innerVec[1];
        const code: number =
          errVal?.value?.() ?? errVal?._value ?? errVal ?? 0;

        const errorCode =
          code === ALREADY_FINALISED_ERROR_CODE
            ? 'ALREADY_FINALISED'
            : String(code);

        return { raffleId, success: false, errorCode };
      });
    } catch (e: any) {
      this.logger.error(`Failed to parse batch return value: ${e?.message}`);
      return raffleIds.map((id) => ({ raffleId: id, success: false, errorCode: 'PARSE_ERROR' }));
    }
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
