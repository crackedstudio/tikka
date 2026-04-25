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
 *   input = requestId_bytes [|| raffleId_u32_BE]
 *   proof = ed25519.sign(input, oraclePrivateKey)
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
   *
   * @param requestId  Unique request identifier from the RandomnessRequested event.
   * @param raffleId   Optional raffle ID — mixed into the input so two raffles
   *                   with the same requestId still produce distinct seeds.
   */
  async compute(requestId: string, raffleId?: number): Promise<RandomnessResult> {
    return this.ed25519Provider.compute(requestId, raffleId);
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
   */
  async computeForOracle(requestId: string, oracleId: string, raffleId?: number): Promise<RandomnessResult> {
    const oracle = this.oracleRegistry.getOracle(oracleId);
    if (!oracle) {
      throw new Error(`Oracle not found: ${oracleId}`);
    }

    if (oracleId === this.oracleRegistry.getLocalOracleId()) {
      return this.compute(requestId, raffleId);
    }

    throw new Error('computeForOracle only supported for local oracle in multi-oracle mode currently');
  }

  /**
   * Verify VRF output using the oracle's public key.
   * Anyone can verify the output is authentic and unmanipulated.
   *
   * @returns true if proof is valid and seed is correct; false otherwise
   */
  verify(
    publicKey: string | Buffer,
    requestId: string,
    proof: string,
    seed: string,
    raffleId?: number,
  ): boolean {
    return this.ed25519Provider.verify(publicKey, requestId, proof, seed, raffleId);
  }
}
