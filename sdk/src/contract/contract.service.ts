import { Injectable, Inject, Optional } from '@nestjs/common';
import {
  TransactionBuilder,
  SorobanRpc,
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

export interface InvokeOptions {
  /** Override the default source account (uses wallet public key). */
  sourcePublicKey?: string;
  /** If true, only simulate — do not sign/submit. */
  simulateOnly?: boolean;
  /** Custom fee in stroops. Defaults to BASE_FEE. */
  fee?: string;
}

export interface InvokeResult<T = any> {
  /** Decoded return value from the contract */
  result: T;
  /** Transaction hash (empty for simulate-only calls) */
  txHash: string;
  /** Ledger sequence the tx was included in (0 for simulate-only) */
  ledger: number;
}

/**
 * ContractService — builds, simulates, signs and submits Soroban invoke txs.
 *
 * Injected with RpcService, HorizonService, NetworkConfig, and an optional
 * WalletAdapter (required only for write operations).
 */
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

  /** Override the contract ID at runtime (e.g. for factory-deployed contracts). */
  setContractId(id: string): void {
    this.contractId = id;
  }

  /** Swap wallet adapter at runtime (e.g. user connects a different wallet). */
  setWallet(adapter: WalletAdapter): void {
    this.wallet = adapter;
  }

  /* ------------------------------------------------------------------ */
  /*  Read-only simulation (no signing)                                  */
  /* ------------------------------------------------------------------ */

  /**
   * Simulates a read-only contract invocation and returns the decoded result.
   */
  async simulateReadOnly<T>(method: ContractFnName | string, params: any[]): Promise<T> {
    const sourceKey = this.wallet
      ? await this.wallet.getPublicKey()
      : 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'; // placeholder for read-only

    const account = await this.horizon.loadAccount(sourceKey).catch(() => {
      // For read-only, we can use a stub account
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

    if (SorobanRpc.Api.isSimulationError(simResponse)) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.SimulationFailed,
        `Read-only simulation of ${method} failed: ${(simResponse as any).error}`,
      );
    }

    const successResp = simResponse as SorobanRpc.Api.SimulateTransactionSuccessResponse;
    if (!successResp.result) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.SimulationFailed,
        `No result from simulation of ${method}`,
      );
    }

    return scValToNative(successResp.result.retval) as T;
  }

  /* ------------------------------------------------------------------ */
  /*  Full invoke (simulate → sign → submit → poll)                      */
  /* ------------------------------------------------------------------ */

  /**
   * Invoke a contract method with full lifecycle:
   * simulate → estimate fee → sign via wallet → submit → poll confirmation.
   */
  async invoke<T = any>(
    method: ContractFnName | string,
    params: any[],
    options: InvokeOptions = {},
  ): Promise<InvokeResult<T>> {
    if (!this.wallet && !options.simulateOnly) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.WalletNotInstalled,
        'A WalletAdapter must be set to sign transactions. Call setWallet() first.',
      );
    }

    // 1. Source account
    const sourceKey =
      options.sourcePublicKey ??
      (this.wallet ? await this.wallet.getPublicKey() : undefined);
    if (!sourceKey) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.InvalidParams,
        'No source public key available — connect a wallet or pass sourcePublicKey',
      );
    }

    const account = await this.horizon.loadAccount(sourceKey);

    // 2. Build transaction
    const contract = new Contract(this.contractId);
    const tx = new TransactionBuilder(account, {
      fee: options.fee ?? BASE_FEE,
      networkPassphrase: this.networkConfig.networkPassphrase,
    })
      .addOperation(contract.call(method, ...params.map((p) => this.toScVal(p))))
      .setTimeout(30)
      .build();

    // 3. Simulate
    const simResponse = await this.rpc.simulateTransaction(tx);

    if (SorobanRpc.Api.isSimulationError(simResponse)) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.SimulationFailed,
        `Simulation of ${method} failed: ${(simResponse as any).error}`,
      );
    }

    const successSim = simResponse as SorobanRpc.Api.SimulateTransactionSuccessResponse;

    // Prepare the transaction (adds auth, footprint, resource fees)
    const preparedTx = SorobanRpc.assembleTransaction(tx, successSim).build();

    // Decode result from simulation
    const simResult = successSim.result
      ? (scValToNative(successSim.result.retval) as T)
      : (undefined as unknown as T);

    if (options.simulateOnly) {
      return { result: simResult, txHash: '', ledger: 0 };
    }

    // 4. Sign via wallet adapter
    const xdrString = preparedTx.toXDR();
    const { signedXdr } = await this.wallet!.signTransaction(xdrString, {
      networkPassphrase: this.networkConfig.networkPassphrase,
    });

    // 5. Re-create the signed transaction envelope
    const signedTx = TransactionBuilder.fromXDR(
      signedXdr,
      this.networkConfig.networkPassphrase,
    );

    // 6. Submit
    const sendResp = await this.rpc.sendTransaction(signedTx);
    if (sendResp.status === 'ERROR') {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.SubmissionFailed,
        `Transaction submission returned ERROR: ${JSON.stringify(sendResp.errorResult)}`,
      );
    }

    // 7. Poll for confirmation
    const txResp = await this.rpc.getTransaction(sendResp.hash);
    if (txResp.status === SorobanRpc.Api.GetTransactionStatus.FAILED) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.ContractError,
        `Transaction ${sendResp.hash} failed on-chain`,
      );
    }

    const successTx = txResp as SorobanRpc.Api.GetSuccessfulTransactionResponse;
    const returnVal = successTx.returnValue
      ? (scValToNative(successTx.returnValue) as T)
      : simResult;

    return {
      result: returnVal,
      txHash: sendResp.hash,
      ledger: successTx.ledger,
    };
  }

  /* ------------------------------------------------------------------ */
  /*  Helpers                                                            */
  /* ------------------------------------------------------------------ */

  /**
   * Best-effort conversion of JS values to Soroban ScVal.
   * For complex types, callers should pass pre-built xdr.ScVal directly.
   */
  private toScVal(val: any): xdr.ScVal {
    // Already an ScVal — pass through
    if (val instanceof xdr.ScVal) return val;

    // Address type
    if (typeof val === 'string' && val.startsWith('G') && val.length === 56) {
      return new Address(val).toScVal();
    }
    // Contract ID (C...)
    if (typeof val === 'string' && val.startsWith('C') && val.length === 56) {
      return new Address(val).toScVal();
    }

    return nativeToScVal(val);
  }
}
