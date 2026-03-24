import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  Account,
  BASE_FEE,
  rpc,
  scValToNative,
  TransactionBuilder,
  xdr,
  Transaction,
} from '@stellar/stellar-sdk';
import { RpcService } from '../network/rpc.service';
import { SdkNetworkConfig, SDK_NETWORK_CONFIG } from '../network/network.config';
import { TxSigner } from '../wallet/wallet.adapter';
import { TikkaSdkError, TikkaSdkErrorCode } from '../utils/errors';

export interface TxExecuteOptions {
  sourceAddress: string;
  operation: xdr.Operation;
  signer: TxSigner;
}

export interface TxResult {
  txHash: string;
  ledger: number;
  resultXdr?: string;
}

const POLL_INTERVAL_MS = 1_000;
const POLL_TIMEOUT_MS = 30_000;

/** Dummy source account used for read-only simulations (no real account needed). */
const DUMMY_SOURCE = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

@Injectable()
export class TxLifecycleService {
  private readonly logger = new Logger(TxLifecycleService.name);

  constructor(
    private readonly rpcService: RpcService,
    @Inject(SDK_NETWORK_CONFIG) private readonly config: SdkNetworkConfig,
  ) {}

  /**
   * Full write lifecycle: simulate → assemble → sign → submit → poll.
   *
   * @throws TikkaSdkError with appropriate code on failure
   */
  async execute(opts: TxExecuteOptions): Promise<TxResult> {
    const { sourceAddress, operation, signer } = opts;
    const { networkPassphrase } = this.config;

    // 1. Fetch source account
    let account: Awaited<ReturnType<RpcService['getAccount']>>;
    try {
      account = await this.rpcService.getAccount(sourceAddress);
    } catch (err) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.NetworkError,
        'Failed to fetch account. Is the account funded?',
        err,
      );
    }

    // 2. Build transaction
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase,
    })
      .addOperation(operation)
      .setTimeout(30)
      .build();

    // 3. Simulate
    const simResponse = await this.rpcService.simulateTransaction(tx);

    if (rpc.Api.isSimulationError(simResponse)) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.SimulationFailed,
        `Transaction simulation failed: ${(simResponse as rpc.Api.SimulateTransactionErrorResponse).error}`,
        simResponse,
      );
    }

    // 4. Assemble — applies auth entries, footprint, and resource fees from simulation
    const assembled = rpc
      .assembleTransaction(
        tx,
        simResponse as rpc.Api.SimulateTransactionSuccessResponse,
      )
      .build();

    // 5. Sign
    let signedXdr: string;
    try {
      signedXdr = await signer.signTransaction(assembled.toXDR(), {
        networkPassphrase,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message.toLowerCase() : String(err);
      const isRejection =
        message.includes('cancel') ||
        message.includes('reject') ||
        message.includes('denied') ||
        message.includes('user');
      throw new TikkaSdkError(
        isRejection
          ? TikkaSdkErrorCode.UserRejected
          : TikkaSdkErrorCode.Unknown,
        isRejection
          ? 'Transaction signing was rejected'
          : 'Failed to sign transaction',
        err,
      );
    }

    // 6. Reconstruct signed transaction and submit
    const signedTx = TransactionBuilder.fromXDR(
      signedXdr,
      networkPassphrase,
    ) as Transaction;
    const sendResponse = await this.rpcService.sendTransaction(signedTx);

    if (sendResponse.status === 'ERROR') {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.SubmissionFailed,
        'Transaction submission failed',
        sendResponse.errorResult,
      );
    }

    const txHash = sendResponse.hash;
    this.logger.log(`Transaction submitted: ${txHash}`);

    // 7. Poll for confirmation
    return this.pollForConfirmation(txHash);
  }

  /**
   * Read-only simulation. Builds a transaction with a dummy source account,
   * simulates it, and returns the parsed return value.
   *
   * @throws TikkaSdkError(SimulationFailed) if simulation errors
   */
  async simulate<T>(operation: xdr.Operation): Promise<T> {
    const { networkPassphrase } = this.config;

    const account = new Account(DUMMY_SOURCE, '0');
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase,
    })
      .addOperation(operation)
      .setTimeout(30)
      .build();

    const simResponse = await this.rpcService.simulateTransaction(tx);

    if (rpc.Api.isSimulationError(simResponse)) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.SimulationFailed,
        `Simulation failed: ${(simResponse as rpc.Api.SimulateTransactionErrorResponse).error}`,
        simResponse,
      );
    }

    const successResponse =
      simResponse as rpc.Api.SimulateTransactionSuccessResponse;
    const retval = successResponse.result?.retval;
    if (!retval) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.SimulationFailed,
        'Simulation returned no result',
      );
    }

    return scValToNative(retval) as T;
  }

  private async pollForConfirmation(txHash: string): Promise<TxResult> {
    const deadline = Date.now() + POLL_TIMEOUT_MS;

    while (Date.now() < deadline) {
      try {
        const response = await this.rpcService.getTransaction(txHash);

        if (response.status === rpc.Api.GetTransactionStatus.SUCCESS) {
          return {
            txHash,
            ledger: response.latestLedger,
            resultXdr: response.resultXdr?.toXDR('base64'),
          };
        }

        if (response.status === rpc.Api.GetTransactionStatus.FAILED) {
          throw new TikkaSdkError(
            TikkaSdkErrorCode.SubmissionFailed,
            'Transaction failed on-chain',
            response.resultXdr?.toXDR('base64'),
          );
        }

        // NOT_FOUND means still pending — keep polling
      } catch (err) {
        if (err instanceof TikkaSdkError) throw err;
        // Swallow transient network errors during polling
        this.logger.warn(
          `Transient error polling tx ${txHash}: ${err instanceof Error ? err.message : err}`,
        );
      }

      await this.delay(POLL_INTERVAL_MS);
    }

    throw new TikkaSdkError(
      TikkaSdkErrorCode.Timeout,
      `Transaction ${txHash} not confirmed within ${POLL_TIMEOUT_MS / 1000}s`,
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
