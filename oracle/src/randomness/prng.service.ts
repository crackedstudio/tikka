import { OracleLoggerService } from '../logger/oracle-logger';
import { Injectable } from '@nestjs/common';
import { RandomnessResult } from '../queue/queue.types';
import * as crypto from 'crypto';

/**
 * PrngService — deterministic pseudo-random seed generator for low-stakes raffles.
 *
 * Design (from ARCHITECTURE.md §5 Randomness Design):
 *   Low-stakes path (prize < 500 XLM) uses a secure hash-based PRNG instead
 *   of a full VRF to save cost and latency.  The output must be:
 *     • Reproducible  — same inputs always yield the same seed + proof.
 *     • Unbiased      — SHA-256 output is uniformly distributed.
 *     • Contract-compatible — seed is BytesN<32>, proof is BytesN<64>.
 *
 * Derivation:
 *   seed  = SHA-256( requestId_bytes [|| raffleId_u32_big_endian] )   → 32 bytes
 *   proof = SHA-256("PRNG:v1:1:" || requestId_bytes)
 *        || SHA-256("PRNG:v1:2:" || requestId_bytes)                  → 64 bytes
 *
 * Both are returned as lowercase hex strings (64 and 128 chars respectively)
 * to match the existing RandomnessResult interface consumed by RandomnessWorker
 * and TxSubmitterService.
 */
const PROOF_PREFIX_1 = Buffer.from('PRNG:v1:1:', 'ascii');
const PROOF_PREFIX_2 = Buffer.from('PRNG:v1:2:', 'ascii');

/** Encodes an unsigned 32-bit integer as 4 bytes big-endian. */
export function encodeUint32BE(n: number): Buffer {
  const buf = Buffer.allocUnsafe(4);
  buf.writeUInt32BE(n >>> 0, 0);
  return buf;
}

/**
 * Pure PRNG derivation. Only requestId and raffleId are inputs.
 * Nothing the operator controls after the draw request is committed
 * (clock, environment, log fields) is mixed in.
 */
export function derivePrng(requestId: string, raffleId?: number): RandomnessResult {
  const reqBuf = Buffer.from(requestId, 'utf8');
  const seedHasher = crypto.createHash('sha256').update(reqBuf);
  if (raffleId !== undefined) seedHasher.update(encodeUint32BE(raffleId));
  const seedBuf = seedHasher.digest();

  const proofHalf1 = crypto.createHash('sha256').update(PROOF_PREFIX_1).update(reqBuf).digest();
  const proofHalf2 = crypto.createHash('sha256').update(PROOF_PREFIX_2).update(reqBuf).digest();

  return {
    seed: seedBuf.toString('hex'),
    proof: Buffer.concat([proofHalf1, proofHalf2]).toString('hex'),
  };
}

@Injectable()
export class PrngService {
  constructor(private readonly logger: OracleLoggerService) {}

  /**
   * Computes a deterministic seed and proof for a low-stakes randomness request.
   *
   * @param requestId  Unique request identifier emitted by the contract
   *                   (`RandomnessRequested.request_id`).
   * @param raffleId   Optional raffle ID — when provided it is mixed into the
   *                   seed input so two different raffles with the same requestId
   *                   (however unlikely) still produce distinct seeds.
   * @returns          { seed, proof } as lowercase hex strings.
   *                   seed  → 64 hex chars (32 bytes) for contract BytesN<32>
   *                   proof → 128 hex chars (64 bytes) for contract BytesN<64>
   */
  compute(requestId: string, raffleId?: number): RandomnessResult {
    this.logger.debug(`PRNG seed computed for requestId=${requestId} raffleId=${raffleId}`);
    return derivePrng(requestId, raffleId);
  }
}
