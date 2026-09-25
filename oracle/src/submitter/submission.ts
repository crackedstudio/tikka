import { Injectable, Logger } from '@nestjs/common';
import * as StellarSdk from '@stellar/stellar-sdk';
import { OracleLoggerService } from '../logger/oracle-logger';
import { TelemetryContext, TransactionOutcome, TransactionState } from './tx-submitter.service';
import { ErrorClassifier } from './error-classifier';

@Injectable()
export class SubmissionService {
  private readonly POLL_TIMEOUT_MS = 30000;
  private readonly POLL_INTERVAL_MS = 1000;

  constructor(private readonly logger: OracleLoggerService) {}

  public buildServer(url: string) {
    return new StellarSdk.rpc.Server(url);
  }

  public async getRpcStatus(rpcUrls: string[]): Promise<{ url: string; healthy: boolean }[]> {
    return Promise.all(
      rpcUrls.map(async (url) => {
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

  public async submitTransactionWithRetry(
    rpcServer: any,
    preparedTx: any,
    telemetry: TelemetryContext,
    errorClassifier: ErrorClassifier,
    logTelemetry: (telemetry: TelemetryContext, message: string) => void,
  ): Promise<{
    outcome?: TransactionOutcome;
    shouldRetry: boolean;
    bumpFee: boolean;
  }> {
    try {
      const sendRes = await rpcServer.sendTransaction(preparedTx);
      const txHash = sendRes.hash || sendRes?.transactionHash || '';

      if (errorClassifier.isDuplicateError(sendRes)) {
        telemetry.txHash = txHash || 'unknown';
        logTelemetry({ ...telemetry, currentState: TransactionState.DUPLICATE_SUCCESS }, 'Transaction already submitted, querying existing result');
        const existingResult = await this.queryExistingTransaction(rpcServer, txHash, telemetry, logTelemetry);
        return { outcome: existingResult, shouldRetry: false, bumpFee: false };
      }

      if (!txHash) {
        const responseStr = JSON.stringify(sendRes);
        if (errorClassifier.isInsufficientFeeError(responseStr)) {
          return { shouldRetry: true, bumpFee: true };
        }
        if (errorClassifier.isTimeoutError(responseStr)) {
          logTelemetry(telemetry, 'Submission timeout, attempting hash recovery');
          return { shouldRetry: true, bumpFee: true };
        }
        return { shouldRetry: true, bumpFee: false };
      }

      telemetry.txHash = txHash;
      telemetry.currentState = TransactionState.POLLING;
      logTelemetry(telemetry, `Polling for confirmation: ${txHash}`);

      const outcome = await this.pollForConfirmationTyped(rpcServer, txHash, telemetry, errorClassifier, logTelemetry);
      return { outcome, shouldRetry: outcome.retriable, bumpFee: outcome.status === 'TIMEOUT' };
    } catch (error: any) {
      const errorMessage = errorClassifier.errorToString(error);

      if (errorClassifier.isDuplicateError(error) || errorMessage.toLowerCase().includes('duplicate')) {
        const txHash = errorClassifier.extractTxHashFromError(error);
        if (txHash) {
          telemetry.txHash = txHash;
          const existingResult = await this.queryExistingTransaction(rpcServer, txHash, telemetry, logTelemetry);
          return { outcome: existingResult, shouldRetry: false, bumpFee: false };
        }
      }

      if (errorClassifier.isInsufficientFeeError(errorMessage)) {
        return { shouldRetry: true, bumpFee: true };
      }

      if (errorClassifier.isRpcError(errorMessage)) {
        return { shouldRetry: true, bumpFee: false };
      }

      if (errorClassifier.isRetriableError(error, errorMessage)) {
        return { shouldRetry: true, bumpFee: false };
      }

      const outcome = errorClassifier.classifyError(error, errorMessage, telemetry);
      return { outcome, shouldRetry: false, bumpFee: false };
    }
  }

  public async pollForConfirmationTyped(
    rpcServer: any,
    txHash: string,
    telemetry: TelemetryContext,
    errorClassifier: ErrorClassifier,
    logTelemetry: (telemetry: TelemetryContext, message: string) => void,
  ): Promise<TransactionOutcome> {
    const started = Date.now();
    let pollAttempts = 0;

    while (Date.now() - started < this.POLL_TIMEOUT_MS) {
      pollAttempts++;
      try {
        const res = await rpcServer.getTransaction(txHash);
        const status = res?.status;

        if (status === 'SUCCESS') {
          const ledger = (res.ledger as number) || (res.latestLedger as number) || 0;
          logTelemetry({ ...telemetry, finalOutcome: TransactionState.SUCCESS }, `Transaction confirmed at ledger ${ledger}`);
          return { status: 'SUCCESS', txHash, ledger, feePaid: 0, retriable: false };
        }

        if (status === 'FAILED') {
          const failureReason = errorClassifier.extractFailureReason(res);
          logTelemetry({ ...telemetry, finalOutcome: TransactionState.FAILED }, `Transaction failed: ${failureReason}`);
          return { status: 'FAILED', txHash, error: `Transaction failed on-chain: ${failureReason}`, retriable: false, failureReason };
        }

        if (status === 'NOT_FOUND') {
          await this.delay(this.POLL_INTERVAL_MS);
          continue;
        }

        await this.delay(this.POLL_INTERVAL_MS);
      } catch (error: any) {
        const errorMessage = errorClassifier.errorToString(error);
        if (errorClassifier.isRpcError(errorMessage)) {
          logTelemetry(telemetry, `Polling error (attempt ${pollAttempts}): ${errorMessage}`);
          await this.delay(this.POLL_INTERVAL_MS);
          continue;
        }
        logTelemetry(telemetry, `Polling exception: ${errorMessage}`);
        await this.delay(this.POLL_INTERVAL_MS);
      }
    }

    logTelemetry({ ...telemetry, finalOutcome: TransactionState.TIMEOUT }, `Polling timeout after ${pollAttempts} attempts`);
    return { status: 'TIMEOUT', txHash, error: `Transaction confirmation timeout after ${this.POLL_TIMEOUT_MS}ms`, retriable: true, pollAttempts };
  }

  public async pollForConfirmation(rpcServer: any, hash: string) {
    const started = Date.now();
    while (Date.now() - started < this.POLL_TIMEOUT_MS) {
      const res = await rpcServer.getTransaction(hash);
      const status = res?.status;
      if (status === 'SUCCESS' || status === 'FAILED') return res;
      await this.delay(this.POLL_INTERVAL_MS);
    }
    return { status: 'TIMEOUT' };
  }

  private async queryExistingTransaction(
    rpcServer: any,
    txHash: string,
    telemetry: TelemetryContext,
    logTelemetry: (telemetry: TelemetryContext, message: string) => void,
  ): Promise<TransactionOutcome> {
    try {
      if (!txHash || txHash === 'unknown') {
        return { status: 'DUPLICATE_SUCCESS', txHash: 'unknown', ledger: 0, message: 'Transaction was duplicate but hash unavailable', retriable: false };
      }

      const res = await rpcServer.getTransaction(txHash);
      const status = res?.status;

      if (status === 'SUCCESS') {
        const ledger = (res.ledger as number) || (res.latestLedger as number) || 0;
        logTelemetry({ ...telemetry, finalOutcome: TransactionState.DUPLICATE_SUCCESS }, `Duplicate transaction confirmed at ledger ${ledger}`);
        return { status: 'DUPLICATE_SUCCESS', txHash, ledger, message: 'Transaction was already submitted and confirmed', retriable: false };
      }

      return { status: 'DUPLICATE_SUCCESS', txHash, ledger: 0, message: 'Transaction was already submitted, pending confirmation', retriable: false };
    } catch (error: any) {
      return { status: 'DUPLICATE_SUCCESS', txHash, ledger: 0, message: 'Transaction was duplicate, query failed but assuming success', retriable: false };
    }
  }

  public delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
