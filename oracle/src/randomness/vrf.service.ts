import { Injectable, Logger } from '@nestjs/common';
import { RandomnessResult } from '../queue/queue.types';
import { KeyService } from '../keys/key.service';
import { OracleRegistryService } from '../multi-oracle/oracle-registry.service';
import { ed25519 } from '@noble/curves/ed25519';
import * as crypto from 'crypto';

@Injectable()
export class VrfService {
  private readonly logger = new Logger(VrfService.name);

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

      const isSignatureValid = ed25519.verify(proofBuf, msgBuf, pubKeyBuf);
      if (!isSignatureValid) return false;

      const expectedSeed = crypto.createHash('sha256').update(proofBuf).digest();
      return Buffer.compare(expectedSeed, seedBuf) === 0;
    } catch (error) {
      this.logger.error(`VRF verification failed: ${error.message}`);
      return false;
    }
  }
}
