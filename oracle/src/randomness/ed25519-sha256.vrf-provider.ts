import { Injectable, Logger } from '@nestjs/common';
import { RandomnessResult } from '../queue/queue.types';
import { KeyService } from '../keys/key.service';
import { IVrfProvider, VrfAlgorithm } from './vrf.interface';
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
 * 1. Create a class that implements `IVrfProvider` in this directory.
 * 2. Add a new value to `VrfAlgorithm` in `vrf.interface.ts`.
 * 3. Register the provider in `VrfService.getProvider()`.
 */
@Injectable()
export class Ed25519Sha256VrfProvider implements IVrfProvider {
  readonly algorithm = VrfAlgorithm.Ed25519Sha256;
  private readonly logger = new Logger(Ed25519Sha256VrfProvider.name);

  constructor(private readonly keyService: KeyService) {}

  async compute(requestId: string, raffleId?: number): Promise<RandomnessResult> {
    const msg = this.encodeInput(requestId, raffleId);
    const proof = await this.keyService.sign(msg);
    const seed = crypto.createHash('sha256').update(proof).digest();
    return {
      seed: Buffer.from(seed).toString('hex'),
      proof: Buffer.from(proof).toString('hex'),
    };
  }

  verify(publicKey: string | Buffer, requestId: string, proof: string, seed: string, raffleId?: number): boolean {
    try {
      const pubKeyBuf = typeof publicKey === 'string' ? Buffer.from(publicKey, 'hex') : publicKey;
      const proofBuf = Buffer.from(proof, 'hex');
      const seedBuf = Buffer.from(seed, 'hex');
      const msgBuf = this.encodeInput(requestId, raffleId);

      if (!ed25519.verify(proofBuf, msgBuf, pubKeyBuf)) {
        return { valid: false };
      }

      const seed = crypto.createHash('sha256').update(proofBuf).digest('hex');
      return { valid: true, seed };
    } catch (error) {
      this.logger.error(`VRF proof verification failed: ${error.message}`);
      return { valid: false };
    }
  }

  verify(publicKey: string | Buffer, requestId: string, proof: string, seed: string): boolean {
    try {
      const proofVerification = this.verifyProof(publicKey, requestId, proof);
      if (!proofVerification.valid || !proofVerification.seed) return false;

      const seedBuf = Buffer.from(seed, 'hex');
      const expectedSeed = Buffer.from(proofVerification.seed, 'hex');
      return Buffer.compare(expectedSeed, seedBuf) === 0;
    } catch (error) {
      this.logger.error(`VRF verification failed: ${error.message}`);
      return false;
    }
  }

  /** Encodes VRF input: requestId_bytes [|| raffleId_u32_BE] */
  private encodeInput(requestId: string, raffleId?: number): Buffer {
    const reqBuf = Buffer.from(requestId, 'utf-8');
    if (raffleId === undefined) return reqBuf;
    const idBuf = Buffer.allocUnsafe(4);
    idBuf.writeUInt32BE(raffleId >>> 0, 0);
    return Buffer.concat([reqBuf, idBuf]);
  }
}
