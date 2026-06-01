import * as crypto from 'crypto';
import { RandomnessRequestInput, RandomnessProofMetadata } from './randomness-audit.types';

const SECRET_KEYS = new Set([
  'secret',
  'nonce',
  'privateKey',
  'private_key',
  'secretKey',
  'secret_key',
  'mnemonic',
  'password',
  'token',
  'apiKey',
  'api_key',
  'ORACLE_PRIVATE_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
]);

const REDACTED = '[REDACTED]';

/**
 * Recursively redact secret fields from request payloads while keeping
 * identifiers needed to reconstruct a draw (raffleId, requestId, etc.).
 */
export function redactRequestInput<T extends Record<string, unknown>>(value: T): T {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) =>
      typeof item === 'object' && item !== null
        ? redactRequestInput(item as Record<string, unknown>)
        : item,
    ) as unknown as T;
  }

  if (typeof value !== 'object') {
    return value;
  }

  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (SECRET_KEYS.has(key)) {
      result[key] = REDACTED;
    } else if (entry !== null && typeof entry === 'object') {
      result[key] = redactRequestInput(entry as Record<string, unknown>);
    } else {
      result[key] = entry;
    }
  }
  return result as T;
}

export function toStoredRequestInput(
  input: RandomnessRequestInput,
): RandomnessRequestInput {
  return redactRequestInput({ ...input }) as RandomnessRequestInput;
}

/**
 * Seed and proof are verification material for on-chain checks; persist as-is.
 * Also store length metadata so reviewers can spot truncation without raw secrets.
 */
export function buildProofMetadata(seed: string, proof: string): RandomnessProofMetadata {
  return {
    seed,
    proof,
    seedLength: seed.length,
    proofLength: proof.length,
    seedDigest: crypto.createHash('sha256').update(seed).digest('hex'),
    proofDigest: crypto.createHash('sha256').update(proof).digest('hex'),
  };
}
