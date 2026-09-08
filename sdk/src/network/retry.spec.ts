import {
  classifySorobanRpcError,
  buildRetryConfig,
  DEFAULT_RETRY_CONFIG,
  type RetryConfig,
} from './network.config';
import { withRetry, getRetryDecision } from '../utils/retry';
import {
  TikkaSdkError,
  TikkaSdkErrorCode,
  RpcTimeoutError,
  RateLimitError,
  UnavailableError,
  ContractFailureError,
  TransactionRejectedError,
} from '../utils/errors';

/** Build an Error carrying an arbitrary `code` / `status` for classification. */
function errWith(props: Record<string, unknown>, message = 'boom'): Error {
  const e = new Error(message);
  Object.assign(e, props);
  return e;
}

describe('classifySorobanRpcError', () => {
  it('classifies 5xx as retryable', () => {
    const decision = classifySorobanRpcError(new UnavailableError('down', { status: 503 }));
    expect(decision).toMatchObject({ retry: true, reason: 'retryable' });
  });

  it('classifies a plain 5xx NetworkError as retryable', () => {
    const decision = classifySorobanRpcError(
      new TikkaSdkError(TikkaSdkErrorCode.NetworkError, 'down', { status: 500 }),
    );
    expect(decision.retry).toBe(true);
  });

  it('classifies 429 rate limits as retryable', () => {
    const decision = classifySorobanRpcError(new RateLimitError('rl', { status: 429 }));
    expect(decision).toMatchObject({ retry: true, reason: 'retryable' });
  });

  it('classifies TRY_AGAIN_LATER (Soroban) as retryable', () => {
    const decision = classifySorobanRpcError(
      new TikkaSdkError(TikkaSdkErrorCode.SimulationFailed, 'try_again_later'),
    );
    expect(decision).toMatchObject({ retry: true, reason: 'retryable' });
  });

  it('classifies a TRY_AGAIN_LATER wrapped as a ContractFailureError as retryable', () => {
    const decision = classifySorobanRpcError(
      new ContractFailureError('RPC execution failed: try_again_later'),
    );
    expect(decision).toMatchObject({ retry: true, reason: 'retryable' });
  });

  it('classifies TX_BAD_SEQ as retryable requiring a sequence refresh', () => {
    const decision = classifySorobanRpcError(
      new TikkaSdkError(TikkaSdkErrorCode.TransactionRejected, 'tx_bad_seq'),
    );
    expect(decision).toMatchObject({ retry: true, refreshSequence: true, reason: 'refresh-sequence' });
  });

  it('classifies a TX_BAD_SEQ wrapped as a ContractFailureError as refresh-sequence', () => {
    const decision = classifySorobanRpcError(
      new ContractFailureError('RPC execution failed: tx_bad_seq'),
    );
    expect(decision).toMatchObject({ retry: true, refreshSequence: true, reason: 'refresh-sequence' });
  });

  it('classifies malformed XDR as fatal (never retryable)', () => {
    const decision = classifySorobanRpcError(
      new TikkaSdkError(TikkaSdkErrorCode.InvalidResponse, 'malformed xdr in transaction'),
    );
    expect(decision).toMatchObject({ retry: false, reason: 'fatal' });
  });

  it('classifies a malformed XDR wrapped as a ContractFailureError as fatal', () => {
    const decision = classifySorobanRpcError(
      new ContractFailureError('RPC execution failed: could not parse xdr'),
    );
    expect(decision).toMatchObject({ retry: false, reason: 'fatal' });
  });

  it('classifies contract failures as fatal', () => {
    const decision = classifySorobanRpcError(
      new ContractFailureError('HostValidationError: ContractError(1)'),
    );
    expect(decision).toMatchObject({ retry: false, reason: 'fatal' });
  });

  it('classifies transport errors (ECONNRESET) as retryable', () => {
    const decision = classifySorobanRpcError(errWith({ code: 'ECONNRESET' }, 'fetch failed'));
    expect(decision).toMatchObject({ retry: true, reason: 'retryable' });
  });

  it('classifies timeouts as retryable', () => {
    const decision = classifySorobanRpcError(new RpcTimeoutError('timed out'));
    expect(decision).toMatchObject({ retry: true, reason: 'retryable' });
  });

  it('classifies other 4xx (400) as fatal', () => {
    const decision = classifySorobanRpcError(
      new TikkaSdkError(TikkaSdkErrorCode.NetworkError, 'bad request', { status: 400 }),
    );
    expect(decision).toMatchObject({ retry: false, reason: 'fatal' });
  });
});

describe('buildRetryConfig', () => {
  it('returns sane defaults when no config is given', () => {
    const config = buildRetryConfig();
    expect(config.maxAttempts).toBe(DEFAULT_RETRY_CONFIG.maxAttempts);
    expect(config.baseDelayMs).toBe(DEFAULT_RETRY_CONFIG.baseDelayMs);
    expect(config.jitter).toBe('full');
    expect(config.classifyError).toBe(classifySorobanRpcError);
  });

  it('prefers the first-class retry policy over legacy flat fields', () => {
    const config = buildRetryConfig({
      maxRetryAttempts: 9,
      retryBaseDelayMs: 11,
      retry: { maxAttempts: 2, baseDelayMs: 22 },
    });
    expect(config.maxAttempts).toBe(2);
    expect(config.baseDelayMs).toBe(22);
  });

  it('falls back to legacy flat fields when retry is absent', () => {
    const config = buildRetryConfig({ maxRetryAttempts: 7, retryBaseDelayMs: 33 });
    expect(config.maxAttempts).toBe(7);
    expect(config.baseDelayMs).toBe(33);
  });

  it('merges an onRetry hook without dropping classification', () => {
    const onRetry = jest.fn();
    const config = buildRetryConfig({ retry: { maxAttempts: 1 } }, { onRetry });
    expect(config.onRetry).toBe(onRetry);
    expect(config.classifyError).toBe(classifySorobanRpcError);
  });
});

describe('withRetry', () => {
  const fastConfig: RetryConfig = {
    maxAttempts: 3,
    baseDelayMs: 1,
    maxDelayMs: 1,
    jitter: 0,
    classifyError: () => ({ retry: true, reason: 'retryable' }),
  };

  it('retries then succeeds', async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls++;
      if (calls < 3) throw new Error('transient');
      return 'ok';
    }, fastConfig);
    expect(result).toBe('ok');
    expect(calls).toBe(3);
  });

  it('does not retry when the error is fatal', async () => {
    let calls = 0;
    const config: RetryConfig = {
      ...fastConfig,
      classifyError: () => ({ retry: false, reason: 'fatal' }),
    };
    await expect(
      withRetry(async () => {
        calls++;
        throw new Error('fatal');
      }, config),
    ).rejects.toThrow('fatal');
    expect(calls).toBe(1);
  });

  it('respects maxAttempts and stops retrying', async () => {
    let calls = 0;
    await expect(
      withRetry(async () => {
        calls++;
        throw new Error('always');
      }, { ...fastConfig, maxAttempts: 2 }),
    ).rejects.toThrow('always');
    expect(calls).toBe(2);
  });

  it('invokes onRetry with attempt metadata', async () => {
    const onRetry = jest.fn();
    let calls = 0;
    await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw new Error('transient');
        return 'ok';
      },
      { ...fastConfig, onRetry },
    );
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledWith(
      expect.objectContaining({ attempt: 1, delayMs: 1 }),
    );
  });

  it('attaches the RetryDecision to the final thrown error', async () => {
    let calls = 0;
    try {
      await withRetry(
        async () => {
          calls++;
          throw new TransactionRejectedError('tx_bad_seq');
        },
        { ...fastConfig, maxAttempts: 2, classifyError: classifySorobanRpcError },
      );
      throw new Error('should have thrown');
    } catch (error: any) {
      const decision = getRetryDecision(error);
      expect(decision).toMatchObject({ retry: true, refreshSequence: true });
    }
    expect(calls).toBe(2);
  });

  it('uses the shared Soroban classifier by default', async () => {
    let calls = 0;
    await expect(
      withRetry(async () => {
        calls++;
        throw new ContractFailureError('HostValidationError: ContractError(1)');
      }),
    ).rejects.toThrow(ContractFailureError);
    expect(calls).toBe(1);
  });
});
