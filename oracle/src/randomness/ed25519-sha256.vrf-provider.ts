import { Injectable, Logger } from '@nestjs/common';
import { RandomnessResult } from '../queue/queue.types';
import { KeyService } from '../keys/key.service';
import { IVrfProvider, VrfAlgorithm } from './vrf.interface';
import {
  IRandomnessProvider,
  RandomnessProviderType,
  RandomnessProviderMetadata,
  RandomnessRequestInput,
  RandomnessResponse,
  VerificationResult,
} from './randomness-provider.interface';
import { ed25519 } from '@noble/curves/ed25519';
import * as crypto from 'crypto';

/**
 * Ed25519-SHA-256 VRF provider.
 *
 * Proof  = Ed25519 deterministic signature over encoded input (RFC 8032).
 * Output = SHA-256(proof) — uniformly distributed 32-byte seed.
 *
 * Input encoding: requestId_bytes [|| raffleId_u32_BE]
 * Mirrors the PRNG service encoding so both paths are consistent.
 *
 * Adding a new algorithm
 * ----------------------
 * 1. Create a class that implements `IRandomnessProvider` in this directory.
 * 2. Add a new value to `RandomnessProviderType` in `randomness-provider.interface.ts`.
 * 3. Register the provider in the randomness service factory.
 */
@Injectable()
export class Ed25519Sha256VrfProvider implements IVrfProvider, IRandomnessProvider {
  readonly algorithm = VrfAlgorithm.Ed25519Sha256;
  private readonly logger = new Logger(Ed25519Sha256VrfProvider.name);

  constructor(private readonly keyService: KeyService) {}

  // ── IVrfProvider implementation (legacy interface) ──────────────────────

  async compute(requestId: string, raffleId?: number): Promise<RandomnessResult> {
    const msg = this.encodeInput(requestId, raffleId);
    const proof = await this.keyService.sign(msg);
    const seed = crypto.createHash('sha256').update(proof).digest();
    return {
      seed: Buffer.from(seed).toString('hex'),
      proof: Buffer.from(proof).toString('hex'),
    };
  }

  verifyProof(
    publicKey: string | Buffer,
    requestId: string,
    proof: string,
    raffleId?: number,
  ): { valid: boolean; seed?: string } {
    const result = this.verifyProofInternal(publicKey, requestId, proof, raffleId);
    return { valid: result.valid, seed: result.seed };
  }

  verify(publicKey: string | Buffer, requestId: string, proof: string, seed: string, raffleId?: number): boolean {
    return this.verifyInternal(publicKey, requestId, proof, seed, raffleId);
  }

  // ── IRandomnessProvider implementation ──────────────────────────────────

  getMetadata(): RandomnessProviderMetadata {
    return {
      type: RandomnessProviderType.VRF,
      algorithm: this.algorithm,
      description: 'Ed25519-SHA-256 Verifiable Random Function',
      isVerifiable: true,
    };
  }

  validateRequest(input: RandomnessRequestInput): boolean {
    if (!input.requestId || typeof input.requestId !== 'string') {
      this.logger.warn('Invalid request: requestId is required and must be a string');
      return false;
    }
    if (input.raffleId !== undefined && (!Number.isInteger(input.raffleId) || input.raffleId < 0)) {
      this.logger.warn('Invalid request: raffleId must be a non-negative integer');
      return false;
    }
    return true;
  }

  async generate(input: RandomnessRequestInput): Promise<RandomnessResponse> {
    if (!this.validateRequest(input)) {
      throw new Error('Invalid randomness request input');
    }

    const result = await this.compute(input.requestId, input.raffleId);
    return {
      ...result,
      provider: RandomnessProviderType.VRF,
      algorithm: this.algorithm,
      generatedAt: new Date(),
    };
  }

  // ── Internal verification methods ───────────────────────────────────────

  private verifyProofInternal(
    publicKey: string | Buffer | null,
    requestId: string,
    proof: string,
    raffleId?: number,
  ): VerificationResult {
    if (!publicKey) {
      return { valid: false, error: 'Public key is required for VRF verification' };
    }

    try {
      const pubKeyBuf = typeof publicKey === 'string' ? Buffer.from(publicKey, 'hex') : publicKey;
      const proofBuf = Buffer.from(proof, 'hex');
      const msgBuf = this.encodeInput(requestId, raffleId);

      if (!ed25519.verify(proofBuf, msgBuf, pubKeyBuf)) {
        return { valid: false, error: 'Proof signature verification failed' };
      }

      const seed = crypto.createHash('sha256').update(proofBuf).digest('hex');
      return { valid: true, seed };
    } catch (error: any) {
      this.logger.error(`VRF proof verification failed: ${error.message}`);
      return { valid: false, error: error.message };
    }
  }

  private verifyInternal(
    publicKey: string | Buffer | null,
    requestId: string,
    proof: string,
    seed: string,
    raffleId?: number,
  ): boolean {
    try {
      const proofVerification = this.verifyProofInternal(publicKey, requestId, proof, raffleId);
      if (!proofVerification.valid || !proofVerification.seed) return false;

      const seedBuf = Buffer.from(seed, 'hex');
      const expectedSeed = Buffer.from(proofVerification.seed, 'hex');
      return Buffer.compare(expectedSeed, seedBuf) === 0;
    } catch (error: any) {
      this.logger.error(`VRF verification failed: ${error.message}`);
      return false;
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  /** Encodes VRF input: requestId_bytes [|| raffleId_u32_BE] */
  private encodeInput(requestId: string, raffleId?: number): Buffer {
    const reqBuf = Buffer.from(requestId, 'utf-8');
    if (raffleId === undefined) return reqBuf;
    const idBuf = Buffer.allocUnsafe(4);
    idBuf.writeUInt32BE(raffleId >>> 0, 0);
    return Buffer.concat([reqBuf, idBuf]);
  }
}
