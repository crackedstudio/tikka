import { Injectable, Logger } from '@nestjs/common';
import { RandomnessResult } from '../queue/queue.types';
import { KeyService } from '../keys/key.service';
import { ed25519 } from '@noble/curves/ed25519';
import * as crypto from 'crypto';

@Injectable()
export class VrfService {
  private readonly logger = new Logger(VrfService.name);

  constructor(private readonly keyService: KeyService) { }

  /**
   * Computes verifiable random function output for high-stakes raffles.
   * Uses Ed25519 deterministic signatures (RFC 8032) as the VRF proof.
   * The seed is derived by hashing the proof (signature) with SHA-256.
   *
   * @param requestId Unique request identifier
   * @returns Seed (32 bytes hex) and cryptographic proof (64 bytes hex)
   */
  async compute(requestId: string): Promise<RandomnessResult> {
    this.logger.debug(`Computing VRF for requestId=${requestId}`);

    const msg = Buffer.from(requestId, 'utf-8');
    const privateKey = this.keyService.getSecretBuffer();

    // Generate deterministic Ed25519 signature (64 bytes)
    // This serves as our VRF proof because it is unique for (K, msg) and verifiable.
    const proof = ed25519.sign(msg, privateKey);

    // Derive the randomness seed by hashing the proof (32 bytes)
    // This ensures the seed is uniformly distributed even if the signature has structure.
    const seed = crypto.createHash('sha256').update(proof).digest();

    return {
      seed: Buffer.from(seed).toString('hex'), // 64 hex chars -> BytesN<32>
      proof: Buffer.from(proof).toString('hex'), // 128 hex chars -> BytesN<64>
    };
  }

  /**
   * Verifies the VRF output against a public key and requestId.
   * This is consistent with how the contract would verify the proof on-chain.
   *
   * @param publicKey The oracle's public key (32 bytes hex or Buffer)
   * @param requestId The original input
   * @param proof The 64-byte proof (hex)
   * @param seed The 32-byte seed (hex)
   * @returns true if valid
   */
  verify(
    publicKey: string | Buffer,
    requestId: string,
    proof: string,
    seed: string,
  ): boolean {
    try {
      const pubKeyBuf = typeof publicKey === 'string' ? Buffer.from(publicKey, 'hex') : publicKey;
      const proofBuf = Buffer.from(proof, 'hex');
      const seedBuf = Buffer.from(seed, 'hex');
      const msgBuf = Buffer.from(requestId, 'utf-8');

      // 1. Verify Ed25519 signature
      const isSignatureValid = ed25519.verify(proofBuf, msgBuf, pubKeyBuf);
      if (!isSignatureValid) return false;

      // 2. Verify seed is SHA-256(proof)
      const expectedSeed = crypto.createHash('sha256').update(proofBuf).digest();
      return Buffer.compare(expectedSeed, seedBuf) === 0;
    } catch (error) {
      this.logger.error(`VRF verification failed: ${error.message}`);
      return false;
    }
  }
}
