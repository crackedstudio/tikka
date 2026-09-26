import { Injectable, Inject, Optional } from '@nestjs/common';
import {
  TransactionBuilder,
  rpc,
  xdr,
  Address,
  Contract,
  nativeToScVal,
  scValToNative,
  BASE_FEE,
} from '@stellar/stellar-sdk';
import { RpcService } from '../network/rpc.service';
import { HorizonService } from '../network/horizon.service';
import { NetworkConfig } from '../network/network.config';
import { WalletAdapter } from '../wallet/wallet.interface';
import { getRaffleContractId } from './constants';
import { ContractFn, ContractFnName } from './bindings';
import {
  TikkaSdkError,
  TikkaSdkErrorCode,
  toTypedContractError,
  toTypedSdkError,
} from '../utils/errors';
import { TransactionLifecycle } from './lifecycle';
import type {
  TxMemo,
  PollConfig,
  SimulateResult,
  SubmitResult,
  InvokeLifecycleOptions,
} from './lifecycle';
export type { TxMemo } from './lifecycle';
export type { SimulateResult, SubmitResult, PollConfig } from './lifecycle';

import { ContractResponse, TxResponse } from './response';

export interface InvokeOptions {
  sourcePublicKey?: string;
  simulateOnly?: boolean;
  feeOverride?: number;
  fee?: string; // Kept for backwards compatibility
  /** Optional memo attached to the transaction envelope. */
  memo?: TxMemo;
  /** Optional polling configuration override. */
  poll?: PollConfig;
}

/**
 * Result of buildUnsigned — everything needed for offline / cold-wallet signing.
 *
 * Workflow:
 *   1. Call buildUnsigned() on an online machine → hand `unsignedXdr` to the signer
 *   2. Signer signs offline and returns `signedXdr`
 *   3. Call submitSigned(signedXdr) on the online machine to broadcast
 */
export interface UnsignedTxResult<T = any> {
  /** Base64-encoded unsigned (but fee-bumped & auth-populated) transaction XDR */
  unsignedXdr: string;
  /** Simulated return value — lets the caller review the outcome before signing */
  simulatedResult: TxResponse<T>;
  /** Estimated fee in stroops */
  fee: string;
  /** Network passphrase — must be passed to the signer so it signs the right network */
  networkPassphrase: string;
}

/**
 * Detects if an error message indicates a failure in an external contract
 * (e.g., a SEP-41 token contract rejecting a transfer).
 */
function isExternalSimulationError(errorMsg: string): boolean {
  return /external|token|sep-?41/i.test(errorMsg);
}

/** @deprecated Use SubmitResult from lifecycle instead. Kept for batchBuyTickets compatibility. */
export interface InvokeResult<T = any> {
  result: T;
  txHash: string;
  ledger: number;
}

@Injectable()
export class ContractService {
  private contractId: string;
  private lifecycle: TransactionLifecycle;

  constructor(
    private readonly rpc: RpcService,
    private readonly horizon: HorizonService,
    @Inject('NETWORK_CONFIG') private readonly networkConfig: NetworkConfig,
    @Optional() @Inject('WALLET_ADAPTER') private wallet?: WalletAdapter,
    contractId?: string,
  ) {
    this.contractId = contractId ?? getRaffleContractId(networkConfig.network);
    this.lifecycle = new TransactionLifecycle(rpc, horizon, networkConfig, wallet, this.contractId);
  }

  setContractId(id: string): void {
    this.contractId = id;
    this.lifecycle.setContractId(id);
  }

  setWallet(adapter: WalletAdapter): void {
    this.wallet = adapter;
    this.lifecycle.setWallet(adapter);
  }

  /**
   * Returns the public key of the currently connected wallet.
   * @throws {TikkaSdkError} code `WalletNotConnected` if no wallet is connected
   */
  async getPublicKey(): Promise<string> {
    if (!this.wallet) {
      throw new TikkaSdkError(TikkaSdkErrorCode.WalletNotConnected, 'No wallet connected');
    }
    return this.wallet.getPublicKey();
  }

  /* ---------------- STAGE METHODS (fine-grained pipeline) ---------------- */

  /**
   * Phase 1 — Build and simulate a transaction.
   * Returns the assembled XDR, decoded return value, fee, and network passphrase.
   * Safe to call without a wallet (uses anonymous fallback key).
   * @throws {TikkaSdkError} code `SimulationFailed` if the RPC simulation fails
   * @throws {TikkaSdkError} code `ContractError` if the contract returns an error
   * @throws {TikkaSdkError} code `ExternalContractError` if a cross-contract call failed
   * @throws {TikkaSdkError} code `NetworkError` if the RPC is unreachable
   * @throws {TikkaSdkError} code `Timeout` if the simulation times out
   */
  async simulate<T = unknown>(
    method: ContractFnName | string,
    params: any[],
    options: Pick<InvokeLifecycleOptions, 'sourcePublicKey' | 'fee' | 'memo'> = {},
  ): Promise<SimulateResult<T>> {
    return this.lifecycle.simulate<T>(method, params, options);
  }

  /**
   * Phase 2 — Sign an assembled transaction XDR via the connected wallet.
   * Returns the signed XDR string.
   * @throws {TikkaSdkError} code `WalletNotInstalled` if no wallet adapter is set
   * @throws {TikkaSdkError} code `UserRejected` if the user rejects the signature request
   * @throws {TikkaSdkError} code `Unknown` for other wallet signing failures
   */
  async sign(assembledXdr: string, networkPassphrase?: string): Promise<string> {
    return this.lifecycle.sign(assembledXdr, networkPassphrase);
  }

  /**
   * Phase 3 — Submit a signed transaction XDR to the network.
   * Returns the transaction hash.
   * @throws {TikkaSdkError} code `TransactionRejected` if the RPC rejects the submission
   * @throws {TikkaSdkError} code `NetworkError` if the RPC is unreachable
   * @throws {TikkaSdkError} code `SubmissionFailed` if the submission fails
   */
  async submit(signedXdr: string): Promise<string> {
    return this.lifecycle.submit(signedXdr);
  }

  /**
   * Phase 4 — Poll for transaction confirmation.
   * Returns the on-chain return value, tx hash, and ledger.
   * @throws {TikkaSdkError} code `Timeout` if the confirmation timeout is exceeded
   * @throws {TikkaSdkError} code `ContractError` if the transaction failed on-chain
   * @throws {TikkaSdkError} code `ExternalContractError` if a cross-contract call failed
   * @throws {TikkaSdkError} code `NetworkError` if the RPC is unreachable
   */
  async poll<T = unknown>(txHash: string, config?: PollConfig): Promise<SubmitResult<T>> {
    return this.lifecycle.poll<T>(txHash, config);
  }

  /* ---------------- READ ONLY ---------------- */

  /**
   * Simulates a contract call without signing or submitting.
   * @throws {TikkaSdkError} code `SimulationFailed` if the simulation fails
   * @throws {TikkaSdkError} code `ContractError` if the contract returns an error
   * @throws {TikkaSdkError} code `ExternalContractError` if a cross-contract call failed
   * @throws {TikkaSdkError} code `NetworkError` if the RPC is unreachable
   */
  async simulateReadOnly<T>(
    method: ContractFnName | string,
    params: any[],
  ): Promise<TxResponse<T>> {
    const sourceKey = this.wallet
      ? await this.wallet.getPublicKey()
      : 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

    const account = await this.horizon.loadAccount(sourceKey).catch(() => {
      return { accountId: () => sourceKey, sequenceNumber: () => '0' } as any;
    });

    const contract = new Contract(this.contractId);
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.networkConfig.networkPassphrase,
    })
      .addOperation(contract.call(method, ...params.map((p) => this.toScVal(p))))
      .setTimeout(30)
      .build();

    const simResponse = await this.rpc.simulateTransaction(tx);

    if (rpc.Api.isSimulationError(simResponse)) {
      const errMsg = (simResponse as any).error ?? '';
      const message = `Read-only simulation of ${method} failed: ${errMsg}`;

      if (isExternalSimulationError(errMsg)) {
        throw new TikkaSdkError(TikkaSdkErrorCode.ExternalContractError, message, errMsg);
      }

      throw (
        toTypedContractError(message, errMsg) ??
        new TikkaSdkError(TikkaSdkErrorCode.SimulationFailed, message, errMsg)
      );
    }

    const successResp = simResponse as rpc.Api.SimulateTransactionSuccessResponse;
    const result = successResp.result?.retval;

    if (result === undefined) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.SimulationFailed,
        `Read-only simulation of ${method} returned no data`,
      );
    }

    return {
      // Carry both response styles (`success` flag and `status`) so callers
      // written against either convention observe success.
      success: true,
      status: 'SUCCESS' as const,
      value: scValToNative(result) as T,
    };
  }

  /* ---------------- FULL INVOKE ---------------- */

  /**
   * Full invoke: simulate → sign → submit → poll.
   * @throws {TikkaSdkError} code `WalletNotInstalled` if no wallet and simulateOnly is false
   * @throws {TikkaSdkError} code `SimulationFailed` if simulation fails
   * @throws {TikkaSdkError} code `UserRejected` if the user rejects the signature
   * @throws {TikkaSdkError} code `TransactionRejected` if the network rejects submission
   * @throws {TikkaSdkError} code `Timeout` if confirmation times out
   * @throws {TikkaSdkError} code `ContractError` if the transaction fails on-chain
   * @throws {TikkaSdkError} code `ExternalContractError` if a cross-contract call failed
   * @throws {TikkaSdkError} code `NetworkError` if the RPC is unreachable
   */
  async invoke<T = any>(
    method: ContractFnName | string,
    params: any[],
    options: InvokeOptions = {},
  ): Promise<TxResponse<T>> {
    try {
      if (!this.wallet && !options.simulateOnly) {
        throw new TikkaSdkError(TikkaSdkErrorCode.WalletNotInstalled, 'Wallet required');
      }

      const sim = await this.lifecycle.simulate<T>(method, params, {
        sourcePublicKey: options.sourcePublicKey,
        fee: options.feeOverride ? String(options.feeOverride) : options.fee,
        memo: options.memo,
      });

      if (options.simulateOnly) {
        return { success: true, value: sim.returnValue as T, transactionHash: '', ledger: 0 };
      }

      const signedXdr = await this.lifecycle.sign(sim.assembledXdr, sim.networkPassphrase);
      const txHash = await this.lifecycle.submit(signedXdr);
      const polled = await this.lifecycle.poll<T>(txHash, options.poll);

      return {
        success: true,
        value: polled.returnValue as T,
        transactionHash: polled.txHash,
        ledger: polled.ledger,
      };
    } catch (error: any) {
      // Carry both response styles (`success` flag and `status`) so callers
      // written against either convention observe the failure.
      return {
        success: false,
        status: 'ERROR' as const,
        error: error.message || String(error),
      };
    }
  }

  /* ---------------- OFFLINE / COLD-WALLET SIGNING ---------------- */

  /**
   * Builds a fully-prepared (simulated + auth-populated) unsigned transaction XDR.
   * @throws {TikkaSdkError} code `InvalidParams` if sourcePublicKey is empty
   * @throws {TikkaSdkError} code `SimulationFailed` if simulation fails
   * @throws {TikkaSdkError} code `ContractError` if the contract returns an error
   * @throws {TikkaSdkError} code `NetworkError` if the RPC is unreachable
   */
  async buildUnsigned<T = any>(
    method: ContractFnName | string,
    params: any[],
    sourcePublicKey: string,
    feeOverride?: number,
  ): Promise<UnsignedTxResult<T>> {
    if (!sourcePublicKey) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.InvalidParams,
        'sourcePublicKey is required for buildUnsigned',
      );
    }

    const sim = await this.lifecycle.simulate<T>(method, params, {
      sourcePublicKey,
      fee: feeOverride ? String(feeOverride) : undefined,
    });
    return {
      unsignedXdr: sim.assembledXdr,
      simulatedResult: { success: true, status: 'SUCCESS' as const, value: sim.returnValue as T },
      fee: sim.minResourceFee,
      networkPassphrase: sim.networkPassphrase,
    };
  }

  /**
   * Submits a signed transaction XDR that was previously built with buildUnsigned().
   * @throws {TikkaSdkError} code `InvalidParams` if signedXdr is empty
   * @throws {TikkaSdkError} code `TransactionRejected` if the network rejects submission
   * @throws {TikkaSdkError} code `Timeout` if confirmation times out
   * @throws {TikkaSdkError} code `ContractError` if the transaction fails on-chain
   * @throws {TikkaSdkError} code `NetworkError` if the RPC is unreachable
   */
  async submitSigned<T = any>(signedXdr: string): Promise<TxResponse<T>> {
    if (!signedXdr) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.InvalidParams,
        'signedXdr is required for submitSigned',
      );
    }

    const txHash = await this.lifecycle.submit(signedXdr);
    const polled = await this.lifecycle.poll<T>(txHash);
    return {
      success: true,
      value: polled.returnValue as T,
      transactionHash: polled.txHash,
      ledger: polled.ledger,
    };
  }

  /* ---------------- BATCH INVOKE ---------------- */

  /**
   * Batch purchases tickets for multiple raffles.
   * @throws {TikkaSdkError} code `WalletNotInstalled` if no wallet and simulateOnly is false
   * @throws {TikkaSdkError} code `InvalidParams` if source public key is missing
   * @throws {TikkaSdkError} code `SimulationFailed` if all batch purchases fail simulation
   * @throws {TikkaSdkError} code `SubmissionFailed` if batch submission fails
   * @throws {TikkaSdkError} code `ContractError` if the transaction fails on-chain
   * @throws {TikkaSdkError} code `ExternalContractError` if a cross-contract call failed
   * @throws {TikkaSdkError} code `NetworkError` if the RPC is unreachable
   */
  async batchBuyTickets(
    raffleId: number,
    count: number,
    options: InvokeOptions = {},
  ): Promise<TxResponse<number[]>> {
    if (!this.wallet && !options.simulateOnly) {
      throw new TikkaSdkError(TikkaSdkErrorCode.WalletNotInstalled, 'Wallet required');
    }

    const sourceKey =
      options.sourcePublicKey ?? (this.wallet ? await this.wallet.getPublicKey() : undefined);

    if (!sourceKey) {
      throw new TikkaSdkError(TikkaSdkErrorCode.InvalidParams, 'Missing source public key');
    }

    const account = await this.horizon.loadAccount(sourceKey);
    const contract = new Contract(this.contractId);

    let txBuilder = new TransactionBuilder(account, {
      fee: options.fee ?? BASE_FEE,
      networkPassphrase: this.networkConfig.networkPassphrase,
    });

    const params = [raffleId];
    for (let i = 0; i < count; i++) {
      txBuilder = txBuilder.addOperation(
        contract.call(ContractFn.BUY_TICKET, ...params.map((p) => this.toScVal(p))),
      );
    }

    const tx = txBuilder.setTimeout(30).build();

    const simResponse = await this.rpc.simulateTransaction(tx);

    if (rpc.Api.isSimulationError(simResponse)) {
      const errMsg = (simResponse as any).error ?? '';
      const message = `Batch simulation failed${errMsg ? `: ${errMsg}` : ''}`;
      throw (
        toTypedContractError(message, errMsg) ??
        new TikkaSdkError(TikkaSdkErrorCode.SimulationFailed, message, errMsg)
      );
    }

    const successSim = simResponse as rpc.Api.SimulateTransactionSuccessResponse;
    const preparedTx = rpc.assembleTransaction(tx, successSim).build();

    // With multiple ops, result is typically an array of results, but for now we just handle it generically.
    const simResult: any[] = successSim.result?.retval
      ? [scValToNative(successSim.result.retval)]
      : [];

    if (options.simulateOnly) {
      return {
        success: true,
        value: simResult as any,
        transactionHash: '',
        ledger: 0,
      };
    }

    const { signedXdr } = await this.wallet!.signTransaction(preparedTx.toXDR(), {
      networkPassphrase: this.networkConfig.networkPassphrase,
    });

    const signedTx = TransactionBuilder.fromXDR(signedXdr, this.networkConfig.networkPassphrase);

    const sendResp = await this.rpc.sendTransaction(signedTx);

    if (sendResp.status === 'ERROR') {
      throw new TikkaSdkError(TikkaSdkErrorCode.SubmissionFailed, 'Batch submission failed');
    }

    const txResp = await this.rpc.getTransaction(sendResp.hash);

    if (txResp.status === rpc.Api.GetTransactionStatus.FAILED) {
      const resultXdr = (txResp as any).resultXdr ?? '';
      const message = 'Batch transaction failed';
      throw (
        toTypedContractError(message, resultXdr) ??
        new TikkaSdkError(TikkaSdkErrorCode.ContractError, message, resultXdr)
      );
    }

    const successTx = txResp as rpc.Api.GetSuccessfulTransactionResponse;

    return {
      success: true,
      value: (successTx.returnValue ? [scValToNative(successTx.returnValue)] : simResult) as any,
      transactionHash: sendResp.hash,
      ledger: successTx.ledger,
    };
  }

  /* ---------------- HELPERS ---------------- */

  private toScVal(val: any): xdr.ScVal {
    if (val instanceof xdr.ScVal) return val;
    if (typeof val === 'string' && val.length === 56) {
      return new Address(val).toScVal();
    }
    return nativeToScVal(val);
  }
}
