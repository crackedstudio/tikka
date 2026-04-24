import { Injectable, Logger } from '@nestjs/common';
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
@Injectable()
export class PrngService {
  private readonly logger = new Logger(PrngService.name);

  /** Domain prefix bytes reused for proof halves — avoids allocating on every call */
  private static readonly PROOF_PREFIX_1 = Buffer.from('PRNG:v1:1:', 'ascii');
  private static readonly PROOF_PREFIX_2 = Buffer.from('PRNG:v1:2:', 'ascii');

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
    const reqBuf = Buffer.from(requestId, 'utf8');

    // ── Seed ───────────────────────────────────────────────────────────────
    // SHA-256( requestId_bytes [|| raffleId_u32_BE] )
    const seedHasher = crypto.createHash('sha256').update(reqBuf);
    if (raffleId !== undefined) {
      seedHasher.update(this.encodeUint32BE(raffleId));
    }
    const seedBuf = seedHasher.digest(); // 32 bytes

    // ── Proof (deterministic 64-byte value) ────────────────────────────────
    // Two independent SHA-256 invocations with distinct domain prefixes give
    // 64 bytes without requiring a multi-round hash.  The contract verifies
    // this proof exists and has the right length; on the PRNG path it does
    // not run a VRF check (the fixed prefix "PRNG:v1:…" makes path explicit).
    const proofHalf1 = crypto
      .createHash('sha256')
      .update(PrngService.PROOF_PREFIX_1)
      .update(reqBuf)
      .digest(); // 32 bytes

    const proofHalf2 = crypto
      .createHash('sha256')
      .update(PrngService.PROOF_PREFIX_2)
      .update(reqBuf)
      .digest(); // 32 bytes

    const proofBuf = Buffer.concat([proofHalf1, proofHalf2]); // 64 bytes

    this.logger.debug(`PRNG seed computed for requestId=${requestId} raffleId=${raffleId}`);

    return {
      seed: seedBuf.toString('hex'),   // 64 hex chars  → BytesN<32>
      proof: proofBuf.toString('hex'), // 128 hex chars → BytesN<64>
    };
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  /** Encodes an unsigned 32-bit integer as 4 bytes big-endian. */
  private encodeUint32BE(n: number): Buffer {
    const buf = Buffer.allocUnsafe(4);
    buf.writeUInt32BE(n >>> 0, 0); // >>> 0 coerces to uint32
    return buf;
  }
}
