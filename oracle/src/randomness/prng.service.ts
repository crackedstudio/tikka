import { Injectable } from '@nestjs/common';
import { RandomnessResult } from '../queue/queue.types';
import * as crypto from 'crypto';

@Injectable()
export class PrngService {
  /**
   * Computes pseudo-random seed for low-stakes raffles
   * @param requestId Unique request identifier
   * @returns Seed and empty proof (PRNG doesn't require cryptographic proof)
   */
  async compute(requestId: string): Promise<RandomnessResult> {
    // Use cryptographically secure PRNG for low-stakes raffles
    // Combines request ID with ledger timestamp for unpredictability
    const seed = crypto
      .createHash('sha256')
      .update(requestId)
      .update(Date.now().toString())
      .update(crypto.randomBytes(32))
      .digest('hex');

    // PRNG doesn't require proof (low-stakes only)
    const proof = '0'.repeat(128);

    return { seed, proof };
  }
}
