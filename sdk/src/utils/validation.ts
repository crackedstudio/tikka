import { TikkaSdkError, TikkaSdkErrorCode } from './errors';

/**
 * Validates a Stellar public key (G... format, 56 chars).
 */
export function assertValidPublicKey(address: string): void {
  if (!/^G[A-Z2-7]{55}$/.test(address)) {
    throw new TikkaSdkError(
      TikkaSdkErrorCode.InvalidParams,
      `Invalid Stellar public key: "${address}"`,
    );
  }
}

/**
 * Validates a positive integer.
 */
export function assertPositiveInt(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TikkaSdkError(
      TikkaSdkErrorCode.InvalidParams,
      `${name} must be a positive integer, got ${value}`,
    );
  }
}

/**
 * Validates that a string is non-empty.
 */
export function assertNonEmpty(value: string, name: string): void {
  if (!value || value.trim().length === 0) {
    throw new TikkaSdkError(
      TikkaSdkErrorCode.InvalidParams,
      `${name} must be a non-empty string`,
    );
  }
}
