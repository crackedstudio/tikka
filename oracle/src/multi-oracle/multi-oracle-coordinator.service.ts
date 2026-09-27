import { OracleLoggerService } from '../logger/oracle-logger';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OracleRegistryService } from './oracle-registry.service';
import {
  SubmissionTracker,
  AggregatedRandomness,
  PeerOracleEndpoint,
  OracleSubmission,
} from './multi-oracle.types';
import { RandomnessResult } from '../queue/queue.types';
import { AuditLogService } from '../audit/audit-log.service';
import { MetricsService } from '../metrics/metrics.service';
import { AlertingService } from '../health/alerting.service';
import * as crypto from 'crypto';
import * as http from 'http';
import * as https from 'https';

@Injectable()
export class MultiOracleCoordinatorService {
  

  private readonly submissionTrackers: Map<string, SubmissionTracker> = new Map();
  private readonly SUBMISSION_TIMEOUT_MS = 5 * 60 * 1000;
  private readonly multiTimeoutMs: number;
  private readonly consensusTimeoutMs: number;

  constructor(
    private readonly logger: OracleLoggerService,
    private readonly oracleRegistry: OracleRegistryService,
    private readonly configService: ConfigService,
    private readonly auditLog: AuditLogService,
    private readonly metrics: MetricsService,
    private readonly alerting: AlertingService,
  ) {
    this.multiTimeoutMs =
      this.configService.get<number>('ORACLE_MULTI_TIMEOUT_MS') ?? 10_000;
    this.consensusTimeoutMs =
      this.configService.get<number>('ORACLE_CONSENSUS_TIMEOUT_MS') ?? 30_000;
  }

  // ===============================
  // 🔹 CORE QUORUM LOGIC
  // ===============================
  async broadcastAndCollect(
    requestId: string,
    localResult: RandomnessResult,
  ): Promise<{
    aggregated: RandomnessResult;
    usedOracles: string[];
    fellBack: boolean;
    consensusReached?: boolean;
  }> {
    const peers = this.oracleRegistry.getPeerEndpoints();
    const localOracleId = this.oracleRegistry.getLocalOracleId();
    const threshold = this.oracleRegistry.getThreshold();
    const consensusThreshold = this.oracleRegistry.getConsensusThreshold();

    if (!peers.length) {
      return {
        aggregated: localResult,
        usedOracles: [localOracleId],
        fellBack: true,
        consensusReached: true, // Single oracle always has consensus
      };
    }

    const peerResults = await this.fetchFromPeers(requestId, peers);

    const allResults = [
      { id: localOracleId, result: localResult },
      ...peerResults,
    ].sort((a, b) => a.id.localeCompare(b.id));

    // ❗ insufficient quorum
    if (allResults.length < threshold) {
      this.logger.warn({
        message: 'Insufficient oracle responses for quorum',
        requestId,
        received: allResults.length,
        threshold,
        consensusThreshold,
      });
      return {
        aggregated: localResult,
        usedOracles: [localOracleId],
        fellBack: true,
        consensusReached: false,
      };
    }

    // ✅ Check consensus: group results by seed hash
    const consensusCheck = this.checkConsensus(allResults, consensusThreshold);
    
    if (!consensusCheck.consensusReached) {
      this.logger.warn({
        message: 'Oracle consensus not reached',
        requestId,
        totalResponses: allResults.length,
        threshold,
        consensusThreshold,
        seedGroups: consensusCheck.seedGroups,
        largestGroup: consensusCheck.largestGroupSize,
      });

      // Build per-oracle hash and timestamp maps from available results.
      const submittedValueHashes: Record<string, string> = {};
      const oracleTimestamps: Record<string, number> = {};
      const now = Date.now();
      for (const r of allResults) {
        submittedValueHashes[r.id] = this.hashSeed(r.result.seed);
        oracleTimestamps[r.id] = now;
      }

      // Derive the plurality hash (largest group) for the record.
      const largestGroupHash =
        Object.entries(consensusCheck.seedGroups).reduce<[string, number] | null>(
          (best, [hash, count]) =>
            best === null || count > best[1] ? [hash, count] : best,
          null,
        )?.[0] ?? null;

      void this.auditLog.recordDivergence({
        requestId,
        submittedValueHashes,
        oracleTimestamps,
        seedGroups: consensusCheck.seedGroups,
        largestGroupHash,
        totalResponses: allResults.length,
        consensusThreshold,
        detectedAt: new Date().toISOString(),
      });

      this.metrics.recordDivergence(Object.keys(consensusCheck.seedGroups).length);

      // Never fallback to a single oracle's value when consensus fails.
      // Return the plurality-based aggregation for audit/reference but
      // mark consensusReached: false so the caller refuses to submit.
      const pluralityGroup = Object.entries(consensusCheck.seedGroups)
        .reduce<[string, number] | null>((best, [hash, count]) =>
          best === null || count > best[1] ? [hash, count] : best,
          null,
        );

      let pluralityAggregated: RandomnessResult;
      if (pluralityGroup && consensusCheck.largestGroupSize > 1) {
        // Use the plurality group's aggregated result instead of a single node
        const pluralityResults = allResults.filter(
          r => this.hashSeed(r.result.seed) === pluralityGroup[0],
        );
        const seeds = pluralityResults.map(r => r.result.seed);
        const proofs = pluralityResults.map(r => r.result.proof);
        pluralityAggregated = {
          seed: this.xorSeeds(seeds),
          proof: this.combineProofs(proofs),
        };
      } else {
        // All unique values — aggregate everything (no single oracle's value dominates)
        const seeds = allResults.map(r => r.result.seed);
        const proofs = allResults.map(r => r.result.proof);
        pluralityAggregated = {
          seed: this.xorSeeds(seeds),
          proof: this.combineProofs(proofs),
        };
      }

      return {
        aggregated: pluralityAggregated,
        usedOracles: allResults.map(r => r.id),
        fellBack: true,
        consensusReached: false,
      };
    }

    // deterministic selection from consensus group
    const consensusResults = consensusCheck.consensusGroup!;
    const selected = consensusResults.slice(0, threshold);

    const aggregatedSeed = this.xorSeeds(selected.map(r => r.result.seed));
    const aggregatedProof = this.combineProofs(selected.map(r => r.result.proof));

    this.logger.log({
      message: 'Oracle consensus reached',
      requestId,
      consensusSize: consensusResults.length,
      consensusThreshold,
      selectedOracles: selected.map(r => r.id),
      seedHash: consensusCheck.consensusSeedHash,
    });

    return {
      aggregated: { seed: aggregatedSeed, proof: aggregatedProof },
      usedOracles: selected.map(r => r.id),
      fellBack: false,
      consensusReached: true,
    };
  }

  // ===============================
  // 🔹 PEER FETCH (with failure handling)
  // ===============================
  private async fetchFromPeers(
    requestId: string,
    peers: PeerOracleEndpoint[],
  ): Promise<Array<{ id: string; result: RandomnessResult }>> {
    const results = await Promise.all(
      peers.map(peer =>
        this.fetchFromPeer(peer, requestId)
          .then(result => ({ id: peer.id, result }))
          .catch(err => {
            this.logger.warn(`Peer ${peer.id} failed: ${err.message}`);
            return null;
          }),
      ),
    );

    return results.filter(
      (r): r is { id: string; result: RandomnessResult } => r !== null,
    );
  }

  private fetchFromPeer(
    peer: PeerOracleEndpoint,
    requestId: string,
  ): Promise<RandomnessResult> {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({ requestId });
      const url = new URL(`${peer.url}/vrf/compute`);
      const transport = url.protocol === 'https:' ? https : http;

      const req = transport.request(
        {
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: url.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
            // Propagate the correlation id so the peer oracle can attach it to
            // its own logs for the same logical draw operation.
            'x-request-id': requestId,
          },
          timeout: this.multiTimeoutMs,
        },
        res => {
          let data = '';

          res.on('data', chunk => (data += chunk));
          res.on('end', () => {
            if (res.statusCode !== 200) {
              return reject(new Error(`HTTP ${res.statusCode}`));
            }

            try {
              const parsed = JSON.parse(data);

              if (!parsed.seed || !parsed.proof) {
                return reject(new Error('Invalid peer response'));
              }

              resolve(parsed);
            } catch {
              reject(new Error('Parse error'));
            }
          });
        },
      );

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Timeout peer ${peer.id}`));
      });

      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  // ===============================
  // 🔹 TRACKING (REQUIRED BY WORKER + HEALTH)
  // ===============================
  startTracking(raffleId: number, requestId: string): void {
    const key = this.getKey(raffleId, requestId);

    if (this.submissionTrackers.has(key)) return;

    const tracker: SubmissionTracker = {
      raffleId,
      requestId,
      submissions: new Map(),
      threshold: this.oracleRegistry.getThreshold(),
      completed: false,
      consensusStartTime: Date.now(),
    };

    this.submissionTrackers.set(key, tracker);

    // Set up consensus timeout
    const consensusTimer = setTimeout(() => {
      this.checkConsensusTimeout(tracker);
    }, this.consensusTimeoutMs);
    
    tracker.consensusTimeout = consensusTimer;

    // prevent test memory leaks
    const timer = setTimeout(() => {
      if (tracker.consensusTimeout) {
        clearTimeout(tracker.consensusTimeout);
      }
      this.submissionTrackers.delete(key);
    }, this.SUBMISSION_TIMEOUT_MS);

    timer.unref();
  }

  isTracked(raffleId: number, requestId: string): boolean {
    return this.submissionTrackers.has(this.getKey(raffleId, requestId));
  }

  /**
   * Returns a snapshot of all active (incomplete) trackers.  Used by
   * monitoring and tests to detect stuck or non-revealing nodes.
   */
  getPendingTrackers(): Array<{
    raffleId: number;
    requestId: string;
    submissions: number;
    threshold: number;
    ageMs: number;
  }> {
    const now = Date.now();
    const pending: Array<{
      raffleId: number;
      requestId: string;
      submissions: number;
      threshold: number;
      ageMs: number;
    }> = [];
    for (const [key, tracker] of this.submissionTrackers) {
      if (tracker.completed) continue;
      pending.push({
        raffleId: tracker.raffleId,
        requestId: tracker.requestId,
        submissions: tracker.submissions.size,
        threshold: tracker.threshold,
        ageMs: tracker.consensusStartTime ? now - tracker.consensusStartTime : 0,
      });
    }
    return pending;
  }

  recordSubmission(
    raffleId: number,
    requestId: string,
    oracleId: string,
    publicKey: string,
    randomness: RandomnessResult,
    commitmentHash?: string,
  ): { ready: boolean; aggregated?: AggregatedRandomness } {
    const key = this.getKey(raffleId, requestId);
    let tracker = this.submissionTrackers.get(key);

    if (!tracker) {
      this.startTracking(raffleId, requestId);
      tracker = this.submissionTrackers.get(key)!;
    }

    if (tracker.submissions.has(oracleId)) {
      return { ready: false };
    }

    // ── Commit-reveal equivocation check ──────────────────────────────────
    // If the caller provided a commitment hash, verify that the revealed seed
    // actually matches it.  A mismatch means the oracle is equivocating
    // (committed to one value but revealed another), so we exclude it and
    // alert the operator.
    if (commitmentHash) {
      const actualHash = this.hashSeed(randomness.seed);
      if (actualHash !== commitmentHash) {
        this.logger.warn({
          message: 'Oracle commit-reveal mismatch — excluding oracle',
          raffleId,
          requestId,
          oracleId,
          expectedCommitment: commitmentHash,
          actualHash,
        });

        void this.alerting.fire({
          severity: 'critical',
          summary: `Oracle ${oracleId} commit-reveal mismatch for raffle ${raffleId}`,
          details: `Committed ${commitmentHash} but revealed ${actualHash}`,
          dedupKey: `commit-reveal-mismatch:${oracleId}:${requestId}`,
          context: { raffleId, requestId, oracleId },
        });

        return { ready: false };
      }
    }

    tracker.submissions.set(oracleId, {
      oracleId,
      publicKey,
      seed: randomness.seed,
      proof: randomness.proof,
      timestamp: Date.now(),
      commitmentHash,
    });

    if (tracker.submissions.size >= tracker.threshold) {
      const consensusThreshold = this.oracleRegistry.getConsensusThreshold();
      const submissions = Array.from(tracker.submissions.values());
      
      // Check if consensus is reached
      const consensusCheck = this.checkConsensusFromSubmissions(submissions, consensusThreshold);
      
      if (!consensusCheck.consensusReached) {
        this.logger.warn({
          message: 'Consensus not reached despite meeting threshold',
          raffleId,
          requestId,
          submissions: tracker.submissions.size,
          threshold: tracker.threshold,
          consensusThreshold,
          seedGroups: consensusCheck.seedGroups,
        });

        // Build per-oracle hash and timestamp maps from tracker submissions.
        const submittedValueHashes: Record<string, string> = {};
        const oracleTimestamps: Record<string, number> = {};
        for (const sub of Array.from(tracker.submissions.values())) {
          submittedValueHashes[sub.oracleId] = this.hashSeed(sub.seed);
          oracleTimestamps[sub.oracleId] = sub.timestamp;
        }

        const largestGroupHash =
          Object.entries(consensusCheck.seedGroups).reduce<[string, number] | null>(
            (best, [hash, count]) =>
              best === null || count > best[1] ? [hash, count] : best,
            null,
          )?.[0] ?? null;

        void this.auditLog.recordDivergence({
          requestId,
          raffleId,
          submittedValueHashes,
          oracleTimestamps,
          seedGroups: consensusCheck.seedGroups,
          largestGroupHash,
          totalResponses: tracker.submissions.size,
          consensusThreshold,
          detectedAt: new Date().toISOString(),
        });

        this.metrics.recordDivergence(Object.keys(consensusCheck.seedGroups).length);

        return { ready: false };
      }

      // Clear consensus timeout since we reached consensus
      if (tracker.consensusTimeout) {
        clearTimeout(tracker.consensusTimeout);
        tracker.consensusTimeout = undefined;
      }

      tracker.completed = true;

      const aggregated = this.aggregateTrackerWithConsensus(tracker, consensusCheck.consensusSeedHash!);

      this.logger.log({
        message: 'Consensus reached for raffle draw',
        raffleId,
        requestId,
        consensusSize: consensusCheck.consensusGroupSize,
        consensusThreshold,
        seedHash: consensusCheck.consensusSeedHash,
      });

      return {
        ready: true,
        aggregated,
      };
    }

    return { ready: false };
  }

  // ===============================
  // 🔹 CONSENSUS VALIDATION
  // ===============================
  
  /**
   * Check if consensus is reached among oracle results.
   * Consensus means at least `consensusThreshold` oracles agree on the same seed.
   */
  private checkConsensus(
    results: Array<{ id: string; result: RandomnessResult }>,
    consensusThreshold: number,
  ): {
    consensusReached: boolean;
    consensusGroup?: Array<{ id: string; result: RandomnessResult }>;
    consensusSeedHash?: string;
    seedGroups: Record<string, number>;
    largestGroupSize: number;
  } {
    // Group results by seed hash
    const seedGroups = new Map<string, Array<{ id: string; result: RandomnessResult }>>();
    
    for (const result of results) {
      const seedHash = this.hashSeed(result.result.seed);
      const group = seedGroups.get(seedHash) || [];
      group.push(result);
      seedGroups.set(seedHash, group);
    }

    // Find the largest group
    let largestGroup: Array<{ id: string; result: RandomnessResult }> | undefined;
    let largestGroupSeedHash: string | undefined;
    let largestGroupSize = 0;

    for (const [seedHash, group] of seedGroups.entries()) {
      if (group.length > largestGroupSize) {
        largestGroupSize = group.length;
        largestGroup = group;
        largestGroupSeedHash = seedHash;
      }
    }

    // Convert seed groups to record for logging
    const seedGroupsRecord: Record<string, number> = {};
    for (const [hash, group] of seedGroups.entries()) {
      seedGroupsRecord[hash] = group.length;
    }

    const consensusReached = largestGroupSize >= consensusThreshold;

    return {
      consensusReached,
      consensusGroup: consensusReached ? largestGroup : undefined,
      consensusSeedHash: consensusReached ? largestGroupSeedHash : undefined,
      seedGroups: seedGroupsRecord,
      largestGroupSize,
    };
  }

  /**
   * Check consensus from submissions (used in recordSubmission).
   */
  private checkConsensusFromSubmissions(
    submissions: OracleSubmission[],
    consensusThreshold: number,
  ): {
    consensusReached: boolean;
    consensusSeedHash?: string;
    seedGroups: Record<string, number>;
    consensusGroupSize: number;
  } {
    const seedGroups = new Map<string, OracleSubmission[]>();
    
    for (const submission of submissions) {
      const seedHash = this.hashSeed(submission.seed);
      const group = seedGroups.get(seedHash) || [];
      group.push(submission);
      seedGroups.set(seedHash, group);
    }

    let largestGroupSeedHash: string | undefined;
    let largestGroupSize = 0;

    for (const [seedHash, group] of seedGroups.entries()) {
      if (group.length > largestGroupSize) {
        largestGroupSize = group.length;
        largestGroupSeedHash = seedHash;
      }
    }

    const seedGroupsRecord: Record<string, number> = {};
    for (const [hash, group] of seedGroups.entries()) {
      seedGroupsRecord[hash] = group.length;
    }

    return {
      consensusReached: largestGroupSize >= consensusThreshold,
      consensusSeedHash: largestGroupSeedHash,
      seedGroups: seedGroupsRecord,
      consensusGroupSize: largestGroupSize,
    };
  }

  /**
   * Log warning when consensus timeout is reached without achieving consensus.
   */
  private checkConsensusTimeout(tracker: SubmissionTracker): void {
    if (tracker.completed) {
      return; // Already completed
    }

    const consensusThreshold = this.oracleRegistry.getConsensusThreshold();
    const submissions = Array.from(tracker.submissions.values());
    const elapsed = Date.now() - (tracker.consensusStartTime || 0);

    if (submissions.length === 0) {
      this.logger.warn({
        message: 'Consensus timeout: no submissions received',
        raffleId: tracker.raffleId,
        requestId: tracker.requestId,
        timeoutMs: this.consensusTimeoutMs,
        elapsedMs: elapsed,
      });
      return;
    }

    const consensusCheck = this.checkConsensusFromSubmissions(submissions, consensusThreshold);

    this.logger.warn({
      message: 'Consensus timeout: threshold not met within timeout period',
      raffleId: tracker.raffleId,
      requestId: tracker.requestId,
      submissions: submissions.length,
      threshold: tracker.threshold,
      consensusThreshold,
      consensusReached: consensusCheck.consensusReached,
      seedGroups: consensusCheck.seedGroups,
      timeoutMs: this.consensusTimeoutMs,
      elapsedMs: elapsed,
    });
  }

  /**
   * Hash a seed for consensus comparison.
   */
  private hashSeed(seed: string): string {
    return crypto.createHash('sha256').update(seed).digest('hex');
  }

  // ===============================
  // 🔹 AGGREGATION
  // ===============================
  private aggregateTracker(tracker: SubmissionTracker): AggregatedRandomness {
    const seeds = Array.from(tracker.submissions.values())
      .map(s => s.seed)
      .sort();

    const proofs = Array.from(tracker.submissions.values())
      .map(s => s.proof)
      .sort();

    return {
      seed: this.xorSeeds(seeds),
      proof: this.combineProofs(proofs),
      submittedBy: Array.from(tracker.submissions.keys()).sort(),
    };
  }

  private aggregateTrackerWithConsensus(
    tracker: SubmissionTracker,
    seedHash: string,
  ): AggregatedRandomness {
    const seeds = Array.from(tracker.submissions.values())
      .map(s => s.seed)
      .sort();

    const proofs = Array.from(tracker.submissions.values())
      .map(s => s.proof)
      .sort();

    return {
      seed: this.xorSeeds(seeds),
      proof: this.combineProofs(proofs),
      submittedBy: Array.from(tracker.submissions.keys()).sort(),
      consensusReached: true,
      seedHash,
    };
  }

  private xorSeeds(seeds: string[]): string {
    if (!seeds.length) return Buffer.alloc(32).toString('hex');

    let result = Buffer.from(seeds[0], 'hex');

    for (let i = 1; i < seeds.length; i++) {
      const buf = Buffer.from(seeds[i], 'hex');
      for (let j = 0; j < Math.min(result.length, buf.length); j++) {
        result[j] ^= buf[j];
      }
    }

    return result.toString('hex');
  }

  private combineProofs(proofs: string[]): string {
    if (!proofs.length) return '';
    if (proofs.length === 1) return proofs[0];

    return crypto
      .createHash('sha512')
      .update(Buffer.concat(proofs.map(p => Buffer.from(p, 'hex'))))
      .digest('hex');
  }

  private getKey(raffleId: number, requestId: string) {
    return `${raffleId}:${requestId}`;
  }
}