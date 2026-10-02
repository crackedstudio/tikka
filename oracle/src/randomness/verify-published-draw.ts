#!/usr/bin/env node

/**
 * Re-verify a published draw from public data only.
 *
 * Inputs: proof, seed, oracle public key, request id, raffle id, and the
 * ordered participant list (one entry per ticket). The oracle private key
 * is not an input. PRNG draws are recomputed from the request id and raffle
 * id; VRF draws are checked with the public key.
 *
 *   ts-node src/randomness/verify-published-draw.ts <draw.json>
 */

import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { ed25519 } from '@noble/curves/ed25519';
import { Keypair } from '@stellar/stellar-sdk';
import { derivePrng, encodeUint32BE } from './prng.service';

export interface PublishedDraw {
  method: 'VRF' | 'PRNG';
  requestId: string;
  raffleId: number;
  seed: string;
  proof: string;
  oraclePublicKey: string;
  participants: string[];
}

export interface VerificationResult {
  valid: boolean;
  winner: string | null;
  winnerIndex: number | null;
  reason?: string;
}

export function winnerIndexFromSeed(seedHex: string, participantCount: number): number {
  const first = Buffer.from(seedHex, 'hex').readUInt32BE(0);
  return first % participantCount;
}

function publicKeyBytes(oraclePublicKey: string): Uint8Array {
  if (oraclePublicKey.startsWith('G')) {
    return Keypair.fromPublicKey(oraclePublicKey).rawPublicKey();
  }
  return Buffer.from(oraclePublicKey, 'hex');
}

function invalid(reason: string): VerificationResult {
  return { valid: false, winner: null, winnerIndex: null, reason };
}

export function verifyPublishedDraw(draw: PublishedDraw): VerificationResult {
  if (!Array.isArray(draw.participants) || draw.participants.length === 0) {
    return invalid('Participant set must be a non-empty public list');
  }
  if (!/^[0-9a-fA-F]+$/.test(draw.seed) || draw.seed.length !== 64) {
    return invalid('Seed must be 32 bytes of public hex');
  }

  if (draw.method === 'PRNG') {
    const expected = derivePrng(draw.requestId, draw.raffleId);
    if (expected.seed !== draw.seed.toLowerCase() || expected.proof !== draw.proof.toLowerCase()) {
      return invalid('PRNG seed or proof does not match the public request id and raffle id');
    }
  } else if (draw.method === 'VRF') {
    try {
      const proof = Buffer.from(draw.proof, 'hex');
      const message = Buffer.concat([
        Buffer.from(draw.requestId, 'utf8'),
        encodeUint32BE(draw.raffleId),
      ]);
      if (!ed25519.verify(proof, message, publicKeyBytes(draw.oraclePublicKey))) {
        return invalid('VRF proof failed verification against the oracle public key');
      }
      const expectedSeed = createHash('sha256').update(proof).digest('hex');
      if (expectedSeed !== draw.seed.toLowerCase()) {
        return invalid('Seed is not SHA-256 of the published proof');
      }
    } catch {
      return invalid('VRF public inputs could not be parsed');
    }
  } else {
    return invalid('Method must be VRF or PRNG');
  }

  const winnerIndex = winnerIndexFromSeed(draw.seed, draw.participants.length);
  return { valid: true, winner: draw.participants[winnerIndex], winnerIndex };
}

function main(): void {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: ts-node src/randomness/verify-published-draw.ts <draw.json>');
    process.exit(1);
  }
  const draw = JSON.parse(readFileSync(file, 'utf8')) as PublishedDraw;
  const result = verifyPublishedDraw(draw);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.valid ? 0 : 1);
}

if (require.main === module) main();
