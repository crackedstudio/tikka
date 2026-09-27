import { MultiOracleCoordinatorService } from './multi-oracle-coordinator.service';
import { RandomnessResult } from '../queue/queue.types';
import { OracleLoggerService } from '../logger/oracle-logger';
import * as crypto from 'crypto';

const mockLogger = {
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
} as unknown as OracleLoggerService;
const mockAuditLog = { recordDivergence: jest.fn() };
const mockMetrics = { recordDivergence: jest.fn() };
const mockAlerting = { fire: jest.fn() };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A 32-byte seed (64 hex chars) whose every byte equals `byte`. */
function seedOf(byte: number): string {
  return Buffer.alloc(32, byte).toString('hex');
}

/** SHA-256 hash of a hex seed (same as Service.hashSeed). */
function sha256(hex: string): string {
  return crypto.createHash('sha256').update(hex).digest('hex');
}

/** Reference XOR over a set of equal-length hex seeds (order-independent). */
function xorHex(seeds: string[]): string {
  const out = Buffer.alloc(32);
  for (const s of seeds) {
    const buf = Buffer.from(s, 'hex');
    for (let i = 0; i < out.length; i++) out[i] ^= buf[i];
  }
  return out.toString('hex');
}

/** Build a RemoteOracleResult that represents a peer's response. */
function peerResult(id: string, seed: string, proof = 'p'): { id: string; result: RandomnessResult } {
  return { id, result: { seed, proof } };
}

// ---------------------------------------------------------------------------
// Byzantine fault tolerance test suite
// ---------------------------------------------------------------------------

describe('MultiOracleCoordinatorService - Byzantine Fault Tolerance', () => {
  let service: MultiOracleCoordinatorService;

  const registry = {
    getPeerEndpoints: jest.fn(),
    getLocalOracleId: jest.fn(),
    getThreshold: jest.fn(),
    getConsensusThreshold: jest.fn(),
  };

  const config = {
    get: jest.fn(),
  };

  const SEED_A = seedOf(0xaa);
  const SEED_B = seedOf(0xbb);
  const SEED_C = seedOf(0xcc);
  const SEED_D = seedOf(0xdd);
  const SEED_E = seedOf(0xee);

  const localResultA: RandomnessResult = { seed: SEED_A, proof: 'pA' };

  beforeEach(() => {
    jest.clearAllMocks();
    registry.getLocalOracleId.mockReturnValue('oracle-a');

    config.get.mockImplementation((key: string, defaultValue: number) => {
      if (key === 'ORACLE_CONSENSUS_TIMEOUT_MS') return 30000;
      return defaultValue;
    });

    service = new MultiOracleCoordinatorService(
      mockLogger,
      registry as any,
      config as any,
      mockAuditLog as any,
      mockMetrics as any,
      mockAlerting as any,
    );
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Table-driven test cases — broadcastAndCollect
  // ─────────────────────────────────────────────────────────────────────────

  interface BroadcastTestCase {
    description: string;
    nPeers: number;
    threshold: number;
    consensusThreshold: number;
    /** Seeds for each peer (in id order oracle-b, oracle-c, ...). */
    peerSeeds: string[];
    expectedConsensusReached: boolean;
    expectedFellBack: boolean;
    /** Whether the submission should actually happen (consensusReached & !fellBack). */
    expectSubmit: boolean;
  }

  // The local oracle always has SEED_A.
  const broadcastCases: BroadcastTestCase[] = [
    // ──────────── 2-of-3 scenarios ────────────
    {
      description: '2-of-3 unanimous — all agree on same seed',
      nPeers: 2,
      threshold: 2,
      consensusThreshold: 2,
      peerSeeds: [SEED_A, SEED_A],
      expectedConsensusReached: true,
      expectedFellBack: false,
      expectSubmit: true,
    },
    {
      description: '2-of-3 threshold-met-with-dissent — 2 agree, 1 dissents',
      nPeers: 2,
      threshold: 2,
      consensusThreshold: 2,
      peerSeeds: [SEED_A, SEED_B],
      expectedConsensusReached: true,
      expectedFellBack: false,
      expectSubmit: true,
    },
    {
      description: '2-of-3 threshold-not-met — 3 unique seeds, largest group=1 < 2',
      nPeers: 2,
      threshold: 2,
      consensusThreshold: 2,
      peerSeeds: [SEED_B, SEED_C],
      expectedConsensusReached: false,
      expectedFellBack: true,
      expectSubmit: false,
    },

    // ──────────── 3-of-3 scenarios (unanimous) ────────────
    {
      description: '3-of-3 unanimous — all 3 agree',
      nPeers: 2,
      threshold: 3,
      consensusThreshold: 3,
      peerSeeds: [SEED_A, SEED_A],
      expectedConsensusReached: true,
      expectedFellBack: false,
      expectSubmit: true,
    },
    {
      description: '3-of-3 threshold-not-met — 2 agree but all 3 needed',
      nPeers: 2,
      threshold: 3,
      consensusThreshold: 3,
      peerSeeds: [SEED_A, SEED_B],
      expectedConsensusReached: false,
      expectedFellBack: true,
      expectSubmit: false,
    },
    {
      description: '3-of-3 threshold-not-met — all unique, largest group=1 < 3',
      nPeers: 2,
      threshold: 3,
      consensusThreshold: 3,
      peerSeeds: [SEED_B, SEED_C],
      expectedConsensusReached: false,
      expectedFellBack: true,
      expectSubmit: false,
    },

    // ──────────── 3-of-5 scenarios (threshold=3, consensus=3) ────────────
    {
      description: '3-of-5 unanimous — all 5 agree',
      nPeers: 4,
      threshold: 3,
      consensusThreshold: 3,
      peerSeeds: [SEED_A, SEED_A, SEED_A, SEED_A],
      expectedConsensusReached: true,
      expectedFellBack: false,
      expectSubmit: true,
    },
    {
      description: '3-of-5 threshold-met-with-dissent — 3 agree, 2 dissenters',
      nPeers: 4,
      threshold: 3,
      consensusThreshold: 3,
      peerSeeds: [SEED_A, SEED_A, SEED_B, SEED_C],
      expectedConsensusReached: true,
      expectedFellBack: false,
      expectSubmit: true,
    },
    {
      description: '3-of-5 threshold-not-met — 2 agree, 3 dissenters, largest group=2 < 3',
      nPeers: 4,
      threshold: 3,
      consensusThreshold: 3,
      peerSeeds: [SEED_A, SEED_B, SEED_C, SEED_D],
      expectedConsensusReached: false,
      expectedFellBack: true,
      expectSubmit: false,
    },
    {
      description: '3-of-5 threshold-not-met — all unique, largest group=1 < 3',
      nPeers: 4,
      threshold: 3,
      consensusThreshold: 3,
      peerSeeds: [SEED_B, SEED_C, SEED_D, SEED_E],
      expectedConsensusReached: false,
      expectedFellBack: true,
      expectSubmit: false,
    },

    // ──────────── 4-of-7 scenarios ────────────
    {
      description: '4-of-7 threshold-met-with-dissent — 4 agree, 3 dissent',
      nPeers: 6,
      threshold: 4,
      consensusThreshold: 4,
      peerSeeds: [SEED_A, SEED_A, SEED_A, SEED_B, SEED_C, SEED_D],
      expectedConsensusReached: true,
      expectedFellBack: false,
      expectSubmit: true,
    },
    {
      description: '4-of-7 threshold-not-met — only 3 agree of 4 needed',
      nPeers: 6,
      threshold: 4,
      consensusThreshold: 4,
      peerSeeds: [SEED_A, SEED_A, SEED_B, SEED_C, SEED_D, SEED_E],
      expectedConsensusReached: false,
      expectedFellBack: true,
      expectSubmit: false,
    },
  ];

  // ─────────────────────────────────────────────────────────────────────────
  // Broadcast-based tests (broadcastAndCollect)
  // ─────────────────────────────────────────────────────────────────────────

  describe.each(broadcastCases)(
    'broadcastAndCollect — $description',
    ({
      nPeers,
      threshold,
      consensusThreshold,
      peerSeeds,
      expectedConsensusReached,
      expectedFellBack,
      expectSubmit,
    }) => {
      beforeEach(() => {
        const peerEndpoints = Array.from({ length: nPeers }, (_, i) => ({
          id: String.fromCharCode(98 + i), // 'b', 'c', 'd', ...
          url: `http://peer${i}`,
          publicKey: `pk-${String.fromCharCode(98 + i)}`,
        }));

        const peerResults = peerSeeds.map((seed, i) => ({
          id: String.fromCharCode(98 + i),
          result: { seed, proof: `p${i}` },
        }));

        registry.getPeerEndpoints.mockReturnValue(peerEndpoints);
        registry.getThreshold.mockReturnValue(threshold);
        registry.getConsensusThreshold.mockReturnValue(consensusThreshold);

        jest.spyOn(service as any, 'fetchFromPeers').mockResolvedValue(peerResults);
      });

      it(`consensusReached=${expectedConsensusReached}, fellBack=${expectedFellBack}, submit=${expectSubmit}`, async () => {
        const result = await service.broadcastAndCollect('req1', localResultA);

        expect(result.consensusReached).toBe(expectedConsensusReached);
        expect(result.fellBack).toBe(expectedFellBack);

        // Core assertion: when consensus fails, the method returns fellBack and
        // the caller MUST NOT submit — the aggregated value is a byzantine-resistant
        // fallback for audit, never a single-oracle value.
        if (expectSubmit) {
          expect(result.consensusReached).toBe(true);
          expect(result.fellBack).toBe(false);
        } else {
          // Consensus not reached — fellBack is true, aggregated uses ALL oracles
          // (never falls back to a single oracle's value)
          expect(result.fellBack).toBe(true);
        }
      });
    },
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Non-revealing node — tracker-based (recordSubmission)
  // ─────────────────────────────────────────────────────────────────────────

  describe('non-revealing node (tracker-based)', () => {
    const agreedSeed = SEED_A;
    const differentSeed = SEED_B;

    it('does not mark ready when a tracked node never reveals (2-of-3, one missing)', () => {
      registry.getThreshold.mockReturnValue(2);
      registry.getConsensusThreshold.mockReturnValue(2);

      service.startTracking(1, 'req1');

      // Two oracles reveal; one "non-revealing" node is absent.
      const r1 = service.recordSubmission(1, 'req1', 'oracle-a', 'pk-a', {
        seed: agreedSeed,
        proof: 'p1',
      });
      expect(r1.ready).toBe(false);

      const r2 = service.recordSubmission(1, 'req1', 'oracle-b', 'pk-b', {
        seed: agreedSeed,
        proof: 'p2',
      });
      // threshold=2 met, consensus (2-of-2) reached — ready
      expect(r2.ready).toBe(true);
      expect(r2.aggregated?.consensusReached).toBe(true);
    });

    it('never marks ready when non-revealing node means threshold is not met', () => {
      registry.getThreshold.mockReturnValue(3);
      registry.getConsensusThreshold.mockReturnValue(2);

      service.startTracking(2, 'req2');

      // Only 2 of 3 submit; the 3rd is non-revealing
      service.recordSubmission(2, 'req2', 'oracle-a', 'pk-a', {
        seed: agreedSeed,
        proof: 'p1',
      });
      const r2 = service.recordSubmission(2, 'req2', 'oracle-b', 'pk-b', {
        seed: agreedSeed,
        proof: 'p2',
      });

      // threshold=3 not met yet, so not ready
      expect(r2.ready).toBe(false);

      // tracker still pending
      const pending = service.getPendingTrackers();
      expect(pending.length).toBeGreaterThanOrEqual(1);
      const t = pending.find(p => p.raffleId === 2 && p.requestId === 'req2');
      expect(t).toBeDefined();
      expect(t!.submissions).toBe(2);
      expect(t!.threshold).toBe(3);
    });

    it('still reaches consensus when non-revealing node is below threshold count', () => {
      registry.getThreshold.mockReturnValue(2);
      registry.getConsensusThreshold.mockReturnValue(2);

      service.startTracking(3, 'req3');

      // Only the local oracle submits — this alone doesn't meet threshold
      const r1 = service.recordSubmission(3, 'req3', 'oracle-a', 'pk-a', {
        seed: agreedSeed,
        proof: 'p1',
      });
      expect(r1.ready).toBe(false);

      // Second oracle reveals and meets threshold
      const r2 = service.recordSubmission(3, 'req3', 'oracle-b', 'pk-b', {
        seed: agreedSeed,
        proof: 'p2',
      });
      expect(r2.ready).toBe(true);
      expect(r2.aggregated?.consensusReached).toBe(true);
      expect(r2.aggregated?.submittedBy).toContain('oracle-a');
      expect(r2.aggregated?.submittedBy).toContain('oracle-b');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Equivocating node (commit-reveal mismatch)
  // ─────────────────────────────────────────────────────────────────────────

  describe('equivocating node (commit-reveal mismatch)', () => {
    const honestSeed = SEED_A;
    const equivocatedSeed = SEED_B;

    it('excludes an oracle whose reveal does not match its commitment', () => {
      registry.getThreshold.mockReturnValue(2);
      registry.getConsensusThreshold.mockReturnValue(2);

      service.startTracking(1, 'req1');

      // Oracle-a commits to hash(SEED_A)
      const commitmentHash = sha256(honestSeed);

      // Oracle-a reveals SEED_A — matches its commitment -> accepted
      const r1 = service.recordSubmission(1, 'req1', 'oracle-a', 'pk-a', {
        seed: honestSeed,
        proof: 'p1',
      }, commitmentHash);
      expect(r1.ready).toBe(false); // not enough submissions yet

      // Oracle-b reveals with a commitment mismatch (committed to SEED_B but reveals SEED_A)
      const badHash = sha256(SEED_B);
      const r2 = service.recordSubmission(1, 'req1', 'oracle-b', 'pk-b', {
        seed: honestSeed, // reveals a different seed than committed
        proof: 'p2',
      }, badHash);
      // Should be rejected
      expect(r2.ready).toBe(false);

      // Verify alert was fired
      expect(mockAlerting.fire).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'critical',
          dedupKey: expect.stringContaining('commit-reveal-mismatch:oracle-b'),
        }),
      );

      // Oracle-b should NOT be in the tracker
      const tracker = (service as any).submissionTrackers.get('1:req1');
      expect(tracker).toBeDefined();
      expect(tracker.submissions.has('oracle-b')).toBe(false);
      expect(tracker.submissions.has('oracle-a')).toBe(true);
    });

    it('accepts a valid reveal that matches its commitment', () => {
      registry.getThreshold.mockReturnValue(2);
      registry.getConsensusThreshold.mockReturnValue(2);

      service.startTracking(2, 'req2');

      const hashA = sha256(honestSeed);
      const hashB = sha256(honestSeed); // same seed for both

      // Both oracles reveal honestly
      service.recordSubmission(2, 'req2', 'oracle-a', 'pk-a', {
        seed: honestSeed,
        proof: 'p1',
      }, hashA);

      const r2 = service.recordSubmission(2, 'req2', 'oracle-b', 'pk-b', {
        seed: honestSeed,
        proof: 'p2',
      }, hashB);

      expect(r2.ready).toBe(true);
      expect(r2.aggregated?.consensusReached).toBe(true);
      // No alert was fired
      expect(mockAlerting.fire).not.toHaveBeenCalled();
    });

    it('does not exclude an oracle when no commitment hash is provided', () => {
      registry.getThreshold.mockReturnValue(2);
      registry.getConsensusThreshold.mockReturnValue(2);

      service.startTracking(3, 'req3');

      // No commitment hash — old path, no equivocation check
      service.recordSubmission(3, 'req3', 'oracle-a', 'pk-a', {
        seed: honestSeed,
        proof: 'p1',
      });

      const r2 = service.recordSubmission(3, 'req3', 'oracle-b', 'pk-b', {
        seed: SEED_B,
        proof: 'p2',
      });

      // Both submitted, no commitment to verify — consensus is on SEED_A? No,
      // they differ. threshold=2 met but consensusThreshold=2 requires 2 agreement.
      // Since they disagree, ready=false.
      expect(r2.ready).toBe(false);
      expect(mockAlerting.fire).not.toHaveBeenCalled();
    });

    it('warns and excludes multiple equivocators', () => {
      registry.getThreshold.mockReturnValue(4);
      registry.getConsensusThreshold.mockReturnValue(3);

      service.startTracking(4, 'req4');

      const honestCommitment = sha256(honestSeed);

      // Two honest oracles
      service.recordSubmission(4, 'req4', 'oracle-a', 'pk-a', {
        seed: honestSeed, proof: 'p1',
      }, honestCommitment);

      service.recordSubmission(4, 'req4', 'oracle-b', 'pk-b', {
        seed: honestSeed, proof: 'p2',
      }, honestCommitment);

      // Two equivocating oracles (committed to different hash)
      service.recordSubmission(4, 'req4', 'oracle-c', 'pk-c', {
        seed: SEED_C, proof: 'p3',
      }, sha256(SEED_D));

      service.recordSubmission(4, 'req4', 'oracle-d', 'pk-d', {
        seed: SEED_E, proof: 'p4',
      }, sha256(SEED_A));

      // Both equivocated — they should be excluded
      const tracker = (service as any).submissionTrackers.get('4:req4');
      expect(tracker.submissions.has('oracle-c')).toBe(false);
      expect(tracker.submissions.has('oracle-d')).toBe(false);
      expect(tracker.submissions.has('oracle-a')).toBe(true);
      expect(tracker.submissions.has('oracle-b')).toBe(true);

      // Two alerts should have been fired
      expect(mockAlerting.fire).toHaveBeenCalledTimes(2);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Core invariant: failed consensus never degrades to a single oracle
  // ─────────────────────────────────────────────────────────────────────────

  describe('invariant: no fallback to single oracle on consensus failure', () => {
    it('broadcastAndCollect aggregates all oracles (not just local) when consensus fails', async () => {
      registry.getPeerEndpoints.mockReturnValue([
        { id: 'oracle-b', url: 'http://peer1', publicKey: 'pk-b' },
        { id: 'oracle-c', url: 'http://peer2', publicKey: 'pk-c' },
      ]);
      registry.getThreshold.mockReturnValue(3);
      registry.getConsensusThreshold.mockReturnValue(2);

      // All 3 different seeds – consensus fails (largest group=1 < 2)
      jest.spyOn(service as any, 'fetchFromPeers').mockResolvedValue([
        { id: 'oracle-b', result: { seed: SEED_B, proof: 'pb' } },
        { id: 'oracle-c', result: { seed: SEED_C, proof: 'pc' } },
      ]);

      const result = await service.broadcastAndCollect('req1', localResultA);

      expect(result.fellBack).toBe(true);
      expect(result.consensusReached).toBe(false);

      // The aggregated value uses ALL oracles (3), not just the local one
      const allSeeds = [SEED_A, SEED_B, SEED_C];
      expect(result.aggregated.seed).toBe(xorHex(allSeeds));
      expect(result.usedOracles.length).toBe(3);
      expect(result.usedOracles).toContain('oracle-a');
      expect(result.usedOracles).toContain('oracle-b');
      expect(result.usedOracles).toContain('oracle-c');
    });

    it('broadcastAndCollect uses plurality group when at least 2 agree but consensus threshold not met', async () => {
      registry.getPeerEndpoints.mockReturnValue([
        { id: 'oracle-b', url: 'http://peer1', publicKey: 'pk-b' },
        { id: 'oracle-c', url: 'http://peer2', publicKey: 'pk-c' },
        { id: 'oracle-d', url: 'http://peer3', publicKey: 'pk-d' },
      ]);
      registry.getThreshold.mockReturnValue(3);
      registry.getConsensusThreshold.mockReturnValue(4); // need 4, have 4

      // 2 agree (a, b), 2 dissent (c, d) — largest group = 2 < 4
      jest.spyOn(service as any, 'fetchFromPeers').mockResolvedValue([
        { id: 'oracle-b', result: { seed: SEED_A, proof: 'pb' } },
        { id: 'oracle-c', result: { seed: SEED_C, proof: 'pc' } },
        { id: 'oracle-d', result: { seed: SEED_D, proof: 'pd' } },
      ]);

      const result = await service.broadcastAndCollect('req1', localResultA);

      expect(result.fellBack).toBe(true);
      expect(result.consensusReached).toBe(false);

      // Plurality group (a, b) has 2 agreeing — aggregate those, not just local
      const pluralitySeed = xorHex([SEED_A, SEED_A]);
      expect(result.aggregated.seed).toBe(pluralitySeed);
    });

    it('recordSubmission returns ready=false when consensus threshold not met', () => {
      registry.getThreshold.mockReturnValue(3);
      registry.getConsensusThreshold.mockReturnValue(3);

      service.startTracking(5, 'req5');

      // 3 submissions, all different
      service.recordSubmission(5, 'req5', 'oracle-a', 'pk-a', {
        seed: SEED_A, proof: 'p1',
      });
      service.recordSubmission(5, 'req5', 'oracle-b', 'pk-b', {
        seed: SEED_B, proof: 'p2',
      });
      const r3 = service.recordSubmission(5, 'req5', 'oracle-c', 'pk-c', {
        seed: SEED_C, proof: 'p3',
      });

      // Threshold met (3) but consensus not (largest group=1 < 3)
      expect(r3.ready).toBe(false);
      expect(r3.aggregated).toBeUndefined();
    });

    it('recordSubmission never falls back when there is disagreement — returns ready=false', () => {
      registry.getThreshold.mockReturnValue(3);
      registry.getConsensusThreshold.mockReturnValue(2);

      service.startTracking(6, 'req6');

      // 3 submissions, 2 agree, 1 dissents — consensus met (2 of 3)
      service.recordSubmission(6, 'req6', 'oracle-a', 'pk-a', {
        seed: SEED_A, proof: 'p1',
      });
      service.recordSubmission(6, 'req6', 'oracle-b', 'pk-b', {
        seed: SEED_A, proof: 'p2',
      });
      const r3 = service.recordSubmission(6, 'req6', 'oracle-c', 'pk-c', {
        seed: SEED_B, proof: 'p3',
      });

      // Consensus reached (2 agree) — ready
      expect(r3.ready).toBe(true);
      expect(r3.aggregated?.consensusReached).toBe(true);
      expect(r3.aggregated?.seed).toBe(xorHex([SEED_A, SEED_A, SEED_B]));
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Insufficient quorum (allResults.length < threshold) still falls back
  // to local, but that's a data-availability problem, not a consensus failure
  // ─────────────────────────────────────────────────────────────────────────

  describe('insufficient quorum falls back to local (data-availability, not consensus)', () => {
    it('falls back to local when fewer than threshold peers respond', async () => {
      registry.getPeerEndpoints.mockReturnValue([
        { id: 'oracle-b', url: 'http://peer1', publicKey: 'pk-b' },
        { id: 'oracle-c', url: 'http://peer2', publicKey: 'pk-c' },
      ]);
      registry.getThreshold.mockReturnValue(3);
      registry.getConsensusThreshold.mockReturnValue(2);

      // Only 1 of 2 peers respond, so total = 2 < 3 threshold
      jest.spyOn(service as any, 'fetchFromPeers').mockResolvedValue([
        { id: 'oracle-b', result: { seed: SEED_B, proof: 'pb' } },
      ]);

      const result = await service.broadcastAndCollect('req1', localResultA);

      expect(result.fellBack).toBe(true);
      expect(result.consensusReached).toBe(false);
      // Only local oracle is used — insufficient data
      expect(result.usedOracles).toEqual(['oracle-a']);
      expect(result.aggregated.seed).toBe(SEED_A);
    });

    it('falls back to local when no peers respond', async () => {
      registry.getPeerEndpoints.mockReturnValue([
        { id: 'oracle-b', url: 'http://peer1', publicKey: 'pk-b' },
      ]);
      registry.getThreshold.mockReturnValue(2);
      registry.getConsensusThreshold.mockReturnValue(1);

      jest.spyOn(service as any, 'fetchFromPeers').mockResolvedValue([]);

      const result = await service.broadcastAndCollect('req1', localResultA);

      expect(result.fellBack).toBe(true);
      expect(result.consensusReached).toBe(false);
      expect(result.usedOracles).toEqual(['oracle-a']);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Divergence audit logging
  // ─────────────────────────────────────────────────────────────────────────

  describe('divergence audit logging', () => {
    it('logs divergence when consensus is not reached (broadcastAndCollect)', async () => {
      registry.getPeerEndpoints.mockReturnValue([
        { id: 'oracle-b', url: 'http://peer1', publicKey: 'pk-b' },
        { id: 'oracle-c', url: 'http://peer2', publicKey: 'pk-c' },
      ]);
      registry.getThreshold.mockReturnValue(3);
      registry.getConsensusThreshold.mockReturnValue(2);

      jest.spyOn(service as any, 'fetchFromPeers').mockResolvedValue([
        { id: 'oracle-b', result: { seed: SEED_B, proof: 'pb' } },
        { id: 'oracle-c', result: { seed: SEED_C, proof: 'pc' } },
      ]);

      await service.broadcastAndCollect('req1', localResultA);

      expect(mockAuditLog.recordDivergence).toHaveBeenCalledTimes(1);
      const args = (mockAuditLog.recordDivergence as jest.Mock).mock.calls[0][0];
      expect(args.requestId).toBe('req1');
      expect(args.totalResponses).toBe(3);
      expect(args.consensusThreshold).toBe(2);
      expect(Object.keys(args.seedGroups).length).toBe(3);
    });

    it('logs divergence when consensus is not reached (recordSubmission)', () => {
      registry.getThreshold.mockReturnValue(3);
      registry.getConsensusThreshold.mockReturnValue(2);

      service.startTracking(7, 'req7');

      service.recordSubmission(7, 'req7', 'oracle-a', 'pk-a', {
        seed: SEED_A, proof: 'p1',
      });
      service.recordSubmission(7, 'req7', 'oracle-b', 'pk-b', {
        seed: SEED_B, proof: 'p2',
      });
      service.recordSubmission(7, 'req7', 'oracle-c', 'pk-c', {
        seed: SEED_C, proof: 'p3',
      });

      // Threshold met, but consensus not (all differ, largest group=1 < 2)
      expect(mockAuditLog.recordDivergence).toHaveBeenCalledTimes(1);
    });

    it('does not log divergence when consensus is reached', async () => {
      registry.getPeerEndpoints.mockReturnValue([
        { id: 'oracle-b', url: 'http://peer1', publicKey: 'pk-b' },
        { id: 'oracle-c', url: 'http://peer2', publicKey: 'pk-c' },
      ]);
      registry.getThreshold.mockReturnValue(2);
      registry.getConsensusThreshold.mockReturnValue(2);

      jest.spyOn(service as any, 'fetchFromPeers').mockResolvedValue([
        { id: 'oracle-b', result: { seed: SEED_A, proof: 'pb' } },
        { id: 'oracle-c', result: { seed: SEED_A, proof: 'pc' } },
      ]);

      await service.broadcastAndCollect('req1', localResultA);

      expect(mockAuditLog.recordDivergence).not.toHaveBeenCalled();
    });
  });
});

describe('MultiOracleCoordinatorService - Byzantine: recordSubmission consensus scenarios', () => {
  let service: MultiOracleCoordinatorService;

  const registry = {
    getPeerEndpoints: jest.fn(),
    getLocalOracleId: jest.fn(),
    getThreshold: jest.fn(),
    getConsensusThreshold: jest.fn(),
  };

  const config = {
    get: jest.fn(),
  };

  const SEED_A = seedOf(0xaa);
  const SEED_B = seedOf(0xbb);
  const SEED_C = seedOf(0xcc);

  beforeEach(() => {
    jest.clearAllMocks();
    registry.getLocalOracleId.mockReturnValue('oracle-a');
    config.get.mockImplementation((key: string, defaultValue: number) => {
      if (key === 'ORACLE_CONSENSUS_TIMEOUT_MS') return 30000;
      return defaultValue;
    });

    service = new MultiOracleCoordinatorService(
      mockLogger,
      registry as any,
      config as any,
      mockAuditLog as any,
      mockMetrics as any,
      mockAlerting as any,
    );
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Table-driven tests for recordSubmission
  // ─────────────────────────────────────────────────────────────────────────

  interface RecordSubmissionCase {
    description: string;
    threshold: number;
    consensusThreshold: number;
    submissions: Array<{ oracleId: string; seed: string }>;
    /** After every submission, whether ready is true. */
    expectedReadyAfterLast: boolean;
    /** Whether consensus was reached. */
    expectedConsensusReached?: boolean;
  }

  const recordCases: RecordSubmissionCase[] = [
    {
      description: 'unanimous — 2-of-3 all agree on same seed',
      threshold: 2,
      consensusThreshold: 2,
      submissions: [
        { oracleId: 'a', seed: SEED_A },
        { oracleId: 'b', seed: SEED_A },
      ],
      expectedReadyAfterLast: true,
      expectedConsensusReached: true,
    },
    {
      description: 'threshold-met-with-dissent — 2-of-3 agree, 1 dissents',
      threshold: 3,
      consensusThreshold: 2,
      submissions: [
        { oracleId: 'a', seed: SEED_A },
        { oracleId: 'b', seed: SEED_A },
        { oracleId: 'c', seed: SEED_B },
      ],
      expectedReadyAfterLast: true,
      expectedConsensusReached: true,
    },
    {
      description: 'threshold-not-met — all differ (2-of-3 consensus not met)',
      threshold: 3,
      consensusThreshold: 2,
      submissions: [
        { oracleId: 'a', seed: SEED_A },
        { oracleId: 'b', seed: SEED_B },
        { oracleId: 'c', seed: SEED_C },
      ],
      expectedReadyAfterLast: false,
    },
    {
      description: 'unanimous — 3-of-3 all agree',
      threshold: 3,
      consensusThreshold: 3,
      submissions: [
        { oracleId: 'a', seed: SEED_A },
        { oracleId: 'b', seed: SEED_A },
        { oracleId: 'c', seed: SEED_A },
      ],
      expectedReadyAfterLast: true,
      expectedConsensusReached: true,
    },
    {
      description: 'threshold-not-met — 2-of-3 agree but need all 3',
      threshold: 3,
      consensusThreshold: 3,
      submissions: [
        { oracleId: 'a', seed: SEED_A },
        { oracleId: 'b', seed: SEED_A },
        { oracleId: 'c', seed: SEED_B },
      ],
      expectedReadyAfterLast: false,
    },
  ];

  describe.each(recordCases)(
    'recordSubmission — $description',
    ({ threshold, consensusThreshold, submissions, expectedReadyAfterLast, expectedConsensusReached }) => {
      beforeEach(() => {
        registry.getThreshold.mockReturnValue(threshold);
        registry.getConsensusThreshold.mockReturnValue(consensusThreshold);
      });

      it(`ready=${expectedReadyAfterLast}`, () => {
        service.startTracking(1, 'req1');

        let lastResult: ReturnType<typeof service.recordSubmission> = { ready: false };

        for (const sub of submissions) {
          lastResult = service.recordSubmission(1, 'req1', sub.oracleId, `pk-${sub.oracleId}`, {
            seed: sub.seed,
            proof: `p${sub.oracleId}`,
          });
        }

        expect(lastResult.ready).toBe(expectedReadyAfterLast);
        if (expectedConsensusReached !== undefined) {
          if (expectedReadyAfterLast) {
            expect(lastResult.aggregated?.consensusReached).toBe(expectedConsensusReached);
          } else {
            expect(lastResult.aggregated).toBeUndefined();
          }
        }

        // Never falls back to a single oracle's submission on consensus failure
        if (!expectedReadyAfterLast && threshold <= submissions.length) {
          // threshold was met but consensus wasn't — refuse to submit
          expect(lastResult.aggregated).toBeUndefined();
        }
      });
    },
  );
});