import BigNumber from 'bignumber.js';
import { TikkaSdkError, TikkaSdkErrorCode } from './errors';

/**
 * Stellar stroops per XLM (1 XLM = 10,000,000 stroops)
 * Using this constant ensures we never use floating point math for currency.
 */
const STROOPS_PER_XLM = 10_000_000;

// Configure BigNumber global rounding and formatting behaviour
BigNumber.config({
  DECIMAL_PLACES: 7,
  ROUNDING_MODE: BigNumber.ROUND_HALF_UP,
  EXPONENTIAL_AT: [-12, 20],
});

/**
 * Validates that the input amount is safe to prevent precision loss:
 * 1. Must be passed as a string (or a safe integer number).
 * 2. Floating-point numbers are strictly rejected to avoid inherent JS float precision loss.
 * 3. Must be a valid positive/zero decimal.
 * 4. Must not exceed the specified maximum decimal places (default 18).
 */
export function assertSafeAmount(amount: any, name: string, maxDecimals = 18): void {
  if (amount === undefined || amount === null) {
    throw new TikkaSdkError(
      TikkaSdkErrorCode.ValidationError,
      `${name} must not be null or undefined`
    );
  }

  let amountStr: string;

  if (typeof amount === 'number') {
    if (!Number.isSafeInteger(amount) || amount < 0) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.ValidationError,
        `Unsafe number input for ${name}: "${amount}". Use string representation for decimal amounts.`
      );
    }
    amountStr = amount.toString();
  } else if (typeof amount === 'string') {
    if (amount.trim() === '') {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.ValidationError,
        `${name} must be a non-empty string`
      );
    }
    if (!/^\d+(\.\d+)?$/.test(amount)) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.ValidationError,
        `${name} must be a valid positive decimal string, got "${amount}"`
      );
    }
    const parts = amount.split('.');
    if (parts.length === 2 && parts[1].length > maxDecimals) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.ValidationError,
        `${name} exceeds maximum precision of ${maxDecimals} decimal places: "${amount}"`
      );
    }
    amountStr = amount;
  } else {
    throw new TikkaSdkError(
      TikkaSdkErrorCode.ValidationError,
      `${name} must be a string or a safe integer, got type ${typeof amount}`
    );
  }

  const bn = new BigNumber(amountStr);
  if (bn.isNaN() || !bn.isFinite() || bn.isLessThan(0)) {
    throw new TikkaSdkError(
      TikkaSdkErrorCode.ValidationError,
      `${name} represents an invalid or negative amount: "${amount}"`
    );
  }
}

/**
 * Multiplies an XLM/token amount by an integer quantity safely.
 *
 * @param amount    Amount string (or safe integer). Decimal strings are required for fractional values.
 * @param quantity  Positive safe integer multiplier.
 * @param decimals  Number of decimal places in the result (default: 7 for XLM).
 *                  Pass a higher value (e.g. 18) for tokens with higher precision.
 *
 * @example
 * multiplyAmountByQuantity('1.5', 3)          // '4.5000000'  (XLM, 7 dp)
 * multiplyAmountByQuantity('1.5', 3, 18)       // '4.500000000000000000' (18 dp token)
 */
export function multiplyAmountByQuantity(
  amount: string | number,
  quantity: number,
  decimals = 7,
): string {
  assertSafeAmount(amount, 'amount');

  if (typeof quantity !== 'number') {
    throw new TikkaSdkError(
      TikkaSdkErrorCode.ValidationError,
      `Quantity must be a number, got type ${typeof quantity}`
    );
  }

  if (!Number.isInteger(quantity) || quantity <= 0 || !Number.isSafeInteger(quantity)) {
    throw new TikkaSdkError(
      TikkaSdkErrorCode.ValidationError,
      `Quantity must be a safe positive integer, got ${quantity}`
    );
  }

  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    throw new TikkaSdkError(
      TikkaSdkErrorCode.ValidationError,
      `decimals must be an integer between 0 and 18, got ${decimals}`
    );
  }

  const bnAmount = new BigNumber(amount);
  return bnAmount.times(quantity).toFixed(decimals);
}

/**
 * Normalizes an XLM string to stroops (bigint-safe).
 * Use this before sending amounts to a smart contract or the Stellar network.
 */
export function xlmToStroops(xlm: string | number): string {
  if (xlm === undefined || xlm === null || xlm === '') return '0';
  assertSafeAmount(xlm, 'xlm', 7);
  return new BigNumber(xlm).times(STROOPS_PER_XLM).toFixed(0);
}

/**
 * Converts stroops (from contract/RPC) to a human-readable XLM string.
 * Fixed to 7 decimal places as per Stellar standards.
 */
export function stroopsToXlm(stroops: string | number): string {
  if (stroops === undefined || stroops === null || stroops === '') return '0.0000000';

  let stroopsStr: string;
  if (typeof stroops === 'number') {
    if (!Number.isSafeInteger(stroops) || stroops < 0) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.ValidationError,
        `Unsafe stroops value: ${stroops}`
      );
    }
    stroopsStr = stroops.toString();
  } else if (typeof stroops === 'string') {
    if (!/^\d+$/.test(stroops)) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.ValidationError,
        `Stroops must be a positive integer string, got "${stroops}"`
      );
    }
    stroopsStr = stroops;
  } else {
    throw new TikkaSdkError(
      TikkaSdkErrorCode.ValidationError,
      `Stroops must be a string or number, got type ${typeof stroops}`
    );
  }

  const bn = new BigNumber(stroopsStr);
  return bn.div(STROOPS_PER_XLM).toFixed(7);
}

/**
 * Formats a raw balance or ticket count for display.
 *
 * Only accepts string values or **safe integers** — JS float numbers are
 * rejected because they may already be precision-corrupted before BigNumber
 * can process them (e.g. `0.1 + 0.2 === 0.30000000000000004`).
 *
 * @param value    Raw value from the contract (string, or safe integer number).
 * @param decimals Number of decimal places to show (default 7 for XLM).
 */
export function formatContractResponse(value: string | number, decimals = 7): string {
  if (value === undefined || value === null || value === '') return '0';

  let valStr: string;
  if (typeof value === 'number') {
    // Reject JS floats — they are already precision-corrupted at the call site.
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.ValidationError,
        `Unsafe number input for contract response: ${value}. ` +
        `Pass amounts as strings to preserve precision.`
      );
    }
    valStr = value.toString();
  } else if (typeof value === 'string') {
    valStr = value;
  } else {
    throw new TikkaSdkError(
      TikkaSdkErrorCode.ValidationError,
      `Contract response must be a string or safe integer, got type ${typeof value}`
    );
  }

  const bn = new BigNumber(valStr);
  if (bn.isNaN() || !bn.isFinite()) {
    throw new TikkaSdkError(
      TikkaSdkErrorCode.ValidationError,
      `Invalid numeric value for contract response: "${value}"`
    );
  }
  return bn.toFixed(decimals);
}

/**
 * Truncates a Stellar address for UI display: G...ABCD
 */
export function truncateAddress(address: string, chars = 4): string {
  if (!address) return '';
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars + 1)}...${address.slice(-chars)}`;
}

/**
 * Alias for truncateAddress (for backward compatibility)
 */
export const formatAddress = truncateAddress;

/**
 * Normalizes an amount to a fixed-decimal string without converting to stroops.
 * Useful for logging, display, or metadata.
 *
 * @param amount   Amount string or safe integer.
 * @param decimals Number of decimal places (default: 7 for XLM).
 */
export function normalizeAmount(amount: string | number, decimals = 7): string {
  if (amount === undefined || amount === null || amount === '') {
    return new BigNumber(0).toFixed(decimals);
  }
  assertSafeAmount(amount, 'amount');
  return new BigNumber(amount).toFixed(decimals);
}