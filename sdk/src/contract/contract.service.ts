import { Injectable, Inject, Optional } from '@nestjs/common';
import {
  TransactionBuilder,
  Memo,
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

/**
 * Transaction memo — attach tracking data for analytics platforms or
 * external integrations. Mirrors Stellar's three memo types:
 *
 * - `{ type: 'text';   value: string }` — up to 28 UTF-8 bytes
 * - `{ type: 'id';     value: string }` — unsigned 64-bit integer as string
 * - `{ type: 'hash';   value: Buffer }` — 32-byte hash
 */
export type TxMemo =
  | { type: 'text'; value: string }
  | { type: 'id'; value: string }
  | { type: 'hash'; value: Buffer };

export interface InvokeOptions {
  sourcePublicKey?: string;
  simulateOnly?: boolean;
  fee?: string;
  /** Optional memo attached to the transaction envelope. */
  memo?: TxMemo;
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

@Injectable()
export class ContractService {
  private contractId: string;

  constructor(
    private readonly rpc: RpcService,
    private readonly horizon: HorizonService,
    @Inject('NETWORK_CONFIG') private readonly networkConfig: NetworkConfig,
    @Optional() @Inject('WALLET_ADAPTER') private wallet?: WalletAdapter,
  ) {
    this.contractId = getRaffleContractId(networkConfig.network);
  }

  setContractId(id: string): void {
    this.contractId = id;
  }

  setWallet(adapter: WalletAdapter): void {
    this.wallet = adapter;
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
      const code = isExternalContractFailure(errMsg)
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
        `Read-only simulation of ${method} returned no data`
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
      throw new TikkaSdkError(
        TikkaSdkErrorCode.WalletNotInstalled,
        'Wallet required'
      );
    }

    const sourceKey =
      options.sourcePublicKey ??
      (this.wallet ? await this.wallet.getPublicKey() : undefined);

    if (!sourceKey) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.InvalidParams,
        'Missing source public key'
      );
    }

    const account = await this.horizon.loadAccount(sourceKey);

    const contract = new Contract(this.contractId);
    const builder = new TransactionBuilder(account, {
      fee: options.fee ?? BASE_FEE,
      networkPassphrase: this.networkConfig.networkPassphrase,
    }).addOperation(contract.call(method, ...params.map((p) => this.toScVal(p))));

    if (options.memo) {
      builder.addMemo(this.buildMemo(options.memo));
    }

    const tx = builder.setTimeout(30).build();

    const simResponse = await this.rpc.simulateTransaction(tx);

    if (rpc.Api.isSimulationError(simResponse)) {
      const errMsg = (simResponse as any).error ?? '';
      const code = isExternalContractFailure(errMsg)
        ? TikkaSdkErrorCode.ExternalContractError
        : TikkaSdkErrorCode.SimulationFailed;
      throw new TikkaSdkError(
        code,
        `Simulation failed for ${method}: ${errMsg}`,
      );
    }

    const successSim = simResponse as rpc.Api.SimulateTransactionSuccessResponse;
    const preparedTx = rpc.assembleTransaction(tx, successSim).build();

    const simResult = successSim.result
      ? (scValToNative(successSim.result.retval) as T)
      : (undefined as unknown as T);

    if (options.simulateOnly) {
      return { result: simResult, txHash: '', ledger: 0 };
    }

    const { signedXdr } = await this.wallet!.signTransaction(
      preparedTx.toXDR(),
      { networkPassphrase: this.networkConfig.networkPassphrase }
    );

    const signedTx = TransactionBuilder.fromXDR(
      signedXdr,
      this.networkConfig.networkPassphrase
    );

    const sendResp = await this.rpc.sendTransaction(signedTx);

    if (sendResp.status === 'ERROR') {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.SubmissionFailed,
        'Submission failed'
      );
    }

    const txResp = await this.rpc.getTransaction(sendResp.hash);

    if (txResp.status === rpc.Api.GetTransactionStatus.FAILED) {
      const resultXdr = (txResp as any).resultXdr ?? '';
      const code = isExternalContractFailure(resultXdr)
        ? TikkaSdkErrorCode.ExternalContractError
        : TikkaSdkErrorCode.ContractError;
      throw new TikkaSdkError(
        code,
        `Transaction failed on-chain for ${method}`,
      );
    }

    const successTx = txResp as rpc.Api.GetSuccessfulTransactionResponse;

    return {
      result: successTx.returnValue
        ? (scValToNative(successTx.returnValue) as T)
        : simResult,
      txHash: sendResp.hash,
      ledger: successTx.ledger,
    };
  }

  /* ---------------- OFFLINE / COLD-WALLET SIGNING ---------------- */

  /**
   * Builds a fully-prepared (simulated + auth-populated) unsigned transaction XDR.
   *
   * Use this when the signing key is on a cold wallet or a separate machine:
   *   1. Call buildUnsigned() online to get the XDR + simulated result
   *   2. Transfer `unsignedXdr` to the air-gapped signer
   *   3. Sign it there and bring back `signedXdr`
   *   4. Call submitSigned(signedXdr) to broadcast
   *
   * Also useful for multisig flows where multiple parties must sign before submission.
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

    const account = await this.horizon.loadAccount(sourcePublicKey);
    const contract = new Contract(this.contractId);

    const tx = new TransactionBuilder(account, {
      fee: fee ?? BASE_FEE,
      networkPassphrase: this.networkConfig.networkPassphrase,
    })
      .addOperation(contract.call(method, ...params.map((p) => this.toScVal(p))))
      .setTimeout(30)
      .build();

    const simResponse = await this.rpc.simulateTransaction(tx);

    if (rpc.Api.isSimulationError(simResponse)) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.SimulationFailed,
        `Simulation of ${method} failed during buildUnsigned`,
      );
    }

    const successSim = simResponse as rpc.Api.SimulateTransactionSuccessResponse;
    const preparedTx = rpc.assembleTransaction(tx, successSim).build();

    const simulatedResult = successSim.result
      ? (scValToNative(successSim.result.retval) as T)
      : (undefined as unknown as T);

    return {
      unsignedXdr: preparedTx.toXDR(),
      simulatedResult,
      fee: preparedTx.fee,
      networkPassphrase: this.networkConfig.networkPassphrase,
    };
  }

  /**
   * Submits a signed transaction XDR that was previously built with buildUnsigned().
   *
   * The signed XDR can come from any source — a cold wallet, a hardware device,
   * a multisig coordinator, or a manual `stellar-sdk` signing step.
   */
  async submitSigned<T = any>(signedXdr: string): Promise<SubmitSignedResult<T>> {
    if (!signedXdr) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.InvalidParams,
        'signedXdr is required for submitSigned',
      );
    }

    const signedTx = TransactionBuilder.fromXDR(
      signedXdr,
      this.networkConfig.networkPassphrase,
    );

    const sendResp = await this.rpc.sendTransaction(signedTx);

    if (sendResp.status === 'ERROR') {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.SubmissionFailed,
        'Transaction submission failed in submitSigned',
      );
    }

    const txResp = await this.rpc.getTransaction(sendResp.hash);

    if (txResp.status === rpc.Api.GetTransactionStatus.FAILED) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.ContractError,
        'Transaction failed on-chain in submitSigned',
      );
    }

    const successTx = txResp as rpc.Api.GetSuccessfulTransactionResponse;

    return {
      result: successTx.returnValue
        ? (scValToNative(successTx.returnValue) as T)
        : (undefined as unknown as T),
      txHash: sendResp.hash,
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

  private buildMemo(memo: TxMemo): Memo {
    switch (memo.type) {
      case 'text': return Memo.text(memo.value);
      case 'id':   return Memo.id(memo.value);
      case 'hash': return Memo.hash(memo.value);
    }
  }
}