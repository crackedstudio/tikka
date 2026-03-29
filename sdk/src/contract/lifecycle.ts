/**
 * lifecycle.ts
 *
 * TransactionLifecycle — owns the full Soroban transaction lifecycle:
 *
 *   simulate → sign → submit → poll
 *
 * Each phase is a separate method so callers can:
 *  - Preview fees before asking the user to sign  (simulate)
 *  - Obtain a signed XDR for offline / multisig flows  (simulate + sign)
 *  - Submit a pre-signed XDR from an external signer  (submit)
 *  - Poll separately from submit  (poll)
 *
 * The class is intentionally free of NestJS decorators so it can be
 * unit-tested without the DI container.  ContractService wraps it and
 * exposes the combined convenience methods (invoke, buildUnsigned, etc.).
 */

import {
  TransactionBuilder,
  Contract,
  Address,
  nativeToScVal,
  rpc,
  xdr,
  scValToNative,
  BASE_FEE,
} from '@stellar/stellar-sdk';
import { RpcService } from '../network/rpc.service';
import { HorizonService } from '../network/horizon.service';
import { NetworkConfig } from '../network/network.config';
import { WalletAdapter } from '../wallet/wallet.interface';
import { TikkaSdkError, TikkaSdkErrorCode } from '../utils/errors';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Successful simulation result — everything needed to decide whether to sign. */
export interface SimulateResult<T = unknown> {
  /** Decoded return value of the simulated call (null for void functions). */
  returnValue: T | null;
  /** Minimum resource fee in stroops, as a string. */
  minResourceFee: string;
  /** Assembled (fee-bumped + auth-populated) transaction XDR, ready to sign. */
  assembledXdr: string;
  /** Network passphrase — must be passed to the wallet so it signs the right network. */
  networkPassphrase: string;
}

/** Result returned after a transaction is confirmed on-chain. */
export interface SubmitResult<T = unknown> {
  /** Decoded on-chain return value (may differ from simulation if contract state changed). */
  returnValue: T | null;
  /** Transaction hash. */
  txHash: string;
  /** Ledger sequence in which the transaction was included. */
  ledger: number;
}

/** Configures the polling loop that waits for transaction confirmation. */
export interface PollConfig {
  /**
   * Maximum time (ms) to wait for the transaction to leave NOT_FOUND status.
   * @default 30_000
   */
  timeoutMs?: number;
  /**
   * Initial interval (ms) between poll attempts.
   * @default 2_000
   */
  intervalMs?: number;
  /**
   * Exponential backoff factor applied to `intervalMs` after each retry.
   * 1.0 = no backoff (constant interval). 1.5 = 50% longer each time.
   * @default 1.5
   */
  backoffFactor?: number;
  /**
   * Maximum interval (ms) between poll attempts — caps the backoff growth.
   * @default 10_000
   */
  maxIntervalMs?: number;
}

/** Combined options for a full invoke (simulate + sign + submit + poll). */
export interface InvokeLifecycleOptions {
  /** Override the source public key (defaults to wallet.getPublicKey()). */
  sourcePublicKey?: string;
  /** Override the transaction base fee (in stroops). Default: BASE_FEE. */
  fee?: string;
  /** Polling configuration. */
  poll?: PollConfig;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Detects Soroban contract errors in error messages / XDR. */
function isExternalContractFailure(msg: string): boolean {
  return msg.includes('HostError') || msg.includes('WASM') || msg.includes('cross-contract');
}

// ─── Class ───────────────────────────────────────────────────────────────────

/**
 * TransactionLifecycle manages the four-phase Soroban transaction lifecycle.
 *
 * ## Phase overview
 *
 * ```
 * simulate()   — build tx, call simulateTransaction, assemble fee+auth
 *   ↓
 * sign()       — pass assembledXdr to wallet; get signedXdr back
 *   ↓
 * submit()     — call sendTransaction with signedXdr
 *   ↓
 * poll()       — call getTransaction until SUCCESS / FAILED / timeout
 * ```
 *
 * `invoke()` runs all four phases in sequence and is the most convenient
 * entry point for standard write operations.
 */
export class TransactionLifecycle {
  constructor(
    private readonly rpc: RpcService,
    private readonly horizon: HorizonService,
    private readonly networkConfig: NetworkConfig,
    private readonly wallet: WalletAdapter | undefined,
    private readonly contractId: string,
  ) {}

  // ── Phase 1: Simulate ──────────────────────────────────────────────────────

  /**
   * Builds a transaction for `method` + `params`, simulates it, assembles the
   * final fee-bumped XDR, and returns the result including the decoded return value.
   *
   * Safe to call without a wallet (uses anonymous fallback key).
   *
   * @throws `TikkaSdkError(SimulationFailed)` if the RPC returns an error.
   */
  async simulate<T = unknown>(
    method: string,
    params: any[],
    options: Pick<InvokeLifecycleOptions, 'sourcePublicKey' | 'fee'> = {},
  ): Promise<SimulateResult<T>> {
    const sourceKey = options.sourcePublicKey ?? await this.resolveSourceKey();
    const tx = await this.buildTx(method, params, sourceKey, options.fee);

    const simResponse = await this.rpc.simulateTransaction(tx);

    if (rpc.Api.isSimulationError(simResponse)) {
      const errMsg = (simResponse as any).error ?? '';
      throw new TikkaSdkError(
        TikkaSdkErrorCode.SimulationFailed,
        `Simulation failed for "${method}": ${errMsg}`,
      );
    }

    const success = simResponse as rpc.Api.SimulateTransactionSuccessResponse;
    const assembled = rpc.assembleTransaction(tx, success).build();

    const returnValue = success.result?.retval
      ? (scValToNative(success.result.retval) as T)
      : null;

    return {
      returnValue,
      minResourceFee: success.minResourceFee,
      assembledXdr: assembled.toXDR(),
      networkPassphrase: this.networkConfig.networkPassphrase,
    };
  }

  // ── Phase 2: Sign ──────────────────────────────────────────────────────────

  /**
   * Passes `assembledXdr` to the connected wallet adapter and returns the signed XDR.
   *
   * @throws `TikkaSdkError(WalletNotInstalled)` if no wallet adapter is set.
   * @throws `TikkaSdkError(UserRejected)` if the wallet reports a rejection.
   */
  async sign(
    assembledXdr: string,
    networkPassphrase?: string,
  ): Promise<string> {
    if (!this.wallet) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.WalletNotInstalled,
        'No wallet adapter set — cannot sign the transaction',
      );
    }

    let signedXdr: string;
    try {
      const result = await this.wallet.signTransaction(assembledXdr, {
        networkPassphrase: networkPassphrase ?? this.networkConfig.networkPassphrase,
      });
      signedXdr = result.signedXdr;
    } catch (err: any) {
      const msg: string = err?.message ?? String(err);
      const isRejection =
        msg.toLowerCase().includes('reject') ||
        msg.toLowerCase().includes('denied') ||
        msg.toLowerCase().includes('cancel') ||
        msg.toLowerCase().includes('user declined');

      throw new TikkaSdkError(
        isRejection ? TikkaSdkErrorCode.UserRejected : TikkaSdkErrorCode.Unknown,
        `Wallet sign failed: ${msg}`,
        err,
      );
    }

    return signedXdr;
  }

  // ── Phase 3: Submit ────────────────────────────────────────────────────────

  /**
   * Submits a signed transaction XDR to the network and returns the transaction hash.
   *
   * @throws `TikkaSdkError(SubmissionFailed)` if the RPC rejects the submission.
   * @throws `TikkaSdkError(NetworkError)` if the RPC is unreachable.
   */
  async submit(signedXdr: string): Promise<string> {
    const signedTx = TransactionBuilder.fromXDR(
      signedXdr,
      this.networkConfig.networkPassphrase,
    );

    const sendResp = await this.rpc.sendTransaction(signedTx);

    if (sendResp.status === 'ERROR') {
      const detail = (sendResp as any).errorResultXdr ?? '';
      throw new TikkaSdkError(
        TikkaSdkErrorCode.SubmissionFailed,
        `Transaction submission failed: ${detail}`,
      );
    }

    return sendResp.hash;
  }

  // ── Phase 4: Poll ──────────────────────────────────────────────────────────

  /**
   * Polls the RPC for the transaction status until it reaches SUCCESS or FAILED,
   * applying exponential backoff between attempts.
   *
   * @param txHash  Transaction hash returned by `submit()`.
   * @param config  Optional polling configuration.
   * @throws `TikkaSdkError(Timeout)` if the timeout is exceeded.
   * @throws `TikkaSdkError(ContractError)` if the transaction failed on-chain.
   * @throws `TikkaSdkError(ExternalContractError)` if a cross-contract call failed.
   */
  async poll<T = unknown>(
    txHash: string,
    config: PollConfig = {},
  ): Promise<SubmitResult<T>> {
    const timeoutMs   = config.timeoutMs   ?? 30_000;
    const intervalMs  = config.intervalMs  ?? 2_000;
    const backoff     = config.backoffFactor ?? 1.5;
    const maxInterval = config.maxIntervalMs ?? 10_000;

    const deadline = Date.now() + timeoutMs;
    let currentInterval = intervalMs;
    let attempts = 0;

    while (Date.now() < deadline) {
      attempts++;
      const resp = await this.rpc.getTransaction(txHash, timeoutMs, currentInterval);

      if (resp.status === rpc.Api.GetTransactionStatus.SUCCESS) {
        const ok = resp as rpc.Api.GetSuccessfulTransactionResponse;
        return {
          returnValue: ok.returnValue
            ? (scValToNative(ok.returnValue) as T)
            : null,
          txHash,
          ledger: ok.ledger,
        };
      }

      if (resp.status === rpc.Api.GetTransactionStatus.FAILED) {
        const resultXdr = (resp as any).resultXdr ?? '';
        const code = isExternalContractFailure(resultXdr)
          ? TikkaSdkErrorCode.ExternalContractError
          : TikkaSdkErrorCode.ContractError;
        throw new TikkaSdkError(
          code,
          `Transaction ${txHash} failed on-chain (attempt ${attempts})`,
        );
      }

      // NOT_FOUND — apply backoff and retry
      if (Date.now() + currentInterval >= deadline) break;
      await this.sleep(currentInterval);
      currentInterval = Math.min(currentInterval * backoff, maxInterval);
    }

    throw new TikkaSdkError(
      TikkaSdkErrorCode.Timeout,
      `Transaction ${txHash} not confirmed within ${timeoutMs}ms (${attempts} attempts)`,
    );
  }

  // ── Combined: invoke ───────────────────────────────────────────────────────

  /**
   * Convenience method that runs all four phases in sequence:
   * simulate → sign → submit → poll.
   *
   * @throws Any of the per-phase errors.
   */
  async invoke<T = unknown>(
    method: string,
    params: any[],
    options: InvokeLifecycleOptions = {},
  ): Promise<SubmitResult<T>> {
    if (!this.wallet) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.WalletNotInstalled,
        'Wallet required for invoke()',
      );
    }

    const sim = await this.simulate<T>(method, params, options);
    const signedXdr = await this.sign(sim.assembledXdr, sim.networkPassphrase);
    const txHash = await this.submit(signedXdr);
    return this.poll<T>(txHash, options.poll);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async resolveSourceKey(): Promise<string> {
    if (this.wallet) {
      try {
        return await this.wallet.getPublicKey();
      } catch {
        // fall through
      }
    }
    return 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
  }

  private async buildTx(
    method: string,
    params: any[],
    sourceKey: string,
    fee?: string,
  ) {
    const account = await this.horizon.loadAccount(sourceKey).catch(() => ({
      accountId: () => sourceKey,
      sequenceNumber: () => '0',
      incrementSequenceNumber: () => {},
    } as any));

    const contract = new Contract(this.contractId);
    return new TransactionBuilder(account, {
      fee: fee ?? BASE_FEE,
      networkPassphrase: this.networkConfig.networkPassphrase,
    })
      .addOperation(
        contract.call(method, ...params.map((p) => this.toScVal(p))),
      )
      .setTimeout(30)
      .build();
  }

  private toScVal(val: any): xdr.ScVal {
    if (val instanceof xdr.ScVal) return val;
    if (typeof val === 'string' && val.length === 56) {
      return new Address(val).toScVal();
    }
    return nativeToScVal(val);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
