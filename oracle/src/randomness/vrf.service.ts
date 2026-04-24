import { Injectable, Logger } from '@nestjs/common';
import { RandomnessResult } from '../queue/queue.types';
import { KeyService } from '../keys/key.service';
import { OracleRegistryService } from '../multi-oracle/oracle-registry.service';
import { ed25519 } from '@noble/curves/ed25519';
import * as crypto from 'crypto';
import { IVrfProvider, VrfAlgorithm } from './vrf.interface';
import { Ed25519Sha256VrfProvider } from './ed25519-sha256.vrf-provider';

/**
 * VrfService — Verifiable Random Function computation for high-stakes raffles.
 *
 * When prize >= 500 XLM, uses Ed25519 VRF for cryptographic security:
 *   proof = ed25519.sign(requestId, oraclePrivateKey)
 *   seed  = SHA-256(proof)
 *
 * The contract verifies the proof using the oracle's public key, ensuring
 * the oracle cannot manipulate the outcome.
 *
 * Supports both single-oracle and multi-oracle modes.
 */
@Injectable()
export class VrfService {
  private readonly logger = new Logger(VrfService.name);
  private readonly ed25519Provider: Ed25519Sha256VrfProvider;

  constructor(
    private readonly keyService: KeyService,
    private readonly oracleRegistry: OracleRegistryService,
  ) {
    this.ed25519Provider = new Ed25519Sha256VrfProvider(keyService);
  }

  /**
   * Compute VRF output using the oracle's private key.
   * Used in single-oracle mode.
   */
  async compute(requestId: string): Promise<RandomnessResult> {
    // Delegate to the Ed25519 provider which now uses KeyService.sign()
    return this.ed25519Provider.compute(requestId);
  }

  /**
   * Compute VRF output using a specific private key.
   * Core VRF computation:
   *   proof = ed25519.sign(requestId, privateKey)
   *   seed  = SHA-256(proof)
   * 
   * @deprecated This method exposes raw private keys. Use compute() instead.
   */
  computeWithKey(requestId: string, privateKey: Buffer): RandomnessResult {
    this.logger.debug(`Computing VRF for requestId=${requestId}`);

    const msg = Buffer.from(requestId, 'utf-8');
    const proof = ed25519.sign(msg, privateKey);
    const seed = crypto.createHash('sha256').update(proof).digest();

    return {
      seed: Buffer.from(seed).toString('hex'),
      proof: Buffer.from(proof).toString('hex'),
    };
  }

  /**
   * Compute VRF output for a specific oracle in multi-oracle mode.
   * Retrieves the oracle's keypair and uses its private key.
   */
  async computeForOracle(requestId: string, oracleId: string): Promise<RandomnessResult> {
    const oracle = this.oracleRegistry.getOracle(oracleId);
    if (!oracle) {
      throw new Error(`Oracle not found: ${oracleId}`);
    }

    const privateKey = this.oracleRegistry.getLocalKeypair().rawSecretKey();
    return this.computeWithKey(requestId, privateKey);
  }

  /**
   * Verify VRF output using the oracle's public key.
   * Anyone can verify the output is authentic and unmanipulated.
   * @returns true if proof is valid and seed is correct; false otherwise
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

      // Verify the proof is a valid Ed25519 signature
      const isSignatureValid = ed25519.verify(proofBuf, msgBuf, pubKeyBuf);
      if (!isSignatureValid) {
        return false;
      }

      // Verify the seed is SHA-256(proof)
      const expectedSeed = crypto.createHash('sha256').update(proofBuf).digest();
      return Buffer.compare(expectedSeed, seedBuf) === 0;
    } catch (error) {
      this.logger.error(`VRF verification failed: ${error.message}`);
      return false;
    }
  }
}
