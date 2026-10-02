jest.mock('@stellar/stellar-sdk', () => ({
  rpc: { Server: jest.fn() },
}));

import { SubmissionService } from './submission';
import { ErrorClassifier } from './error-classifier';
import { OracleLoggerService } from '../logger/oracle-logger';
import { TelemetryContext } from './tx-submitter.service';

function logger(): OracleLoggerService {
  return { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } as unknown as OracleLoggerService;
}

function telemetry(): TelemetryContext {
  return { raffleId: 7, requestId: 'req-7', attempt: 1, timestamp: '2026-01-01T00:00:00Z' };
}

describe('SubmissionService', () => {
  let service: SubmissionService;
  let classifier: ErrorClassifier;
  const logTelemetry = jest.fn();

  beforeEach(() => {
    service = new SubmissionService(logger());
    classifier = new ErrorClassifier(['https://rpc.example'], 0);
    jest.spyOn(service, 'delay').mockResolvedValue(undefined);
    logTelemetry.mockClear();
  });

  it('does not retry a send that timed out without a hash', async () => {
    const rpc = { sendTransaction: jest.fn().mockResolvedValue({ error: 'Gateway timeout' }) };
    const result = await service.submitTransactionWithRetry(rpc, {}, telemetry(), classifier, logTelemetry);

    expect(result.shouldRetry).toBe(false);
    expect(result.bumpFee).toBe(false);
    expect(result.outcome).toMatchObject({ status: 'TIMEOUT', retriable: false });
    expect(rpc.sendTransaction).toHaveBeenCalledTimes(1);
  });

  it('does not retry when confirmation polling times out after a hash was issued', async () => {
    (service as any).POLL_TIMEOUT_MS = 0;
    const rpc = { getTransaction: jest.fn() };
    const outcome = await service.pollForConfirmationTyped(rpc, 'abc123', telemetry(), classifier, logTelemetry);

    expect(outcome).toMatchObject({ status: 'TIMEOUT', txHash: 'abc123', retriable: false });
    expect(rpc.getTransaction).not.toHaveBeenCalled();
  });

  it('returns a thrown submission timeout as non-retriable', async () => {
    const rpc = { sendTransaction: jest.fn().mockRejectedValue(new Error('request timed out')) };
    const result = await service.submitTransactionWithRetry(rpc, {}, telemetry(), classifier, logTelemetry);

    expect(result.shouldRetry).toBe(false);
    expect(result.outcome).toMatchObject({ status: 'TIMEOUT', retriable: false });
  });

  it('bumps the fee and retries an insufficient-fee response', async () => {
    const rpc = { sendTransaction: jest.fn().mockResolvedValue({ error: 'tx_insufficient_fee' }) };
    const result = await service.submitTransactionWithRetry(rpc, {}, telemetry(), classifier, logTelemetry);

    expect(result).toEqual({ shouldRetry: true, bumpFee: true });
  });

  it('retries a connection failure without bumping the fee', async () => {
    const rpc = { sendTransaction: jest.fn().mockRejectedValue(new Error('connect ECONNREFUSED')) };
    const result = await service.submitTransactionWithRetry(rpc, {}, telemetry(), classifier, logTelemetry);

    expect(result).toEqual({ shouldRetry: true, bumpFee: false });
  });

  it('stops on an invalid transaction', async () => {
    const rpc = { sendTransaction: jest.fn().mockRejectedValue(new Error('transaction invalid: malformed')) };
    const result = await service.submitTransactionWithRetry(rpc, {}, telemetry(), classifier, logTelemetry);

    expect(result.shouldRetry).toBe(false);
    expect(result.outcome).toMatchObject({ status: 'INVALID_TRANSACTION', retriable: false });
  });

  it('treats a duplicate as the existing transaction and does not submit again', async () => {
    const rpc = {
      sendTransaction: jest.fn().mockResolvedValue({ hash: 'duphash', error: 'tx_duplicate' }),
      getTransaction: jest.fn().mockResolvedValue({ status: 'SUCCESS', ledger: 44 }),
    };
    const result = await service.submitTransactionWithRetry(rpc, {}, telemetry(), classifier, logTelemetry);

    expect(result.shouldRetry).toBe(false);
    expect(result.outcome).toMatchObject({ status: 'DUPLICATE_SUCCESS', txHash: 'duphash', ledger: 44 });
    expect(rpc.sendTransaction).toHaveBeenCalledTimes(1);
  });

  it('confirms a successful poll and surfaces an on-chain failure as terminal', async () => {
    const successRpc = { getTransaction: jest.fn().mockResolvedValue({ status: 'SUCCESS', ledger: 9 }) };
    const success = await service.pollForConfirmationTyped(successRpc, 'ok', telemetry(), classifier, logTelemetry);
    expect(success).toMatchObject({ status: 'SUCCESS', ledger: 9, retriable: false });

    const failedRpc = { getTransaction: jest.fn().mockResolvedValue({ status: 'FAILED', error: 'host rejected' }) };
    const failed = await service.pollForConfirmationTyped(failedRpc, 'bad', telemetry(), classifier, logTelemetry);
    expect(failed).toMatchObject({ status: 'FAILED', retriable: false, failureReason: 'host rejected' });
  });
});
