import BigNumber from 'bignumber.js';

/** Stellar stroops per XLM */
const STROOPS_PER_XLM = 10_000_000;

/**
 * Converts an XLM string to stroops (bigint-safe).
 */
export function xlmToStroops(xlm: string): string {
  return new BigNumber(xlm).times(STROOPS_PER_XLM).toFixed(0);
}

/**
 * Converts stroops to XLM string.
 */
export function stroopsToXlm(stroops: string | number): string {
  return new BigNumber(stroops).div(STROOPS_PER_XLM).toFixed(7);
}

/**
 * Truncates a Stellar address for display: G...ABCD
 */
export function truncateAddress(address: string, chars = 4): string {
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars + 1)}...${address.slice(-chars)}`;
}

/**
 * Placeholder / simple formatter (for compatibility)
 */
export const formatAddress = truncateAddress;