import { MultiOracleCoordinatorService } from './multi-oracle-coordinator.service';
import { RandomnessResult } from '../queue/queue.types';
import { OracleLoggerService } from '../logger/oracle-logger';

const mockLogger = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } as unknown as OracleLoggerService;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A 32-byte seed (64 hex chars) whose every byte equals `byte`. */
function seedOf(byte: number): string {
  return Buffer.alloc(32, byte).toString('hex');
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

describe('MultiOracleCoordinatorService - Consensus Validation', () => {
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

  const localResult: RandomnessResult = {
    seed: seedOf(0xaa),
    proof: 'p1',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    registry.getLocalOracleId.mockReturnValue('oracle-a');
    config.get.mockImplementation((key: string, defaultValue: number) => {
      if (key === 'ORACLE_CONSENSUS_TIMEOUT_MS') return 30000;
      return defaultValue;
    });

    service = new MultiOracleCoordinatorService(mockLogger, registry as any, config as any);
  });

  // -------------------------------------------------------------------------
  // 2-of-3 Consensus scenarios
  // -------------------------------------------------------------------------

  describe('2-of-3 consensus (majority)', () => {
    beforeEach(() => {
      registry.getPeerEndpoints.mockReturnValue([
        { id: 'oracle-b', url: 'http://peer1', publicKey: 'pk-b' },
        { id: 'oracle-c', url: 'http://peer2', publicKey: 'pk-c' },
      ]);
      registry.getThreshold.mockReturnValue(2);
      registry.getConsensusThreshold.mockReturnValue(2); // Majority of 3
    });

    it('accepts submission when 2 oracles agree on the same seed', async () => {
      const agreedSeed = seedOf(0xaa);
      const differentSeed = seedOf(0xbb);

      jest.spyOn(service as any, 'fetchFromPeers').mockResolvedValue([
        { id: 'oracle-b', result: { seed: agreedSeed, proof: 'pb' } },
        { id: 'oracle-c', result: { seed: differentSeed, proof: 'pc' } },
      ]);

      const result = await service.broadcastAndCollect('req1', {
        seed: agreedSeed,
        proof: 'p1',
      });

      expect(result.fellBack).toBe(false);
      expect(result.consensusReached).toBe(true);
      expect(result.usedOracles).toContain('oracle-a');
      expect(result.usedOracles).toContain('oracle-b');
      expect(result.usedOracles.length).toBeLessThanOrEqual(2);
    });

    it('rejects submission when all 3 oracles provide different seeds', async () => {
      jest.spyOn(service as any, 'fetchFromPeers').mockResolvedValue([
        { id: 'oracle-b', result: { seed: seedOf(0xbb), proof: 'pb' } },
        { id: 'oracle-c', result: { seed: seedOf(0xcc), proof: 'pc' } },
      ]);

      const result = await service.broadcastAndCollect('req1', {
        seed: seedOf(0xaa),
        proof: 'p1',
      });

      expect(result.fellBack).toBe(true);
      expect(result.consensusReached).toBe(false);
      expect(result.usedOracles).toEqual(['oracle-a']);
    });

    it('accepts submission when all 3 oracles agree (unanimous)', async () => {
      const agreedSeed = seedOf(0xaa);

      jest.spyOn(service as any, 'fetchFromPeers').mockResolvedValue([
        { id: 'oracle-b', result: { seed: agreedSeed, proof: 'pb' } },
        { id: 'oracle-c', result: { seed: agreedSeed, proof: 'pc' } },
      ]);

      const result = await service.broadcastAndCollect('req1', {
        seed: agreedSeed,
        proof: 'p1',
      });

      expect(result.fellBack).toBe(false);
      expect(result.consensusReached).toBe(true);
      expect(result.usedOracles.length).toBeGreaterThanOrEqual(2);
    });

    it('prevents a single dishonest oracle from causing submission', async () => {
      const honestSeed = seedOf(0xaa);
      const maliciousSeed = seedOf(0xff);

      jest.spyOn(service as any, 'fetchFromPeers').mockResolvedValue([
        { id: 'oracle-b', result: { seed: honestSeed, proof: 'pb' } },
        { id: 'oracle-c', result: { seed: maliciousSeed, proof: 'pc' } },
      ]);

      const result = await service.broadcastAndCollect('req1', {
        seed: honestSeed,
        proof: 'p1',
      });

      // Should succeed because 2 oracles (a, b) agree
      expect(result.fellBack).toBe(false);
      expect(result.consensusReached).toBe(true);

      // The malicious oracle-c should not be included
      expect(result.usedOracles).not.toContain('oracle-c');
    });
  });

  // -------------------------------------------------------------------------
  // 3-of-3 Consensus scenarios (unanimous)
  // -------------------------------------------------------------------------

  describe('3-of-3 consensus (unanimous)', () => {
    beforeEach(() => {
      registry.getPeerEndpoints.mockReturnValue([
        { id: 'oracle-b', url: 'http://peer1', publicKey: 'pk-b' },
        { id: 'oracle-c', url: 'http://peer2', publicKey: 'pk-c' },
      ]);
      registry.getThreshold.mockReturnValue(3);
      registry.getConsensusThreshold.mockReturnValue(3); // All must agree
    });

    it('accepts submission only when all 3 oracles agree', async () => {
      const agreedSeed = seedOf(0xaa);

      jest.spyOn(service as any, 'fetchFromPeers').mockResolvedValue([
        { id: 'oracle-b', result: { seed: agreedSeed, proof: 'pb' } },
        { id: 'oracle-c', result: { seed: agreedSeed, proof: 'pc' } },
      ]);

      const result = await service.broadcastAndCollect('req1', {
        seed: agreedSeed,
        proof: 'p1',
      });

      expect(result.fellBack).toBe(false);
      expect(result.consensusReached).toBe(true);
      expect(result.usedOracles).toEqual(['oracle-a', 'oracle-b', 'oracle-c']);
    });

    it('rejects submission when only 2 of 3 oracles agree', async () => {
      const agreedSeed = seedOf(0xaa);
      const differentSeed = seedOf(0xbb);

      jest.spyOn(service as any, 'fetchFromPeers').mockResolvedValue([
        { id: 'oracle-b', result: { seed: agreedSeed, proof: 'pb' } },
        { id: 'oracle-c', result: { seed: differentSeed, proof: 'pc' } },
      ]);

      const result = await service.broadcastAndCollect('req1', {
        seed: agreedSeed,
        proof: 'p1',
      });

      expect(result.fellBack).toBe(true);
      expect(result.consensusReached).toBe(false);
      expect(result.usedOracles).toEqual(['oracle-a']);
    });

    it('rejects submission when all 3 oracles provide different seeds', async () => {
      jest.spyOn(service as any, 'fetchFromPeers').mockResolvedValue([
        { id: 'oracle-b', result: { seed: seedOf(0xbb), proof: 'pb' } },
        { id: 'oracle-c', result: { seed: seedOf(0xcc), proof: 'pc' } },
      ]);

      const result = await service.broadcastAndCollect('req1', {
        seed: seedOf(0xaa),
        proof: 'p1',
      });

      expect(result.fellBack).toBe(true);
      expect(result.consensusReached).toBe(false);
      expect(result.usedOracles).toEqual(['oracle-a']);
    });
  });

  // -------------------------------------------------------------------------
  // Failure scenarios
  // -------------------------------------------------------------------------

  describe('failure scenarios', () => {
    it('falls back when peer responses are insufficient for quorum', async () => {
      registry.getPeerEndpoints.mockReturnValue([
        { id: 'oracle-b', url: 'http://peer1', publicKey: 'pk-b' },
        { id: 'oracle-c', url: 'http://peer2', publicKey: 'pk-c' },
      ]);
      registry.getThreshold.mockReturnValue(3);
      registry.getConsensusThreshold.mockReturnValue(2);

      // Only 1 peer responds
      jest.spyOn(service as any, 'fetchFromPeers').mockResolvedValue([
        { id: 'oracle-b', result: { seed: seedOf(0xbb), proof: 'pb' } },
      ]);

      const result = await service.broadcastAndCollect('req1', localResult);

      expect(result.fellBack).toBe(true);
      expect(result.consensusReached).toBe(false);
      expect(result.usedOracles).toEqual(['oracle-a']);
    });

    it('falls back when no peers are available', async () => {
      registry.getPeerEndpoints.mockReturnValue([]);
      registry.getThreshold.mockReturnValue(1);
      registry.getConsensusThreshold.mockReturnValue(1);

      const result = await service.broadcastAndCollect('req1', localResult);

      expect(result.fellBack).toBe(true);
      expect(result.consensusReached).toBe(true); // Single oracle consensus
      expect(result.usedOracles).toEqual(['oracle-a']);
      expect(result.aggregated).toBe(localResult);
    });

    it('handles peer network failures gracefully', async () => {
      registry.getPeerEndpoints.mockReturnValue([
        { id: 'oracle-b', url: 'http://peer1', publicKey: 'pk-b' },
        { id: 'oracle-c', url: 'http://peer2', publicKey: 'pk-c' },
      ]);
      registry.getThreshold.mockReturnValue(2);
      registry.getConsensusThreshold.mockReturnValue(2);

      // All peers fail
      jest.spyOn(service as any, 'fetchFromPeers').mockResolvedValue([]);

      const result = await service.broadcastAndCollect('req1', localResult);

      expect(result.fellBack).toBe(true);
      expect(result.consensusReached).toBe(false);
      expect(result.usedOracles).toEqual(['oracle-a']);
    });
  });

  // -------------------------------------------------------------------------
  // Consensus tracking with recordSubmission
  // -------------------------------------------------------------------------

  describe('recordSubmission with consensus', () => {
    beforeEach(() => {
      registry.getThreshold.mockReturnValue(2);
      registry.getConsensusThreshold.mockReturnValue(2);
    });

    it('marks ready when consensus threshold is met', () => {
      const agreedSeed = seedOf(0xaa);
      service.startTracking(1, 'req1');

      const r1 = service.recordSubmission(1, 'req1', 'oracle-a', 'pk-a', {
        seed: agreedSeed,
        proof: 'p1',
      });
      expect(r1.ready).toBe(false);

      const r2 = service.recordSubmission(1, 'req1', 'oracle-b', 'pk-b', {
        seed: agreedSeed,
        proof: 'p2',
      });
      expect(r2.ready).toBe(true);
      expect(r2.aggregated?.consensusReached).toBe(true);
    });

    it('does not mark ready when consensus threshold is not met', () => {
      service.startTracking(1, 'req1');

      const r1 = service.recordSubmission(1, 'req1', 'oracle-a', 'pk-a', {
        seed: seedOf(0xaa),
        proof: 'p1',
      });
      expect(r1.ready).toBe(false);

      const r2 = service.recordSubmission(1, 'req1', 'oracle-b', 'pk-b', {
        seed: seedOf(0xbb),
        proof: 'p2',
      });
      expect(r2.ready).toBe(false);
    });

    it('requires 3-of-3 agreement when consensus threshold is 3', () => {
      registry.getThreshold.mockReturnValue(3);
      registry.getConsensusThreshold.mockReturnValue(3);
      service.startTracking(1, 'req1');

      const agreedSeed = seedOf(0xaa);

      service.recordSubmission(1, 'req1', 'oracle-a', 'pk-a', {
        seed: agreedSeed,
        proof: 'p1',
      });
      service.recordSubmission(1, 'req1', 'oracle-b', 'pk-b', {
        seed: agreedSeed,
        proof: 'p2',
      });

      const r3 = service.recordSubmission(1, 'req1', 'oracle-c', 'pk-c', {
        seed: agreedSeed,
        proof: 'p3',
      });

      expect(r3.ready).toBe(true);
      expect(r3.aggregated?.consensusReached).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  describe('edge cases', () => {
    it('handles single oracle mode correctly', async () => {
      registry.getPeerEndpoints.mockReturnValue([]);
      registry.getThreshold.mockReturnValue(1);
      registry.getConsensusThreshold.mockReturnValue(1);

      const result = await service.broadcastAndCollect('req1', localResult);

      expect(result.fellBack).toBe(true);
      expect(result.consensusReached).toBe(true);
      expect(result.aggregated).toBe(localResult);
    });

    it('handles deterministic selection when consensus group is larger than threshold', async () => {
      const agreedSeed = seedOf(0xaa);

      registry.getPeerEndpoints.mockReturnValue([
        { id: 'oracle-b', url: 'http://peer1', publicKey: 'pk-b' },
        { id: 'oracle-c', url: 'http://peer2', publicKey: 'pk-c' },
        { id: 'oracle-d', url: 'http://peer3', publicKey: 'pk-d' },
      ]);
      registry.getThreshold.mockReturnValue(2);
      registry.getConsensusThreshold.mockReturnValue(2);

      // All 4 oracles agree
      jest.spyOn(service as any, 'fetchFromPeers').mockResolvedValue([
        { id: 'oracle-b', result: { seed: agreedSeed, proof: 'pb' } },
        { id: 'oracle-c', result: { seed: agreedSeed, proof: 'pc' } },
        { id: 'oracle-d', result: { seed: agreedSeed, proof: 'pd' } },
      ]);

      const result = await service.broadcastAndCollect('req1', {
        seed: agreedSeed,
        proof: 'p1',
      });

      expect(result.fellBack).toBe(false);
      expect(result.consensusReached).toBe(true);
      // Should select exactly threshold (2) oracles deterministically
      expect(result.usedOracles.length).toBe(2);
      // Selection should be deterministic (sorted by ID)
      expect(result.usedOracles).toEqual(['oracle-a', 'oracle-b']);
    });
  });
});
