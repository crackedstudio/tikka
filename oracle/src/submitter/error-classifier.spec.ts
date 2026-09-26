import { ErrorClassifier } from './error-classifier';
import { TelemetryContext } from './tx-submitter.service';

function classifier(): ErrorClassifier {
  return new ErrorClassifier(['https://rpc.example'], 0);
}

const telemetry = { raffleId: 1, requestId: 'req-1', attempt: 1, timestamp: '2026-01-01T00:00:00Z' } as TelemetryContext;

describe('ErrorClassifier', () => {
  it('classifies insufficient fee as retriable before generic failure text', () => {
    const outcome = classifier().classifyError(new Error('tx_insufficient_fee'), 'tx_insufficient_fee', telemetry);
    expect(outcome).toMatchObject({ status: 'INSUFFICIENT_FEE', retriable: true });
  });

  it('classifies connection failures as retriable network errors', () => {
    const outcome = classifier().classifyError(new Error('connect ECONNREFUSED'), 'connect ECONNREFUSED', telemetry);
    expect(outcome).toMatchObject({
      status: 'NETWORK_ERROR',
      retriable: true,
      rpcUrl: 'https://rpc.example',
    });
  });

  it('does not treat an ambiguous submission timeout as safe to retry', () => {
    const message = 'Gateway timeout waiting for confirmation';
    const outcome = classifier().classifyError(new Error(message), message, telemetry);
    expect(outcome.status).toBe('TIMEOUT');
    expect(outcome.retriable).toBe(false);
  });

  it('does not let the word timeout collapse into a retriable RPC error', () => {
    const instance = classifier();
    expect(instance.isRpcError('request timeout')).toBe(false);
    expect(instance.isTimeoutError('request timeout')).toBe(true);
    expect(instance.isRetriableError(new Error('504 timed out'))).toBe(false);
  });

  it('keeps rate limits and temporary RPC failures retriable', () => {
    const instance = classifier();
    expect(instance.isRetriableError(new Error('503 temporarily unavailable'))).toBe(true);
    expect(instance.isRetriableError(new Error('rate limit exceeded'))).toBe(true);
  });

  it('classifies invalid transactions as terminal so a draw is not retried into a double submit', () => {
    const outcome = classifier().classifyError(new Error('transaction invalid: malformed'), 'transaction invalid: malformed', telemetry);
    expect(outcome).toMatchObject({ status: 'INVALID_TRANSACTION', retriable: false });
    expect(classifier().isRetriableError(new Error('unauthorized'))).toBe(false);
  });

  it('detects duplicates and extracts a transaction hash', () => {
    const instance = classifier();
    expect(instance.isDuplicateError(new Error('tx_duplicate'))).toBe(true);
    expect(instance.isDuplicateError({ error: 'rejected' })).toBe(false);
    expect(instance.extractTxHashFromError({ message: 'no hash here' })).toBeNull();
    const hash = 'a'.repeat(64);
    expect(instance.extractTxHashFromError(new Error(`duplicate ${hash}`))).toBe(hash);
  });

  it('reads a failure reason without including result xdr', () => {
    expect(classifier().extractFailureReason({ error: 'host rejected' })).toBe('host rejected');
    const xdr = 'A'.repeat(200);
    expect(classifier().extractFailureReason({ resultXdr: xdr })).toBe('transaction rejected (result XDR omitted)');
    expect(classifier().extractFailureReason({})).toBe('Unknown failure reason');
  });
});
