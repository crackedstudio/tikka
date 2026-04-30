import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import {
  IndexerService,
  IndexerPlatformStats,
  IndexerTransparencyEntry,
} from '../../../services/indexer.service';

export interface TransparencyStats extends IndexerPlatformStats {
  oracle_public_key: string;
  draws_completed: number;
  recent_audit_log: IndexerTransparencyEntry[];
}

export interface VerifyResult {
  valid: boolean;
  reason?: string;
}

@Injectable()
export class StatsService {
  constructor(
    private readonly indexerService: IndexerService,
    private readonly config: ConfigService,
  ) {}

  async getPlatformStats(): Promise<IndexerPlatformStats> {
    return this.indexerService.getPlatformStats();
  }

  async getTransparencyStats(): Promise<TransparencyStats> {
    const [platform, log] = await Promise.all([
      this.indexerService.getPlatformStats(),
      this.indexerService.getTransparencyLog(10, 0).catch(() => ({ entries: [], total: 0 })),
    ]);

    return {
      ...platform,
      oracle_public_key: this.config.get<string>('ORACLE_PUBLIC_KEY', ''),
      draws_completed: log.total,
      recent_audit_log: log.entries,
    };
  }

  verifyDraw(
    publicKeyHex: string,
    requestId: string,
    proofHex: string,
    seedHex: string,
  ): VerifyResult {
    try {
      const pubKeyDer = Buffer.concat([
        // SubjectPublicKeyInfo prefix for Ed25519
        Buffer.from('302a300506032b6570032100', 'hex'),
        Buffer.from(publicKeyHex, 'hex'),
      ]);
      const pubKey = crypto.createPublicKey({
        key: pubKeyDer,
        format: 'der',
        type: 'spki',
      });

      const proofBuf = Buffer.from(proofHex, 'hex');
      const msgBuf = Buffer.from(requestId, 'utf-8');

      const signatureValid = crypto.verify(null, msgBuf, pubKey, proofBuf);
      if (!signatureValid) {
        return { valid: false, reason: 'Invalid proof signature' };
      }

      const expectedSeed = crypto.createHash('sha256').update(proofBuf).digest('hex');
      if (expectedSeed !== seedHex) {
        return { valid: false, reason: 'Seed does not match SHA-256(proof)' };
      }

      return { valid: true };
    } catch (e) {
      return { valid: false, reason: e instanceof Error ? e.message : 'Verification error' };
    }
  }
}
