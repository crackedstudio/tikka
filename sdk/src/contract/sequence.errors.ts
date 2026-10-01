/**
 * sequence.errors.ts
 *
 * Utilities for detecting and handling TX_BAD_SEQ errors.
 *
 * TX_BAD_SEQ occurs when a transaction's sequence number doesn't match the account's
 * current sequence. This can happen when:
 *   1. Two concurrent operations fetch the same sequence (now prevented by SequenceManager)
 *   2. An operation is retried after partial failure
 *   3. The account state changed between sequence fetch and submission
 *
 * TX_BAD_SEQ errors are ALWAYS retryable — the caller should:
 *   1. Refetch the current sequence from Horizon
 *   2. Rebuild the transaction with the new sequence
 *   3. Re-simulate and re-submit
 *
 * This is distinct from generic SDK errors (e.g., ContractError, SimulationFailed)
 * which are not retryable.
 */

import { TikkaSdkError, TikkaSdkErrorCode } from '../utils/errors';

/**
 * Detects if an error message or XDR indicates a TX_BAD_SEQ condition.
 *
 * TX_BAD_SEQ appears in various contexts:
 *   - Stellar protocol error code: TXBADSEQ (value 4)
 *   - RPC error message: "bad seq" or "sequence number mismatch"
 *   - Transaction result XDR: TransactionResultCode.txBadSeq
 *
 * @param errorMsg - Error message from RPC or error XDR
 * @returns true if this is a TX_BAD_SEQ error
 */
export function isTxBadSeqError(errorMsg: string): boolean {
  if (!errorMsg) return false;

  const msg = String(errorMsg).toLowerCase();

  // Stellar protocol error codes
  if (msg.includes('txbadseq') || msg.includes('tx_bad_seq')) return true;

  // Common error message patterns
  if (msg.includes('bad seq') || msg.includes('bad sequence')) return true;
  if (msg.includes('sequence number mismatch')) return true;
  if (msg.includes('sequence number out of range')) return true;

  // XDR-based detection
  if (msg.includes('sequencenumber') && (msg.includes('too') || msg.includes('mismatch'))) {
    return true;
  }

  return false;
}

/**
 * Classifies a TikkaSdkError to determine if it's retryable.
 *
 * Retryable errors:
 *   - Timeout / NetworkError — transient network issues
 *   - TX_BAD_SEQ — sequence collision, retry with refetched sequence
 *
 * Non-retryable errors:
 *   - SimulationFailed — contract logic rejected the operation
 *   - ContractError — contract call failed (user/raffle state invalid)
 *   - UserRejected — wallet user declined to sign
 *   - Any other error
 *
 * @param error - The error to classify
 * @returns "transient" | "tx_bad_seq" | "not_retryable"
 */
export type RetryClassification = 'transient' | 'tx_bad_seq' | 'not_retryable';

export function classifyError(error: unknown): RetryClassification {
  if (!(error instanceof TikkaSdkError)) {
    return 'not_retryable';
  }

  // Transient network errors
  if (
    error.code === TikkaSdkErrorCode.Timeout ||
    error.code === TikkaSdkErrorCode.NetworkError
  ) {
    return 'transient';
  }

  // TX_BAD_SEQ detected in error details
  if (error.details && isTxBadSeqError(String(error.details))) {
    return 'tx_bad_seq';
  }

  // TX_BAD_SEQ detected in error message
  if (isTxBadSeqError(error.message)) {
    return 'tx_bad_seq';
  }

  return 'not_retryable';
}

/**
 * Represents the result of a TX_BAD_SEQ retry strategy.
 */
export interface RetryResult<T> {
  /** Whether the retry succeeded. */
  success: boolean;
  /** The result if successful. */
  value?: T;
  /** The error if failed. */
  error?: Error;
  /** Number of retry attempts made. */
  attempts: number;
}

/**
 * Retry strategy for TX_BAD_SEQ errors.
 *
 * Differs from generic retry:
 *   - Only retries TX_BAD_SEQ (not all errors)
 *   - Refetches sequence before retry (critical!)
 *   - Uses a dedicated retry count (default 2)
 *
 * Usage:
 * ```typescript
 * const result = await retryOnTxBadSeq(
 *   async () => lifecycle.invoke(...),
 *   async () => horizon.loadAccount(sourceKey),
 *   { maxAttempts: 2 }
 * );
 * ```
 *
 * @param operation - The async operation to retry
 * @param sequenceFetcher - Async function to refetch account sequence
 * @param options - Retry options
 * @returns RetryResult with success flag and value/error
 */
export async function retryOnTxBadSeq<T>(
  operation: () => Promise<T>,
  sequenceFetcher: () => Promise<any>, // Returns updated account
  options: { maxAttempts?: number } = {},
): Promise<RetryResult<T>> {
  const maxAttempts = options.maxAttempts ?? 2;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await operation();
      return { success: true, value: result, attempts: attempt };
    } catch (error: any) {
      lastError = error;
      const classification = classifyError(error);

      // Only retry on TX_BAD_SEQ
      if (classification !== 'tx_bad_seq') {
        return { success: false, error, attempts: attempt };
      }

      // Don't retry on last attempt
      if (attempt >= maxAttempts) {
        return { success: false, error, attempts: attempt };
      }

      // Refetch sequence before next attempt
      try {
        await sequenceFetcher();
      } catch (fetchError: any) {
        return { success: false, error: fetchError, attempts: attempt };
      }

      // Continue to next iteration
    }
  }

  return {
    success: false,
    error: lastError ?? new Error('Unknown error'),
    attempts: maxAttempts,
  };
}

/**
 * Creates a new error that wraps the original error with context about the retry.
 *
 * @param originalError - The original TikkaSdkError
 * @param attempts - Number of retry attempts made
 * @returns A new error with retry context
 */
export function wrapWithRetryContext(originalError: TikkaSdkError, attempts: number): TikkaSdkError {
  const detail = originalError.details ? ` (detail: ${originalError.details})` : '';
  const message = `${originalError.message} (retried ${attempts} time${attempts === 1 ? '' : 's'})${detail}`;

  return new TikkaSdkError(originalError.code, message, originalError.details);
}
