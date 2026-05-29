import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OracleRegistryService } from './oracle-registry.service';
import { 
  OracleSubmission, 
  SubmissionTracker,
  AggregatedRandomness,
  PeerOracleEndpoint,
} from './multi-oracle.types';
import { RandomnessResult } from '../queue/queue.types';
import * as crypto from 'crypto';
import * as http from 'http';
import * as https from 'https';

@Injectable()
export class MultiOracleCoordinatorService {
  private readonly logger = new Logger(MultiOracleCoordinatorService.name);
  
  private readonly submissionTrackers: Map<string, SubmissionTracker> = new Map();
  private readonly SUBMISSION_TIMEOUT_MS = 5 * 60 * 1000;
  private readonly multiTimeoutMs: number;

  constructor(
    private readonly oracleRegistry: OracleRegistryService,
    private readonly configService: ConfigService,
  ) {
    this.multiTimeoutMs = this.configService.get<number>('ORACLE_MULTI_TIMEOUT_MS', 10_000);
  }

  /**
   * Broadcast a draw request to all peer oracles and collect their VRF outputs.
   * Requires Math.ceil(peers/2)+1 responses within ORACLE_MULTI_TIMEOUT_MS.
   * Falls back to single-oracle result if threshold not met in time.
   *
   * @param requestId  The randomness request ID
   * @param localResult The local oracle's own VRF output (always included)
   * @returns Aggregated seed (XOR of all collected seeds) or localResult on fallback
   */
  async broadcastAndCollect(
    requestId: string,
    localResult: RandomnessResult,
  ): Promise<{ aggregated: RandomnessResult; usedOracles: string[]; fellBack: boolean }> {
    const peers = this.oracleRegistry.getPeerEndpoints();
    const localOracleId = this.oracleRegistry.getLocalOracleId();
    const threshold = this.oracleRegistry.getThreshold();

    if (peers.length === 0) {
      this.logger.warn(`No peer endpoints configured — falling back to single-oracle mode`);
      return { aggregated: localResult, usedOracles: [localOracleId], fellBack: true };
    }

    this.logger.log(
      `Broadcasting draw request to ${peers.length} peers for requestId=${requestId}, threshold=${threshold}`
    );

    const peerResults = await this.fetchFromPeers(requestId, peers);

    // Combine local + peer results
    const allResults: Array<{ id: string; result: RandomnessResult }> = [
      { id: localOracleId, result: localResult },
      ...peerResults,
    ];

    if (allResults.length < threshold) {
      this.logger.warn(
        `Only ${allResults.length}/${threshold} oracles responded for requestId=${requestId} — falling back to single-oracle`
      );
      return { aggregated: localResult, usedOracles: [localOracleId], fellBack: true };
    }

    // Use exactly threshold responses (local + first threshold-1 peers)
    const selected = allResults.slice(0, threshold);
    const seeds = selected.map(r => r.result.seed);
    const proofs = selected.map(r => r.result.proof);
    const usedOracles = selected.map(r => r.id);

    const aggregatedSeed = this.xorSeeds(seeds);
    const aggregatedProof = this.combineProofs(proofs);

    this.logger.log(
      `Consensus reached for requestId=${requestId}: ${selected.length} oracles [${usedOracles.join(', ')}]`
    );

    return {
      aggregated: { seed: aggregatedSeed, proof: aggregatedProof },
      usedOracles,
      fellBack: false,
    };
  }

  /**
   * Fan out HTTP POST requests to all peer oracles and collect responses within timeout.
   */
  private async fetchFromPeers(
    requestId: string,
    peers: PeerOracleEndpoint[],
  ): Promise<Array<{ id: string; result: RandomnessResult }>> {
    const requests = peers.map(peer =>
      this.fetchFromPeer(peer, requestId)
        .then(result => ({ id: peer.id, result }))
        .catch(err => {
          this.logger.warn(`Peer ${peer.id} (${peer.url}) failed: ${err.message}`);
          return null;
        }),
    );

    const settled = await Promise.all(requests);
    return settled.filter((r): r is { id: string; result: RandomnessResult } => r !== null);
  }

  /**
   * POST /vrf/compute to a single peer oracle with a timeout.
   */
  private fetchFromPeer(
    peer: PeerOracleEndpoint,
    requestId: string,
  ): Promise<RandomnessResult> {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({ requestId });
      const url = new URL(`${peer.url}/vrf/compute`);
      const isHttps = url.protocol === 'https:';
      const transport = isHttps ? https : http;

      const options: http.RequestOptions = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: this.multiTimeoutMs,
      };

      const req = transport.request(options, res => {
        let data = '';
        res.on('data', chunk => (data += chunk));
        res.on('end', () => {
          if (res.statusCode !== 200) {
            return reject(new Error(`HTTP ${res.statusCode} from peer ${peer.id}`));
          }
          try {
            const parsed = JSON.parse(data) as RandomnessResult;
            if (!parsed.seed || !parsed.proof) {
              return reject(new Error(`Invalid response from peer ${peer.id}`));
            }
            resolve(parsed);
          } catch {
            reject(new Error(`Failed to parse response from peer ${peer.id}`));
          }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Timeout waiting for peer ${peer.id}`));
      });

      req.on('error', err => reject(err));
      req.write(body);
      req.end();
    });
  }

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
