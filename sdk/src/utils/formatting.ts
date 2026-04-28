import BigNumber from 'bignumber.js';

/** * Stellar stroops per XLM (1 XLM = 10,000,000 stroops)
 * Using this constant ensures we never use floating point math for currency.
 */
const STROOPS_PER_XLM = 10_000_000;

/**
 * Normalizes an XLM string to stroops (bigint-safe).
 * Use this before sending amounts to a smart contract or the Stellar network.
 */
export function xlmToStroops(xlm: string | number): string {
  if (!xlm) return '0';
  return new BigNumber(xlm).times(STROOPS_PER_XLM).toFixed(0);
}

/**
 * Converts stroops (from contract/RPC) to a human-readable XLM string.
 * Fixed to 7 decimal places as per Stellar standards.
 */
export function stroopsToXlm(stroops: string | number): string {
  if (!stroops) return '0.0000000';
  return new BigNumber(stroops).div(STROOPS_PER_XLM).toFixed(7);
}

/**
 * Formats a raw balance or ticket count for display.
 * @param value The raw value from the contract
 * @param decimals Number of decimal places to show (default 7 for XLM)
 */
export function formatContractResponse(value: string | number, decimals = 7): string {
  if (!value) return '0';
  return new BigNumber(value).toFixed(decimals);
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
 * Normalizes an amount to a 7-decimal string without converting to stroops.
 * Useful for logging or metadata.
 */
export function normalizeAmount(amount: string | number): string {
  if (!amount) return '0.0000000';
  return new BigNumber(amount).toFixed(7);
}