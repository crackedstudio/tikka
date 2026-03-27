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

export interface InvokeOptions {
  sourcePublicKey?: string;
  simulateOnly?: boolean;
  fee?: string;
}

export interface InvokeResult<T = any> {
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
    const tx = new TransactionBuilder(account, {
      fee: options.fee ?? BASE_FEE,
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

  /* ---------------- HELPERS ---------------- */

  private toScVal(val: any): xdr.ScVal {
    if (val instanceof xdr.ScVal) return val;

    if (typeof val === 'string' && val.length === 56) {
      return new Address(val).toScVal();
    }

    return nativeToScVal(val);
  }
}

/**
 * Heuristic: detect whether a simulation/transaction error originates from
 * a cross-contract call into an external token contract rather than from the
 * raffle contract itself.
 *
 * Soroban surfaces these as `HostError` with `WasmVm` or `Contract` error
 * types, often containing "cross-contract" or the token contract address in
 * the error string. We also catch the common SEP-41 `transfer` trap codes.
 */
function isExternalContractFailure(errorText: string): boolean {
  if (!errorText) return false;
  const lower = errorText.toLowerCase();
  return (
    lower.includes('cross-contract') ||
    lower.includes('crosscontract') ||
    lower.includes('token') ||
    lower.includes('transfer') ||
    lower.includes('wasm_vm') ||
    lower.includes('wasmvm') ||
    // Soroban HostError codes for contract-level traps from sub-calls
    lower.includes('value_invalid') ||
    lower.includes('auth_required') ||
    lower.includes('insufficient_balance')
  );
}