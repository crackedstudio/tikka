import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

export interface Commitment {
  raffleId: number;
  secret: string;
  nonce: string;
  commitment: string;
  committedAt: Date;
}

@Injectable()
export class CommitmentService {
  private readonly logger = new Logger(CommitmentService.name);
  private readonly commitments = new Map<number, Commitment>();

  /**
   * Commit phase: Generate secret, nonce, and commitment hash
   * @param raffleId The raffle ID
   * @returns Commitment hash to submit to contract
   */
  commit(raffleId: number): string {
    // Generate cryptographically secure random values
    const secret = crypto.randomBytes(32).toString('hex');
    const nonce = crypto.randomBytes(16).toString('hex');
    
    // Compute commitment = SHA-256(secret || nonce)
    const commitment = this.computeCommitment(secret, nonce);
    
    // Store for later reveal
    this.commitments.set(raffleId, {
      raffleId,
      secret,
      nonce,
      commitment,
      committedAt: new Date(),
    });
    
    this.logger.log(`Committed for raffle ${raffleId}: ${commitment}`);
    return commitment;
  }

  /**
   * Reveal phase: Retrieve secret and nonce for verification
   * @param raffleId The raffle ID
   * @returns Secret and nonce, or null if not found
   */
  reveal(raffleId: number): { secret: string; nonce: string } | null {
    const commitment = this.commitments.get(raffleId);
    
    if (!commitment) {
      this.logger.warn(`No commitment found for raffle ${raffleId}`);
      return null;
    }
    
    this.logger.log(`Revealing for raffle ${raffleId}`);
    
    // Return secret and nonce for contract verification
    return {
      secret: commitment.secret,
      nonce: commitment.nonce,
    };
  }

  /**
   * Computes commitment hash from secret and nonce
   * @param secret Random secret value
   * @param nonce Random nonce value
   * @returns SHA-256 hash of secret || nonce
   */
  private computeCommitment(secret: string, nonce: string): string {
    return crypto
      .createHash('sha256')
      .update(secret + nonce)
      .digest('hex');
  }

  /**
   * Verifies that a commitment matches the secret and nonce
   * @param commitment The commitment hash
   * @param secret The secret value
   * @param nonce The nonce value
   * @returns True if valid
   */
  verifyCommitment(commitment: string, secret: string, nonce: string): boolean {
    const computed = this.computeCommitment(secret, nonce);
    return computed === commitment;
  }

  /**
   * Clears commitment after successful reveal
   * @param raffleId The raffle ID
   */
  clearCommitment(raffleId: number): void {
    this.commitments.delete(raffleId);
  }

  /**
   * Gets commitment details (for debugging/monitoring)
   * @param raffleId The raffle ID
   */
  getCommitment(raffleId: number): Commitment | undefined {
    return this.commitments.get(raffleId);
  }

  /**
   * Gets all pending commitments
   */
  getPendingCommitments(): Commitment[] {
    return Array.from(this.commitments.values());
  }
}
