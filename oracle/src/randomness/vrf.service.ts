import { Injectable, Logger } from '@nestjs/common';
import { RandomnessResult } from '../queue/queue.types';
import { KeyService } from '../keys/key.service';
import { OracleRegistryService } from '../multi-oracle/oracle-registry.service';
import { ed25519 } from '@noble/curves/ed25519';
import * as crypto from 'crypto';
import { IVrfProvider, VrfAlgorithm } from './vrf.interface';
import { Ed25519Sha256VrfProvider } from './ed25519-sha256.vrf-provider';

@Injectable()
export class VrfService {
  private readonly logger = new Logger(VrfService.name);
  private readonly providers: Map<VrfAlgorithm, IVrfProvider>;

  constructor(
    private readonly keyService: KeyService,
    private readonly oracleRegistry: OracleRegistryService,
  ) {}

  async compute(requestId: string): Promise<RandomnessResult> {
    const privateKey = this.keyService.getSecretBuffer();
    return this.computeWithKey(requestId, privateKey);
  }

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

  async computeForOracle(requestId: string, oracleId: string): Promise<RandomnessResult> {
    const oracle = this.oracleRegistry.getOracle(oracleId);
    if (!oracle) {
      throw new Error(`Oracle not found: ${oracleId}`);
    }

    const privateKey = this.oracleRegistry.getLocalKeypair().rawSecretKey();
    return this.computeWithKey(requestId, privateKey);
  }

  constructor(private readonly keyService: KeyService) {
    const ed25519Provider = new Ed25519Sha256VrfProvider(keyService);
    this.providers = new Map([[VrfAlgorithm.Ed25519Sha256, ed25519Provider]]);
  }

  /**
   * Compute VRF output using the specified algorithm (defaults to Ed25519-SHA-256).
   * The algorithm can be driven by a contract requirement field in the future.
   */
  async compute(
    requestId: string,
    algorithm: VrfAlgorithm = VrfAlgorithm.Ed25519Sha256,
  ): Promise<RandomnessResult> {
    const provider = this.getProvider(algorithm);
    this.logger.debug(`Computing VRF for requestId=${requestId} algorithm=${algorithm}`);
    return provider.compute(requestId);
  }

  verify(
    publicKey: string | Buffer,
    requestId: string,
    proof: string,
    seed: string,
    algorithm: VrfAlgorithm = VrfAlgorithm.Ed25519Sha256,
  ): boolean {
    try {
      const pubKeyBuf = typeof publicKey === 'string' ? Buffer.from(publicKey, 'hex') : publicKey;
      const proofBuf = Buffer.from(proof, 'hex');
      const seedBuf = Buffer.from(seed, 'hex');
      const msgBuf = Buffer.from(requestId, 'utf-8');

      const isSignatureValid = ed25519.verify(proofBuf, msgBuf, pubKeyBuf);
      if (!isSignatureValid) return false;

      const expectedSeed = crypto.createHash('sha256').update(proofBuf).digest();
      return Buffer.compare(expectedSeed, seedBuf) === 0;
    } catch (error) {
      this.logger.error(`VRF verification failed: ${error.message}`);
      return false;
    }
    return this.getProvider(algorithm).verify(publicKey, requestId, proof, seed);
  }

  private getProvider(algorithm: VrfAlgorithm): IVrfProvider {
    const provider = this.providers.get(algorithm);
    if (!provider) throw new Error(`Unsupported VRF algorithm: ${algorithm}`);
    return provider;
  }
}
