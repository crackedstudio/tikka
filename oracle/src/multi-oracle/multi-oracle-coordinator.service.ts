import { Injectable, Logger } from '@nestjs/common';
import { OracleRegistryService } from './oracle-registry.service';
import { 
  OracleSubmission, 
  SubmissionTracker,
  AggregatedRandomness
} from './multi-oracle.types';
import { RandomnessResult } from '../queue/queue.types';
import * as crypto from 'crypto';

@Injectable()
export class MultiOracleCoordinatorService {
  private readonly logger = new Logger(MultiOracleCoordinatorService.name);
  
  private readonly submissionTrackers: Map<string, SubmissionTracker> = new Map();
  private readonly SUBMISSION_TIMEOUT_MS = 5 * 60 * 1000;

  constructor(private readonly oracleRegistry: OracleRegistryService) {}

  async startTracking(
    raffleId: number,
    requestId: string,
  ): Promise<void> {
    const key = this.getTrackerKey(raffleId, requestId);
    
    if (this.submissionTrackers.has(key)) {
      this.logger.debug(`Tracker already exists for ${key}`);
      return;
    }

    const tracker: SubmissionTracker = {
      requestId,
      raffleId,
      submissions: new Map(),
      threshold: this.oracleRegistry.getThreshold(),
      completed: false,
    };

    this.submissionTrackers.set(key, tracker);
    this.logger.log(
      `Started tracking multi-oracle submission: raffle=${raffleId}, request=${requestId}, threshold=${tracker.threshold}`
    );

    this.scheduleCleanup(key);
  }

  recordSubmission(
    raffleId: number,
    requestId: string,
    oracleId: string,
    publicKey: string,
    randomness: RandomnessResult,
    txHash?: string,
  ): { ready: boolean; aggregated?: AggregatedRandomness } {
    const key = this.getTrackerKey(raffleId, requestId);
    const tracker = this.submissionTrackers.get(key);

    if (!tracker) {
      this.logger.warn(`No tracker found for ${key}, creating new one`);
      this.startTracking(raffleId, requestId);
      return this.recordSubmission(raffleId, requestId, oracleId, publicKey, randomness, txHash);
    }

    if (tracker.completed) {
      this.logger.debug(`Tracker already completed for ${key}`);
      return { ready: true, aggregated: this.buildAggregatedResult(tracker) };
    }

    if (tracker.submissions.has(oracleId)) {
      this.logger.debug(`Oracle ${oracleId} already submitted for ${key}`);
      return { ready: false };
    }

    const submission: OracleSubmission = {
      oracleId,
      publicKey,
      seed: randomness.seed,
      proof: randomness.proof,
      timestamp: Date.now(),
      txHash,
    };

    tracker.submissions.set(oracleId, submission);
    this.oracleRegistry.recordSubmission(oracleId);

    this.logger.log(
      `Recorded submission from ${oracleId} for ${key}: ${tracker.submissions.size}/${tracker.threshold}`
    );

    if (tracker.submissions.size >= tracker.threshold) {
      tracker.completed = true;
      const aggregated = this.buildAggregatedResult(tracker);
      this.logger.log(
        `Threshold reached for ${key}: ${tracker.submissions.size} submissions, ready to finalize`
      );
      return { ready: true, aggregated };
    }

    return { ready: false };
  }

  private buildAggregatedResult(tracker: SubmissionTracker): AggregatedRandomness {
    const seeds: string[] = [];
    const proofs: string[] = [];
    const submittedBy: string[] = [];

    for (const [oracleId, submission] of tracker.submissions) {
      seeds.push(submission.seed);
      proofs.push(submission.proof);
      submittedBy.push(oracleId);
    }

    seeds.sort();
    proofs.sort();

    const aggregatedSeed = this.xorSeeds(seeds);
    const aggregatedProof = this.combineProofs(proofs);

    return {
      seed: aggregatedSeed,
      proof: aggregatedProof,
      submittedBy,
    };
  }

  private xorSeeds(seeds: string[]): string {
    if (seeds.length === 0) {
      return Buffer.alloc(32).toString('hex');
    }

    if (seeds.length === 1) {
      return seeds[0];
    }

    let result = Buffer.from(seeds[0], 'hex');
    
    for (let i = 1; i < seeds.length; i++) {
      const seedBuf = Buffer.from(seeds[i], 'hex');
      for (let j = 0; j < Math.min(result.length, seedBuf.length); j++) {
        result[j] ^= seedBuf[j];
      }
    }

    return result.toString('hex');
  }

  private combineProofs(proofs: string[]): string {
    if (proofs.length === 0) {
      return '';
    }

    if (proofs.length === 1) {
      return proofs[0];
    }

    const combined = proofs.map(p => Buffer.from(p, 'hex'));
    const concatenated = Buffer.concat(combined);
    return crypto.createHash('sha512').update(concatenated).digest('hex');
  }

  getTracker(raffleId: number, requestId: string): SubmissionTracker | undefined {
    const key = this.getTrackerKey(raffleId, requestId);
    return this.submissionTrackers.get(key);
  }

  getSubmissionCount(raffleId: number, requestId: string): number {
    const tracker = this.getTracker(raffleId, requestId);
    return tracker?.submissions.size ?? 0;
  }

  isReady(raffleId: number, requestId: string): boolean {
    const tracker = this.getTracker(raffleId, requestId);
    return tracker?.completed ?? false;
  }

  isTracked(raffleId: number, requestId: string): boolean {
    const key = this.getTrackerKey(raffleId, requestId);
    return this.submissionTrackers.has(key);
  }

  hasSubmitted(raffleId: number, requestId: string, oracleId?: string): boolean {
    const tracker = this.getTracker(raffleId, requestId);
    if (!tracker) return false;
    
    if (oracleId) {
      return tracker.submissions.has(oracleId);
    }
    
    return tracker.submissions.size > 0;
  }

  private getTrackerKey(raffleId: number, requestId: string): string {
    return `${raffleId}:${requestId}`;
  }

  private scheduleCleanup(key: string): void {
    setTimeout(() => {
      const tracker = this.submissionTrackers.get(key);
      if (tracker && !tracker.completed) {
        this.logger.warn(`Cleaning up incomplete tracker for ${key}`);
        this.submissionTrackers.delete(key);
      }
    }, this.SUBMISSION_TIMEOUT_MS);
  }

  clearTracker(raffleId: number, requestId: string): void {
    const key = this.getTrackerKey(raffleId, requestId);
    this.submissionTrackers.delete(key);
    this.logger.debug(`Cleared tracker for ${key}`);
  }

  clearAllTrackers(): void {
    const count = this.submissionTrackers.size;
    this.submissionTrackers.clear();
    this.logger.log(`Cleared all ${count} submission trackers`);
  }

  getPendingTrackers(): { raffleId: number; requestId: string; submissions: number; threshold: number }[] {
    const pending: { raffleId: number; requestId: string; submissions: number; threshold: number }[] = [];
    
    for (const tracker of this.submissionTrackers.values()) {
      if (!tracker.completed) {
        pending.push({
          raffleId: tracker.raffleId,
          requestId: tracker.requestId,
          submissions: tracker.submissions.size,
          threshold: tracker.threshold,
        });
      }
    }
    
    return pending;
  }
}
