import { TikkaSdkError, TikkaSdkErrorCode } from './errors';

/**
 * Validates a Stellar public key (G... format, 56 chars).
 * Requirements: Must be G-address, 56 characters long.
 */
export function assertValidPublicKey(address: string): void {
  if (!address || !/^G[A-Z2-7]{55}$/.test(address)) {
    throw new TikkaSdkError(
      TikkaSdkErrorCode.ValidationError,
      `Invalid Stellar public key: "${address || 'empty'}"`
    );
  }
}

/**
 * Validates a positive integer (Used for Raffle IDs and Quantities).
 */
export function assertPositiveInt(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TikkaSdkError(
      TikkaSdkErrorCode.ValidationError,
      `${name} must be a positive integer, got ${value}`
    );
  }
}

/**
 * Validates raffle ID specifically.
 */
export function validateRaffleId(raffleId: number): void {
  assertPositiveInt(raffleId, 'raffleId');
}

/**
 * Validates quantity specifically (must be > 0).
 */
export function validateQuantity(quantity: number): void {
  assertPositiveInt(quantity, 'quantity');
}

/**
 * Validates that a string is non-empty.
 */
export function assertNonEmpty(value: string, name: string): void {
  if (!value || value.trim().length === 0) {
    throw new TikkaSdkError(
      TikkaSdkErrorCode.ValidationError,
      `${name} must be a non-empty string`
    );
  }
}

/**
 * Boolean check for address validity (useful for UI/logic branches)
 */
export function isValidAddress(address: string): boolean {
  try {
    assertValidPublicKey(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * Placeholder for backward compatibility
 */
export const validateAddress = isValidAddress;