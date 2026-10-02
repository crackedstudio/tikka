/**
 * Stroop / amount helpers shared by the SDK fee estimator and the oracle cost
 * estimator validation.
 *
 * Everything in this package works in **stroops** (1 XLM = 10_000_000 stroops).
 * Network payloads are untrusted: Soroban RPC returns fee values as decimal
 * strings, Horizon returns numbers or strings, and `resultXdr` exposes
 * `xdr.Int64` accessors. Parsing therefore never throws — it returns
 * `undefined` for anything that is not a non-negative integer amount.
 */

/** 1 XLM expressed in stroops. */
export const STROOPS_PER_XLM = 10_000_000;

/**
 * Stellar protocol minimum base fee (100 stroops).
 * Every transaction pays at least this much as inclusion fee.
 */
export const PROTOCOL_BASE_FEE_STROOPS = 100;

/**
 * Parses an untrusted stroop amount.
 *
 * Accepts numbers, bigints, numeric strings and objects whose `toString()`
 * yields digits (e.g. `xdr.Int64`, which is how `resultXdr.feeCharged()`
 * returns the fee the network charged).
 *
 * @returns the amount in stroops, or `undefined` when the value is missing,
 * negative, fractional beyond rounding tolerance, or not numeric at all.
 */
export function toStroops(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;

  if (typeof value === 'bigint') {
    return value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER) ? undefined : Number(value);
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? Math.floor(value) : undefined;
  }

  if (typeof value !== 'string' && typeof value !== 'object') return undefined;

  let raw: string;
  try {
    raw = String(value).trim();
  } catch {
    return undefined;
  }

  if (!/^\d+$/.test(raw)) return undefined;

  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

/**
 * Formats a stroop amount as a 7-decimal XLM string.
 *
 * Accepts the untrusted shapes a quote or a network payload can carry (see
 * {@link toStroops}); anything unusable renders as `unknown` so a report never
 * presents a missing fee as zero.
 */
export function stroopsToXlmString(stroops: number | string | undefined): string {
  const parsed = toStroops(stroops);
  if (parsed === undefined) return 'unknown';
  return (parsed / STROOPS_PER_XLM).toFixed(7);
}
