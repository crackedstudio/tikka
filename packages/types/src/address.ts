/**
 * Canonical form for Stellar account addresses.
 *
 * `users.address` is the natural primary key of the aggregated user table, and
 * it is written by two independent services:
 *
 * - the indexer, from `TicketPurchased` / `RaffleFinalized` / `RaffleCreated`
 *   events (`indexer/src/processors/user.processor.ts`), and
 * - the backend, from client-supplied path parameters
 *   (`backend/src/api/rest/users/users.service.ts`).
 *
 * If either side accepts a variant spelling of the same account, the two paths
 * stop agreeing: the backend looks up one row while the indexer increments
 * another, and the account's raffle history fragments across both. This module
 * is the single definition of the canonical form so the two sides cannot drift.
 *
 * ## The canonical form
 *
 * A 56-character strkey: a `G` version byte followed by 55 characters of the
 * uppercase base32 alphabet (`A`–`Z`, `2`–`7`).
 *
 * Uppercasing is lossless here. Base32 as used by strkeys has no lowercase
 * alphabet, so a lowercase spelling is not a different account — it is the same
 * account written in a form no Stellar tooling emits. Normalising it cannot
 * merge two distinct accounts, because two distinct accounts can never differ
 * only by case.
 *
 * ## Shape, not checksum
 *
 * This is deliberately a shape check. Verifying the CRC16 payload would require
 * `@stellar/stellar-sdk`, and this package is a dependency of every workspace
 * package including the browser client, which does not otherwise ship the SDK.
 * Callers that already depend on the SDK and need to reject a well-shaped but
 * corrupt strkey can layer `StrKey.isValidEd25519PublicKey` on top.
 */

/** Length of a canonical Stellar account strkey, in characters. */
export const STELLAR_ACCOUNT_ADDRESS_LENGTH = 56;

/**
 * Shape of a canonical Stellar account strkey: `G` plus 55 uppercase base32
 * characters. Anchored, so it rejects both shorter and longer inputs.
 */
export const STELLAR_ACCOUNT_ADDRESS_PATTERN = /^G[A-Z2-7]{55}$/;

/**
 * Reduce a candidate address to its canonical strkey form.
 *
 * Surrounding whitespace is ignored and the result is uppercased, so the same
 * account always yields the same string regardless of how the caller spelled it.
 *
 * @param input - Candidate address. Accepts `unknown` because both call sites
 *   take the value from a boundary (an HTTP path parameter or a decoded event)
 *   where the type is not actually guaranteed.
 * @returns The canonical address, or `null` when `input` is not a Stellar
 *   account strkey. Callers decide whether that is a rejection or a pass-through.
 */
export function normalizeStellarAddress(input: unknown): string | null {
  if (typeof input !== 'string') return null;

  const trimmed = input.trim();
  if (trimmed.length !== STELLAR_ACCOUNT_ADDRESS_LENGTH) return null;

  const canonical = trimmed.toUpperCase();
  return STELLAR_ACCOUNT_ADDRESS_PATTERN.test(canonical) ? canonical : null;
}

/**
 * Whether `input` is a Stellar account strkey, in any accepted spelling.
 *
 * @param input - Candidate address.
 * @returns `true` when {@link normalizeStellarAddress} would return a value.
 */
export function isStellarAccountAddress(input: unknown): boolean {
  return normalizeStellarAddress(input) !== null;
}
