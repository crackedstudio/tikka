/**
 * sequence.errors.spec.ts
 *
 * Tests for TX_BAD_SEQ error detection and retry strategies.
 *
 * Coverage:
 *   - isTxBadSeqError: detects various TX_BAD_SEQ error messages
 *   - classifyError: categorizes errors as transient / tx_bad_seq / not_retryable
 *   - retryOnTxBadSeq: retries only on TX_BAD_SEQ, refetches sequence
 *   - wrapWithRetryContext: adds retry context to errors
 */

import {
  isTxBadSeqError,
  classifyError,
  retryOnTxBadSeq,
  wrapWithRetryContext,
  type RetryClassification,
} from './sequence.errors';
import { TikkaSdkError, TikkaSdkErrorCode } from '../utils/errors';

describe('isTxBadSeqError', () => {
  describe('detects TX_BAD_SEQ error patterns', () => {
    const txBadSeqPatterns = [
      'txbadseq',
      'TXBADSEQ',
      'tx_bad_seq',
      'TX_BAD_SEQ',
      'bad seq',
      'Bad Sequence',
      'sequence number mismatch',
      'Sequence Number Mismatch',
      'sequence number out of range',
      'TransactionResultCode.txBadSeq',
    ];

    it.each(txBadSeqPatterns)('should detect "%s"', (pattern) => {
      expect(isTxBadSeqError(pattern)).toBe(true);
    });
  });

  describe('rejects non-TX_BAD_SEQ errors', () => {
    const nonTxBadSeqErrors = [
      '',
      'undefined',
      'SimulationFailed',
      'ContractError',
      'bad fee',
      'invalid account',
      'network timeout',
    ];

    it.each(nonTxBadSeqErrors)('should reject "%s"', (pattern) => {
      expect(isTxBadSeqError(pattern)).toBe(false);
    });
  });

  describe('case insensitivity', () => {
    it('detects TX_BAD_SEQ in mixed case', () => {
      expect(isTxBadSeqError('TxBaDsEq')).toBe(true);
      expect(isTxBadSeqError('bAd SeQ')).toBe(true);
    });
  });

  describe('substring detection', () => {
    it('detects TX_BAD_SEQ in longer error messages', () => {
      const msg = 'Transaction failed with error code TXBADSEQ: sequence number out of range';
      expect(isTxBadSeqError(msg)).toBe(true);
    });

    it('detects sequence number mismatch in XDR context', () => {
      const msg = 'result_code: TransactionResultCode.txBadSeq';
      expect(isTxBadSeqError(msg)).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('handles null/undefined gracefully', () => {
      expect(isTxBadSeqError(null as any)).toBe(false);
      expect(isTxBadSeqError(undefined as any)).toBe(false);
    });

    it('handles empty string', () => {
      expect(isTxBadSeqError('')).toBe(false);
    });

    it('handles very long error messages', () => {
      const longMsg = 'error: '.repeat(1000) + 'TXBADSEQ';
      expect(isTxBadSeqError(longMsg)).toBe(true);
    });
  });
});

describe('classifyError', () => {
  it('classifies Timeout as transient', () => {
    const error = new TikkaSdkError(TikkaSdkErrorCode.Timeout, 'timeout');
    expect(classifyError(error)).toBe('transient');
  });

  it('classifies NetworkError as transient', () => {
    const error = new TikkaSdkError(TikkaSdkErrorCode.NetworkError, 'network error');
    expect(classifyError(error)).toBe('transient');
  });

  it('classifies TX_BAD_SEQ in message as tx_bad_seq', () => {
    const error = new TikkaSdkError(TikkaSdkErrorCode.ContractError, 'TXBADSEQ error');
    expect(classifyError(error)).toBe('tx_bad_seq');
  });

  it('classifies TX_BAD_SEQ in details as tx_bad_seq', () => {
    const error = new TikkaSdkError(
      TikkaSdkErrorCode.SubmissionFailed,
      'submission failed',
      'txbadseq details',
    );
    expect(classifyError(error)).toBe('tx_bad_seq');
  });

  it('classifies SimulationFailed as not_retryable', () => {
    const error = new TikkaSdkError(TikkaSdkErrorCode.SimulationFailed, 'simulation failed');
    expect(classifyError(error)).toBe('not_retryable');
  });

  it('classifies ContractError as not_retryable', () => {
    const error = new TikkaSdkError(TikkaSdkErrorCode.ContractError, 'contract error');
    expect(classifyError(error)).toBe('not_retryable');
  });

  it('classifies UserRejected as not_retryable', () => {
    const error = new TikkaSdkError(TikkaSdkErrorCode.UserRejected, 'user rejected');
    expect(classifyError(error)).toBe('not_retryable');
  });

  it('classifies non-TikkaSdkError as not_retryable', () => {
    expect(classifyError(new Error('generic error'))).toBe('not_retryable');
    expect(classifyError('string error')).toBe('not_retryable');
    expect(classifyError(null)).toBe('not_retryable');
  });
});

describe('retryOnTxBadSeq', () => {
  it('returns success on first attempt if operation succeeds', async () => {
    const operation = jest.fn().mockResolvedValue('success');
    const fetcher = jest.fn();

    const result = await retryOnTxBadSeq(operation, fetcher);

    expect(result.success).toBe(true);
    expect(result.value).toBe('success');
    expect(result.attempts).toBe(1);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('returns failure immediately if error is not TX_BAD_SEQ', async () => {
    const error = new TikkaSdkError(TikkaSdkErrorCode.SimulationFailed, 'sim failed');
    const operation = jest.fn().mockRejectedValue(error);
    const fetcher = jest.fn();

    const result = await retryOnTxBadSeq(operation, fetcher);

    expect(result.success).toBe(false);
    expect(result.error).toBe(error);
    expect(result.attempts).toBe(1);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('retries on TX_BAD_SEQ and succeeds on second attempt', async () => {
    const txBadSeqError = new TikkaSdkError(TikkaSdkErrorCode.SubmissionFailed, 'TXBADSEQ');
    const operation = jest
      .fn()
      .mockRejectedValueOnce(txBadSeqError)
      .mockResolvedValueOnce('success');
    const fetcher = jest.fn().mockResolvedValue(undefined);

    const result = await retryOnTxBadSeq(operation, fetcher);

    expect(result.success).toBe(true);
    expect(result.value).toBe('success');
    expect(result.attempts).toBe(2);
    expect(operation).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('fails if TX_BAD_SEQ persists across max attempts', async () => {
    const txBadSeqError = new TikkaSdkError(TikkaSdkErrorCode.SubmissionFailed, 'TXBADSEQ');
    const operation = jest.fn().mockRejectedValue(txBadSeqError);
    const fetcher = jest.fn().mockResolvedValue(undefined);

    const result = await retryOnTxBadSeq(operation, fetcher, { maxAttempts: 2 });

    expect(result.success).toBe(false);
    expect(result.error).toBe(txBadSeqError);
    expect(result.attempts).toBe(2);
    expect(operation).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('refetches sequence before each retry', async () => {
    const txBadSeqError = new TikkaSdkError(TikkaSdkErrorCode.SubmissionFailed, 'TXBADSEQ');
    const operation = jest
      .fn()
      .mockRejectedValueOnce(txBadSeqError)
      .mockRejectedValueOnce(txBadSeqError)
      .mockResolvedValueOnce('success');
    const fetcher = jest.fn().mockResolvedValue(undefined);

    const result = await retryOnTxBadSeq(operation, fetcher, { maxAttempts: 3 });

    expect(result.success).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2); // Once after first error, once after second
  });

  it('returns fetcher error if sequence refetch fails', async () => {
    const txBadSeqError = new TikkaSdkError(TikkaSdkErrorCode.SubmissionFailed, 'TXBADSEQ');
    const fetchError = new Error('fetch failed');
    const operation = jest.fn().mockRejectedValue(txBadSeqError);
    const fetcher = jest.fn().mockRejectedValue(fetchError);

    const result = await retryOnTxBadSeq(operation, fetcher);

    expect(result.success).toBe(false);
    expect(result.error).toBe(fetchError);
    expect(result.attempts).toBe(1);
  });

  it('respects maxAttempts option', async () => {
    const txBadSeqError = new TikkaSdkError(TikkaSdkErrorCode.SubmissionFailed, 'TXBADSEQ');
    const operation = jest.fn().mockRejectedValue(txBadSeqError);
    const fetcher = jest.fn().mockResolvedValue(undefined);

    const result = await retryOnTxBadSeq(operation, fetcher, { maxAttempts: 5 });

    expect(result.attempts).toBe(5);
    expect(operation).toHaveBeenCalledTimes(5);
    expect(fetcher).toHaveBeenCalledTimes(4); // One less than attempts
  });

  it('defaults maxAttempts to 2', async () => {
    const txBadSeqError = new TikkaSdkError(TikkaSdkErrorCode.SubmissionFailed, 'TXBADSEQ');
    const operation = jest.fn().mockRejectedValue(txBadSeqError);
    const fetcher = jest.fn().mockResolvedValue(undefined);

    const result = await retryOnTxBadSeq(operation, fetcher);

    expect(result.attempts).toBe(2);
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('handles TX_BAD_SEQ in details', async () => {
    const txBadSeqError = new TikkaSdkError(
      TikkaSdkErrorCode.SubmissionFailed,
      'submission failed',
      'txbadseq in details',
    );
    const operation = jest
      .fn()
      .mockRejectedValueOnce(txBadSeqError)
      .mockResolvedValueOnce('success');
    const fetcher = jest.fn().mockResolvedValue(undefined);

    const result = await retryOnTxBadSeq(operation, fetcher);

    expect(result.success).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('handles mixed error types', async () => {
    const txBadSeqError = new TikkaSdkError(TikkaSdkErrorCode.SubmissionFailed, 'TXBADSEQ');
    const otherError = new TikkaSdkError(TikkaSdkErrorCode.ContractError, 'contract error');

    const operation = jest
      .fn()
      .mockRejectedValueOnce(txBadSeqError)
      .mockRejectedValueOnce(otherError);
    const fetcher = jest.fn().mockResolvedValue(undefined);

    const result = await retryOnTxBadSeq(operation, fetcher);

    // Should fail on second attempt because otherError is not retryable
    expect(result.success).toBe(false);
    expect(result.error).toBe(otherError);
    expect(result.attempts).toBe(2);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe('wrapWithRetryContext', () => {
  it('wraps error with retry count (singular)', () => {
    const original = new TikkaSdkError(TikkaSdkErrorCode.SubmissionFailed, 'submission failed');
    const wrapped = wrapWithRetryContext(original, 1);

    expect(wrapped.message).toContain('retried 1 time');
    expect(wrapped.code).toBe(original.code);
  });

  it('wraps error with retry count (plural)', () => {
    const original = new TikkaSdkError(TikkaSdkErrorCode.SubmissionFailed, 'submission failed');
    const wrapped = wrapWithRetryContext(original, 3);

    expect(wrapped.message).toContain('retried 3 times');
  });

  it('includes details in wrapped error', () => {
    const original = new TikkaSdkError(
      TikkaSdkErrorCode.SubmissionFailed,
      'submission failed',
      'original details',
    );
    const wrapped = wrapWithRetryContext(original, 2);

    expect(wrapped.message).toContain('retried 2 times');
    expect(wrapped.message).toContain('original details');
  });

  it('preserves error code', () => {
    const original = new TikkaSdkError(TikkaSdkErrorCode.Timeout, 'timeout');
    const wrapped = wrapWithRetryContext(original, 1);

    expect(wrapped.code).toBe(TikkaSdkErrorCode.Timeout);
  });
});
