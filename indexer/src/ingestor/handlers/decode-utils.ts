import { scValToNative, xdr } from "@stellar/stellar-sdk";

/**
 * Typed primitives for narrowing decoded Soroban payloads.
 *
 * `scValToNative` returns `any`, which historically leaked `any` into every
 * handler. These helpers return `unknown` and narrow to concrete primitives
 * instead, so a malformed or renamed contract field fails visibly (as `null`)
 * instead of silently propagating `any` into the typed event union.
 */

/** Converts an `ScVal` to its native JS value without leaking `any`. */
export function toNativeValue(scVal: xdr.ScVal): unknown {
  return scValToNative(scVal);
}

/** Narrows a decoded value to a finite number, or `null` when not numeric. */
export function asNumber(value: unknown): number | null {
  const n = typeof value === "bigint" ? Number(value) : value;
  if (typeof n === "number" && Number.isFinite(n)) return n;
  if (typeof n === "string" && n.trim() !== "" && Number.isFinite(Number(n))) {
    return Number(n);
  }
  return null;
}

/** Narrows a decoded value to a string, or `null` when not string-like. */
export function asString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  return null;
}

/** Narrows a decoded value to a plain record (Soroban map), or `null`. */
export function asRecord(value: unknown): Record<string, unknown> | null {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

/** Narrows a decoded value to an array of numbers, or `null`. */
export function asNumberArray(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const numbers = value.map(asNumber);
  return numbers.every((n) => n !== null) ? (numbers as number[]) : null;
}

/** Renders a decoded buffer (`Uint8Array`/`Buffer`) as a hex string. */
export function asHex(value: unknown): string {
  if (Buffer.isBuffer(value)) return value.toString("hex");
  if (value instanceof Uint8Array) return Buffer.from(value).toString("hex");
  return String(value);
}

/**
 * Reads the first present key from a decoded map and narrows it to a string.
 * Used for snake_case fields with legacy camelCase spellings.
 */
export function pickString(
  record: Record<string, unknown>,
  keys: readonly string[],
  fallback: string,
): string {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) {
      return asString(record[key]) ?? fallback;
    }
  }
  return fallback;
}

/** Like {@link pickString}, but for numeric fields. */
export function pickNumber(
  record: Record<string, unknown>,
  keys: readonly string[],
  fallback: number,
): number {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) {
      return asNumber(record[key]) ?? fallback;
    }
  }
  return fallback;
}

/** Like {@link pickString}, but for boolean fields. */
export function pickBoolean(
  record: Record<string, unknown>,
  keys: readonly string[],
  fallback: boolean,
): boolean {
  for (const key of keys) {
    const raw = record[key];
    if (raw !== undefined && raw !== null) {
      return typeof raw === "boolean" ? raw : Boolean(raw);
    }
  }
  return fallback;
}
