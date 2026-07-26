import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { MetadataRedisService } from '../../../services/metadata-redis.service';
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
  private readonly logger = new Logger(StatsService.name);
  private readonly cacheKeyPrefix = 'stats:verify:';
  private readonly cacheTtl = 60; // 60 seconds

  constructor(
    private readonly indexerService: IndexerService,
    private readonly config: ConfigService,
    private readonly redis: MetadataRedisService,
  ) {}

  async getPlatformStats(): Promise<IndexerPlatformStats> {
    return this.indexerService.getPlatformStats();
  }

  async getTransparencyStats(): Promise<TransparencyStats> {
    const cacheKey = 'stats:transparency:60';

    // Try to get from cache if Redis is enabled
    if (this.redis.isEnabled()) {
      try {
        const cached = await this.redis.get(cacheKey);
        if (cached) {
          return JSON.parse(cached);
        }
      } catch (e) {
        this.logger.warn(`Cache lookup failed for transparency stats: ${e}`);
        // Continue with normal fetch
      }
    }

    // Fetch fresh data
    const [platform, log] = await Promise.all([
      this.indexerService.getPlatformStats(),
      this.indexerService.getTransparencyLog(10, 0).catch(() => ({ entries: [], total: 0 })),
    ]);

    const result: TransparencyStats = {
      ...platform,
      oracle_public_key: this.config.get<string>('ORACLE_PUBLIC_KEY', ''),
      draws_completed: log.total,
      recent_audit_log: log.entries,
    };

    // Store in cache if Redis is enabled
    if (this.redis.isEnabled()) {
      try {
        await this.redis.set(
          cacheKey,
          JSON.stringify(result),
          this.cacheTtl,
        );
      } catch (e) {
        this.logger.warn(`Cache write failed for transparency stats: ${e}`);
        // Don't fail the request due to cache write error
      }
    }

    return result;
  }

  async verifyDraw(
    publicKeyHex: string,
    requestId: string,
    proofHex: string,
    seedHex: string,
  ): Promise<VerifyResult> {
    // Build cache key from inputs
    const cacheKey = `${this.cacheKeyPrefix}${publicKeyHex}:${requestId}:${proofHex}:${seedHex}`;

    // Try to get from cache if Redis is enabled
    if (this.redis.isEnabled()) {
      try {
        const cached = await this.redis.get(cacheKey);
        if (cached) {
          return JSON.parse(cached);
        }
      } catch (e) {
        this.logger.warn(`Cache lookup failed for verify: ${e}`);
        // Continue with normal verification
      }
    }

    // Perform verification
    const result = this.performVerification(publicKeyHex, requestId, proofHex, seedHex);

    // Store in cache if Redis is enabled
    if (this.redis.isEnabled()) {
      try {
        await this.redis.set(
          cacheKey,
          JSON.stringify(result),
          this.cacheTtl,
        );
      } catch (e) {
        this.logger.warn(`Cache write failed for verify: ${e}`);
        // Don't fail verification due to cache write error
      }
    }

    return result;
  }

  async verifyByTxHash(txHash: string): Promise<{ verified: boolean; proof: string }> {
    const log = await this.indexerService.getTransparencyLog(1, 0, undefined, txHash);
    const entry = log.entries[0];
    if (!entry) {
      return { verified: false, proof: '' };
    }
    const result = this.performVerification(
      this.config.get<string>('ORACLE_PUBLIC_KEY', ''),
      entry.request_id,
      entry.proof,
      entry.seed,
    );
    return { verified: result.valid, proof: entry.proof };
  }

  /**
   * Performs the actual VRF verification logic.
   */
  private performVerification(
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
