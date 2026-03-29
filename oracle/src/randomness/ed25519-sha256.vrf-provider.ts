import { Injectable, Logger } from '@nestjs/common';
import { RandomnessResult } from '../queue/queue.types';
import { KeyService } from '../keys/key.service';
import { IVrfProvider, VrfAlgorithm } from './vrf.interface';
import { ed25519 } from '@noble/curves/ed25519';
import * as crypto from 'crypto';

/**
 * Ed25519-SHA-256 VRF provider.
 *
 * Proof  = Ed25519 deterministic signature over the requestId (RFC 8032).
 * Output = SHA-256(proof) — uniformly distributed 32-byte seed.
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

  async compute(requestId: string): Promise<RandomnessResult> {
    const msg = Buffer.from(requestId, 'utf-8');
    const privateKey = this.keyService.getSecretBuffer();
    const proof = ed25519.sign(msg, privateKey);
    const seed = crypto.createHash('sha256').update(proof).digest();
    return {
      seed: Buffer.from(seed).toString('hex'),
      proof: Buffer.from(proof).toString('hex'),
    };
  }

  verify(publicKey: string | Buffer, requestId: string, proof: string, seed: string): boolean {
    try {
      const pubKeyBuf = typeof publicKey === 'string' ? Buffer.from(publicKey, 'hex') : publicKey;
      const proofBuf = Buffer.from(proof, 'hex');
      const seedBuf = Buffer.from(seed, 'hex');
      const msgBuf = Buffer.from(requestId, 'utf-8');

      if (!ed25519.verify(proofBuf, msgBuf, pubKeyBuf)) return false;
      const expectedSeed = crypto.createHash('sha256').update(proofBuf).digest();
      return Buffer.compare(expectedSeed, seedBuf) === 0;
    } catch (error) {
      this.logger.error(`VRF verification failed: ${error.message}`);
      return false;
    }
  }
}
