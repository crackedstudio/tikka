/**
 * verify.ts — pure, dependency-free VRF/PRNG proof verification.
 *
 * Used by both the CLI (bin/verify-proof.ts) and the HTTP controller.
 * Mirrors the exact crypto used in VrfService and PrngService so results
 * are always consistent.
 *
 * VRF  (method = 'VRF'):
 *   1. Ed25519.verify(proof, input, pubkey)
 *   2. SHA-256(proof) === seed
 *
 * PRNG (method = 'PRNG'):
 *   seed  = SHA-256(input_bytes [|| raffleId_u32_BE])
 *   proof = SHA-256("PRNG:v1:1:" || input) || SHA-256("PRNG:v1:2:" || input)
 */

import { ed25519 } from '@noble/curves/ed25519';
import * as crypto from 'crypto';

export type VerifyMethod = 'VRF' | 'PRNG';

export interface VerifyInput {
  /** Oracle public key — 32-byte hex (64 chars) */
  key: string;
  /** Original request input / requestId */
  input: string;
  /** 64-byte proof — 128 hex chars */
  proof: string;
  /** 32-byte seed — 64 hex chars */
  seed: string;
  /** Verification method; defaults to VRF */
  method?: VerifyMethod;
  /** Required for PRNG seed re-derivation */
  raffleId?: number;
}

export interface VerifyResult {
  valid: boolean;
  method: VerifyMethod;
  checks: {
    signatureValid?: boolean;
    seedMatchesProof?: boolean;
    seedMatchesInput?: boolean;
    proofMatchesInput?: boolean;
  };
  error?: string;
}

export function verifyProof(input: VerifyInput): VerifyResult {
  const method: VerifyMethod = input.method ?? 'VRF';

  try {
    if (method === 'VRF') {
      return verifyVrf(input);
    }
    return verifyPrng(input);
  } catch (err: unknown) {
    return {
      valid: false,
      method,
      checks: {},
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ── VRF ──────────────────────────────────────────────────────────────────────

function verifyVrf(input: VerifyInput): VerifyResult {
  const pubKeyBuf = Buffer.from(input.key, 'hex');
  const proofBuf = Buffer.from(input.proof, 'hex');
  const seedBuf = Buffer.from(input.seed, 'hex');
  const msgBuf = Buffer.from(input.input, 'utf-8');

  const signatureValid = ed25519.verify(proofBuf, msgBuf, pubKeyBuf);

  const expectedSeed = crypto.createHash('sha256').update(proofBuf).digest();
  const seedMatchesProof = Buffer.compare(expectedSeed, seedBuf) === 0;

  return {
    valid: signatureValid && seedMatchesProof,
    method: 'VRF',
    checks: { signatureValid, seedMatchesProof },
  };
}

// ── PRNG ─────────────────────────────────────────────────────────────────────

const PROOF_PREFIX_1 = Buffer.from('PRNG:v1:1:', 'ascii');
const PROOF_PREFIX_2 = Buffer.from('PRNG:v1:2:', 'ascii');

function verifyPrng(input: VerifyInput): VerifyResult {
  const reqBuf = Buffer.from(input.input, 'utf-8');
  const proofBuf = Buffer.from(input.proof, 'hex');
  const seedBuf = Buffer.from(input.seed, 'hex');

  // Re-derive seed
  const seedHasher = crypto.createHash('sha256').update(reqBuf);
  if (input.raffleId !== undefined) {
    const idBuf = Buffer.allocUnsafe(4);
    idBuf.writeUInt32BE(input.raffleId >>> 0, 0);
    seedHasher.update(idBuf);
  }
  const expectedSeed = seedHasher.digest();
  const seedMatchesInput = Buffer.compare(expectedSeed, seedBuf) === 0;

  // Re-derive proof
  const half1 = crypto.createHash('sha256').update(PROOF_PREFIX_1).update(reqBuf).digest();
  const half2 = crypto.createHash('sha256').update(PROOF_PREFIX_2).update(reqBuf).digest();
  const expectedProof = Buffer.concat([half1, half2]);
  const proofMatchesInput = Buffer.compare(expectedProof, proofBuf) === 0;

  return {
    valid: seedMatchesInput && proofMatchesInput,
    method: 'PRNG',
    checks: { seedMatchesInput, proofMatchesInput },
  };
}
