import { MultiOracleCoordinatorService } from './multi-oracle-coordinator.service';
import { RandomnessResult } from '../queue/queue.types';

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

describe('MultiOracleCoordinatorService (Quorum)', () => {
  let service: MultiOracleCoordinatorService;

  const registry = {
    getPeerEndpoints: jest.fn(),
    getLocalOracleId: jest.fn(),
    getThreshold: jest.fn(),
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
    registry.getLocalOracleId.mockReturnValue('a');

    service = new MultiOracleCoordinatorService(registry as any, config as any);
  });

  // -------------------------------------------------------------------------
  // Quorum success
  // -------------------------------------------------------------------------

  describe('quorum success', () => {
    it('aggregates the local + peer responses when responders meet the threshold', async () => {
      const peerSeed = seedOf(0x11);
      registry.getPeerEndpoints.mockReturnValue([
        { id: 'b', url: 'http://peer1', publicKey: 'x' },
      ]);
      registry.getThreshold.mockReturnValue(2);

      jest
        .spyOn(service as any, 'fetchFromPeers')
        .mockResolvedValue([{ id: 'b', result: { seed: peerSeed, proof: 'p2' } }]);

      const result = await service.broadcastAndCollect('req1', localResult);

      expect(result.fellBack).toBe(false);
      expect(result.usedOracles).toEqual(['a', 'b']);
      // Aggregate is the XOR of the selected seeds.
      expect(result.aggregated.seed).toBe(xorHex([localResult.seed, peerSeed]));
    });

    it('selects exactly `threshold` responders deterministically when more are available', async () => {
      registry.getPeerEndpoints.mockReturnValue([
        { id: 'b', url: 'http://peer1', publicKey: 'x' },
        { id: 'c', url: 'http://peer2', publicKey: 'x' },
      ]);
      registry.getThreshold.mockReturnValue(2);

      jest.spyOn(service as any, 'fetchFromPeers').mockResolvedValue([
        { id: 'c', result: { seed: seedOf(0x22), proof: 'pc' } },
        { id: 'b', result: { seed: seedOf(0x11), proof: 'pb' } },
      ]);

      const result = await service.broadcastAndCollect('req1', localResult);

      // Sorted by id, first 2 of [a, b, c] => a + b. c is dropped.
      expect(result.fellBack).toBe(false);
      expect(result.usedOracles).toEqual(['a', 'b']);
      expect(result.aggregated.seed).toBe(xorHex([localResult.seed, seedOf(0x11)]));
    });
  });

  // -------------------------------------------------------------------------
  // Insufficient quorum
  // -------------------------------------------------------------------------

  describe('insufficient quorum', () => {
    it('falls back to local-only when responders are below the threshold', async () => {
      registry.getPeerEndpoints.mockReturnValue([
        { id: 'b', url: 'http://peer1', publicKey: 'x' },
      ]);
      registry.getThreshold.mockReturnValue(3);

      jest.spyOn(service as any, 'fetchFromPeers').mockResolvedValue([]);

      const result = await service.broadcastAndCollect('req1', localResult);

      expect(result.fellBack).toBe(true);
      expect(result.usedOracles).toEqual(['a']);
      expect(result.aggregated).toBe(localResult);
    });

    it('falls back when no peers are configured (missing peers)', async () => {
      registry.getPeerEndpoints.mockReturnValue([]);
      registry.getThreshold.mockReturnValue(2);

      const fetchSpy = jest.spyOn(service as any, 'fetchFromPeers');

      const result = await service.broadcastAndCollect('req1', localResult);

      expect(result.fellBack).toBe(true);
      expect(result.usedOracles).toEqual(['a']);
      expect(result.aggregated).toBe(localResult);
      // No peers => no network calls attempted.
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Conflicting results
  // -------------------------------------------------------------------------

  describe('conflicting results', () => {
    it('resolves divergent seeds deterministically across repeated runs', async () => {
      registry.getPeerEndpoints.mockReturnValue([
        { id: 'b', url: 'http://peer1', publicKey: 'x' },
        { id: 'c', url: 'http://peer2', publicKey: 'x' },
      ]);
      registry.getThreshold.mockReturnValue(3);

      // Peers return in different orders to prove order-independence.
      jest
        .spyOn(service as any, 'fetchFromPeers')
        .mockResolvedValueOnce([
          { id: 'c', result: { seed: seedOf(0x33), proof: 'pc' } },
          { id: 'b', result: { seed: seedOf(0x22), proof: 'pb' } },
        ])
        .mockResolvedValueOnce([
          { id: 'b', result: { seed: seedOf(0x22), proof: 'pb' } },
          { id: 'c', result: { seed: seedOf(0x33), proof: 'pc' } },
        ]);

      const r1 = await service.broadcastAndCollect('req1', localResult);
      const r2 = await service.broadcastAndCollect('req1', localResult);

      expect(r1.aggregated.seed).toBe(r2.aggregated.seed);
      expect(r1.aggregated.proof).toBe(r2.aggregated.proof);
      // The deterministic aggregate is the XOR of all three divergent seeds.
      expect(r1.aggregated.seed).toBe(
        xorHex([localResult.seed, seedOf(0x22), seedOf(0x33)]),
      );
      expect(r1.usedOracles).toEqual(['a', 'b', 'c']);
    });
  });

  // -------------------------------------------------------------------------
  // Disabled / missing peer
  // -------------------------------------------------------------------------

  describe('disabled peer', () => {
    it('still reaches quorum when a disabled peer is excluded but others suffice', async () => {
      registry.getPeerEndpoints.mockReturnValue([
        { id: 'b', url: 'http://peer1', publicKey: 'x' },
        { id: 'c', url: 'http://peer2', publicKey: 'x' }, // disabled / unreachable
      ]);
      registry.getThreshold.mockReturnValue(2);

      // Only b responds; c is excluded (disabled).
      jest
        .spyOn(service as any, 'fetchFromPeers')
        .mockResolvedValue([{ id: 'b', result: { seed: seedOf(0x11), proof: 'pb' } }]);

      const result = await service.broadcastAndCollect('req1', localResult);

      expect(result.fellBack).toBe(false);
      expect(result.usedOracles).toEqual(['a', 'b']);
      expect(result.usedOracles).not.toContain('c');
    });

    it('falls back when disabling a peer drops responders below the threshold', async () => {
      registry.getPeerEndpoints.mockReturnValue([
        { id: 'b', url: 'http://peer1', publicKey: 'x' },
      ]);
      registry.getThreshold.mockReturnValue(2);

      // The only peer is disabled / unreachable.
      jest.spyOn(service as any, 'fetchFromPeers').mockResolvedValue([]);

      const result = await service.broadcastAndCollect('req1', localResult);

      expect(result.fellBack).toBe(true);
      expect(result.usedOracles).toEqual(['a']);
    });
  });
});
