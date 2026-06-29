import { OracleLoggerService } from '../logger/oracle-logger';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OracleRegistryService } from './oracle-registry.service';
import {
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
  

  private readonly submissionTrackers: Map<string, SubmissionTracker> = new Map();
  private readonly SUBMISSION_TIMEOUT_MS = 5 * 60 * 1000;
  private readonly multiTimeoutMs: number;

  constructor(
    private readonly logger: OracleLoggerService,
    private readonly oracleRegistry: OracleRegistryService,
    private readonly configService: ConfigService,
  ) {
    this.multiTimeoutMs =
      this.configService.get<number>('ORACLE_MULTI_TIMEOUT_MS') ?? 10_000;
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
  }> {
    const peers = this.oracleRegistry.getPeerEndpoints();
    const localOracleId = this.oracleRegistry.getLocalOracleId();
    const threshold = this.oracleRegistry.getThreshold();

    if (!peers.length) {
      return {
        aggregated: localResult,
        usedOracles: [localOracleId],
        fellBack: true,
      };
    }

    const peerResults = await this.fetchFromPeers(requestId, peers);

    const allResults = [
      { id: localOracleId, result: localResult },
      ...peerResults,
    ].sort((a, b) => a.id.localeCompare(b.id));

    // ❗ insufficient quorum
    if (allResults.length < threshold) {
      return {
        aggregated: localResult,
        usedOracles: [localOracleId],
        fellBack: true,
      };
    }

    // deterministic selection
    const selected = allResults.slice(0, threshold);

    const aggregatedSeed = this.xorSeeds(selected.map(r => r.result.seed));
    const aggregatedProof = this.combineProofs(selected.map(r => r.result.proof));

    return {
      aggregated: { seed: aggregatedSeed, proof: aggregatedProof },
      usedOracles: selected.map(r => r.id),
      fellBack: false,
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

    this.submissionTrackers.set(key, {
      raffleId,
      requestId,
      submissions: new Map(),
      threshold: this.oracleRegistry.getThreshold(),
      completed: false,
    });

    // prevent test memory leaks
    const timer = setTimeout(() => {
      this.submissionTrackers.delete(key);
    }, this.SUBMISSION_TIMEOUT_MS);

    timer.unref();
  }

  isTracked(raffleId: number, requestId: string): boolean {
    return this.submissionTrackers.has(this.getKey(raffleId, requestId));
  }

  recordSubmission(
    raffleId: number,
    requestId: string,
    oracleId: string,
    publicKey: string,
    randomness: RandomnessResult,
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

    tracker.submissions.set(oracleId, {
      oracleId,
      publicKey,
      seed: randomness.seed,
      proof: randomness.proof,
      timestamp: Date.now(),
    });

    if (tracker.submissions.size >= tracker.threshold) {
      tracker.completed = true;

      return {
        ready: true,
        aggregated: this.aggregateTracker(tracker),
      };
    }

    return { ready: false };
  }

  getPendingTrackers() {
    return Array.from(this.submissionTrackers.values())
      .filter(t => !t.completed)
      .map(t => ({
        raffleId: t.raffleId,
        requestId: t.requestId,
        submissions: t.submissions.size,
        threshold: t.threshold,
      }));
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