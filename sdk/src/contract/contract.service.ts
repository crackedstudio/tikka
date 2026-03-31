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
import { ContractFnName } from './bindings';
import { TikkaSdkError, TikkaSdkErrorCode } from '../utils/errors';
import { TransactionLifecycle } from './lifecycle';
import type { TxMemo, PollConfig } from './lifecycle';
export type { TxMemo } from './lifecycle';

export interface InvokeOptions {
  sourcePublicKey?: string;
  simulateOnly?: boolean;
  fee?: string;
  /** Optional memo attached to the transaction envelope. */
  memo?: TxMemo;
  /** Optional polling configuration override. */
  poll?: PollConfig;
}

export interface InvokeResult<T = any> {
  result: T;
  txHash: string;
  ledger: number;
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
  simulatedResult: T;
  /** Estimated fee in stroops */
  fee: string;
  /** Network passphrase — must be passed to the signer so it signs the right network */
  networkPassphrase: string;
}

export interface SubmitSignedResult<T = any> {
  result: T;
  txHash: string;
  ledger: number;
}

/**
 * Detects if an error message indicates a failure in an external contract
 * (e.g., a SEP-41 token contract rejecting a transfer).
 */
function isExternalSimulationError(errorMsg: string): boolean {
  return /external|token|sep-?41/i.test(errorMsg);
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
  ) {
    this.contractId = getRaffleContractId(networkConfig.network);
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

  /* ---------------- READ ONLY ---------------- */

  async simulateReadOnly<T>(method: ContractFnName | string, params: any[]): Promise<T> {
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
      const code = isExternalSimulationError(errMsg)
        ? TikkaSdkErrorCode.ExternalContractError
        : TikkaSdkErrorCode.SimulationFailed;
      throw new TikkaSdkError(
        code,
        `Read-only simulation of ${method} failed: ${errMsg}`,
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

    return scValToNative(result) as T;
  }

  /* ---------------- FULL INVOKE ---------------- */

  async invoke<T = any>(
    method: ContractFnName | string,
    params: any[],
    options: InvokeOptions = {},
  ): Promise<InvokeResult<T>> {
    if (!this.wallet && !options.simulateOnly) {
      throw new TikkaSdkError(TikkaSdkErrorCode.WalletNotInstalled, 'Wallet required');
    }

    const sim = await this.lifecycle.simulate<T>(method, params, {
      sourcePublicKey: options.sourcePublicKey,
      fee: options.fee,
      memo: options.memo,
    });

    if (options.simulateOnly) {
      return { result: sim.returnValue as T, txHash: '', ledger: 0 };
    }

    const signedXdr = await this.lifecycle.sign(sim.assembledXdr, sim.networkPassphrase);
    const txHash    = await this.lifecycle.submit(signedXdr);
    const polled    = await this.lifecycle.poll<T>(txHash, options.poll);
    return { result: polled.returnValue as T, txHash: polled.txHash, ledger: polled.ledger };
  }

  /* ---------------- OFFLINE / COLD-WALLET SIGNING ---------------- */

  /**
   * Builds a fully-prepared (simulated + auth-populated) unsigned transaction XDR.
   */
  async buildUnsigned<T = any>(
    method: ContractFnName | string,
    params: any[],
    sourcePublicKey: string,
    fee?: string,
  ): Promise<UnsignedTxResult<T>> {
    if (!sourcePublicKey) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.InvalidParams,
        'sourcePublicKey is required for buildUnsigned',
      );
    }

    const sim = await this.lifecycle.simulate<T>(method, params, { sourcePublicKey, fee });
    return {
      unsignedXdr:      sim.assembledXdr,
      simulatedResult:  sim.returnValue as T,
      fee:              sim.minResourceFee,
      networkPassphrase: sim.networkPassphrase,
    };
  }

  /**
   * Submits a signed transaction XDR that was previously built with buildUnsigned().
   */
  async submitSigned<T = any>(signedXdr: string): Promise<SubmitSignedResult<T>> {
    if (!signedXdr) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.InvalidParams,
        'signedXdr is required for submitSigned',
      );
    }

    const txHash = await this.lifecycle.submit(signedXdr);
    const polled = await this.lifecycle.poll<T>(txHash);
    return { result: polled.returnValue as T, txHash: polled.txHash, ledger: polled.ledger };
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
