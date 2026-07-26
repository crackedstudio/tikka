/**
 * Typed configuration error for network setup (issue #1096).
 *
 * Distinct from a generic `Error` so callers can branch on it — a malformed
 * config is a programming mistake to be fixed at the call site, not a
 * transient network failure to be retried. Throwing plain `Error` forces
 * callers to string-match the message to tell the two apart.
 */
export class NetworkConfigError extends Error {
  /** The config field that failed validation, e.g. `rpcUrl`. */
  readonly field: string;

  /** The value that was rejected, for the message and for logging. */
  readonly value: unknown;

  constructor(field: string, value: unknown, reason: string) {
    super(`Invalid network configuration: "${field}" ${reason} (received: ${formatValue(value)})`);
    this.name = 'NetworkConfigError';
    this.field = field;
    this.value = value;

    // Without this, `instanceof NetworkConfigError` fails when the package is
    // compiled to ES5 — extending built-ins breaks the prototype chain, and
    // the whole point of a typed error is that callers can test for it.
    Object.setPrototypeOf(this, NetworkConfigError.prototype);
  }
}

/** Render a rejected value for the error message without dumping huge objects. */
function formatValue(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'string') return value === '' ? '""' : `"${value}"`;
  if (typeof value === 'object') return '[object]';
  return String(value);
}
