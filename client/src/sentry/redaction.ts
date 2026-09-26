/**
 * redaction.ts — privacy scrubbing for client-side error telemetry.
 *
 * Mirrors `backend/src/sentry/sentry.ts` (`REDACTED_FIELDS`, `hashWallet`,
 * `scrubPii`, `scrubSentryEvent`) so a client error leaves the browser with the
 * same shape of scrubbed data as a server error. Two browser-specific
 * additions over the backend version:
 *
 *  - Transaction payloads (XDR envelopes, long base64 blobs) are redacted, not
 *    just the sensitive field names the backend knows about.
 *  - Very long strings are truncated to bound the size of a single event.
 *
 * Wallet fingerprints are computed with a synchronous, non-cryptographic
 * FNV-1a hash. `crypto.subtle.digest` is async-only, and a scrubber that had to
 * await would either drop the event or leak the raw address while it resolved.
 * Client `wallet_hash` values are therefore stable per wallet but deliberately
 * NOT byte-comparable with the backend's SHA-256 `wallet_hash` — a client error
 * is joined to its server trace through `request_id` (see `correlation.ts`).
 */

import type * as Sentry from '@sentry/react';

/**
 * Sensitive field names that are replaced with `[REDACTED]`.
 * Case-insensitive matching. Mirrors the backend list.
 */
export const REDACTED_FIELDS = [
  'authorization',
  'token',
  'signature',
  'mnemonic',
  'seed',
  'password',
  'privatekey',
  'secret',
  'x-api-key',
  'cookie',
  'set-cookie',
  'session',
  'jwt',
  'bearer',
  'email',
  'emailaddress',
  'user_email',
  'useremail',
] as const;

/**
 * Fields that carry a raw transaction payload (unsigned/signed envelopes).
 * These are replaced with `[REDACTED_XDR]` rather than `[REDACTED]` so the
 * dashboard still shows that a transaction was involved. Case-insensitive.
 */
export const REDACTED_TRANSACTION_FIELDS = [
  'assembledxdr',
  'signedxdr',
  'unsignedxdr',
  'transactionxdr',
  'txxdr',
  'xdr',
  'envelope',
  'txenvelope',
  'transactionenvelope',
  'signedtransaction',
  'rawtransaction',
  'feebumpxdr',
] as const;

export const REDACTED_PLACEHOLDER = '[REDACTED]';
export const REDACTED_TRANSACTION_PLACEHOLDER = '[REDACTED_XDR]';
export const DEPTH_LIMIT_PLACEHOLDER = '[DEPTH_LIMIT]';

/** Longest string kept verbatim; anything longer is truncated. */
export const MAX_STRING_LENGTH = 2048;

/** Recursion limit, matching the backend redactor. */
export const MAX_DEPTH = 10;

/** Regex matching Stellar public keys (G…) or secret seeds (S…), 56 base32 chars. */
const STELLAR_ADDRESS_RE = /\b[GS][A-Z2-7]{55}\b/g;

/** Non-global variant for single-match testing without mutating `lastIndex`. */
const STELLAR_ADDRESS_TEST = /\b[GS][A-Z2-7]{55}\b/;

/**
 * A long, unpadded base64 blob. Transaction envelopes are base64 XDR and are
 * always far longer than this threshold; wallet addresses (56 chars) and
 * ordinary text fall well below it.
 */
const BASE64_BLOB_TEST = /^[A-Za-z0-9+/=\s]{120,}$/;

/**
 * Normalize a field name for matching: lowercase and strip separators so
 * `signedXdr`, `signed_xdr` and `signed-xdr` all resolve to the same entry.
 */
function normalizeFieldName(field: string): string {
  return field.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const redactedFieldSet = new Set(REDACTED_FIELDS.map(normalizeFieldName));
const transactionFieldSet = new Set(REDACTED_TRANSACTION_FIELDS.map(normalizeFieldName));

/**
 * 32-bit FNV-1a, hex-encoded to 8 lowercase characters.
 * `Math.imul` keeps the multiply inside int32 so the result is stable.
 */
function fnv1a(input: string, offsetBasis: number): string {
  let hash = offsetBasis;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Hash a wallet address for safe telemetry.
 * Returns 16 lowercase hex characters, or null for null/undefined/blank input.
 * Deterministic and case-insensitive; the raw address is never recoverable.
 */
export function hashWallet(address: string | null | undefined): string | null {
  if (!address || typeof address !== 'string') {
    return null;
  }

  const trimmed = address.trim();
  if (!trimmed) {
    return null;
  }

  // Normalize to lowercase so the same wallet hashes identically everywhere.
  const normalized = trimmed.toLowerCase();
  return fnv1a(normalized, 0x811c9dc5) + fnv1a(normalized, 0x811c9dc6);
}

/**
 * Replace Stellar wallet addresses (G…/S…, 56 base32 chars) found in a string
 * with their hashed representation via `hashWallet`.
 */
export function redactWalletAddresses(value: string): string {
  return value.replace(STELLAR_ADDRESS_RE, (match) => hashWallet(match) ?? match);
}

/** Scrub a single string: drop transaction blobs, hash wallets, truncate. */
function scrubString(value: string): string {
  if (BASE64_BLOB_TEST.test(value)) {
    return REDACTED_TRANSACTION_PLACEHOLDER;
  }

  const redacted = STELLAR_ADDRESS_TEST.test(value) ? redactWalletAddresses(value) : value;
  return redacted.length > MAX_STRING_LENGTH
    ? `${redacted.slice(0, MAX_STRING_LENGTH)}…[truncated]`
    : redacted;
}

/**
 * Recursively walk an object/array, redacting sensitive field values, hashing
 * wallet addresses and dropping transaction payloads.
 * Returns a new structure without mutating the original.
 */
export function scrubPii(input: unknown, depth = 0): unknown {
  if (depth >= MAX_DEPTH) {
    return DEPTH_LIMIT_PLACEHOLDER;
  }

  if (input === null || input === undefined) {
    return input;
  }

  if (typeof input === 'string') {
    return scrubString(input);
  }

  if (Array.isArray(input)) {
    return input.map((item) => scrubPii(item, depth + 1));
  }

  if (typeof input === 'object') {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      const normalizedKey = normalizeFieldName(key);
      if (transactionFieldSet.has(normalizedKey)) {
        result[key] = REDACTED_TRANSACTION_PLACEHOLDER;
        continue;
      }
      if (redactedFieldSet.has(normalizedKey)) {
        result[key] = REDACTED_PLACEHOLDER;
        continue;
      }
      result[key] = scrubPii(value, depth + 1);
    }

    return result;
  }

  return input;
}

/**
 * Walk a Sentry event and redact PII:
 *  - sensitive fields (authorization, cookies, emails, …) → `[REDACTED]`
 *  - transaction payloads (XDR) → `[REDACTED_XDR]`
 *  - Stellar wallet addresses → 16-char FNV-1a fingerprint
 *  - request bodies are dropped entirely
 */
export function scrubSentryEvent(event: Sentry.Event): Sentry.Event {
  const scrubbed: Sentry.Event = { ...event };

  if (scrubbed.request?.headers) {
    scrubbed.request = {
      ...scrubbed.request,
      headers: scrubPii(scrubbed.request.headers) as Record<string, string>,
    };
  }

  if (scrubbed.request?.query_string) {
    scrubbed.request = {
      ...scrubbed.request,
      query_string: scrubPii(scrubbed.request.query_string) as string | Record<string, string>,
    };
  }

  // Drop request bodies — x-www-form-urlencoded bodies can carry signed XDR,
  // signatures or tokens that the field redactor cannot see into.
  if (scrubbed.request && scrubbed.request.data !== undefined) {
    const { data: _droppedBody, ...restRequest } = scrubbed.request;
    scrubbed.request = restRequest;
  }

  if (scrubbed.user) {
    scrubbed.user = scrubPii(scrubbed.user) as Sentry.Event['user'];
  }
  if (scrubbed.tags) {
    scrubbed.tags = scrubPii(scrubbed.tags) as Sentry.Event['tags'];
  }
  if (scrubbed.contexts) {
    scrubbed.contexts = scrubPii(scrubbed.contexts) as Sentry.Event['contexts'];
  }
  if (scrubbed.extra) {
    scrubbed.extra = scrubPii(scrubbed.extra) as Sentry.Event['extra'];
  }
  if (scrubbed.breadcrumbs) {
    scrubbed.breadcrumbs = scrubPii(scrubbed.breadcrumbs) as Sentry.Event['breadcrumbs'];
  }

  return scrubbed;
}
