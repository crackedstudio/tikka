import { PrngService } from '../src/randomness/prng.service';

describe('PrngService', () => {
  let service: PrngService;

  beforeEach(() => {
    service = new PrngService();
  });

  // ── Output shape ──────────────────────────────────────────────────────────

  describe('output format', () => {
    it('should return a 64-char hex seed (BytesN<32>)', () => {
      const { seed } = service.compute('req-abc');
      expect(seed).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should return a 128-char hex proof (BytesN<64>)', () => {
      const { proof } = service.compute('req-abc');
      expect(proof).toMatch(/^[0-9a-f]{128}$/);
    });
  });

  // ── Determinism ───────────────────────────────────────────────────────────

  describe('determinism', () => {
    it('should produce identical seed for the same requestId', () => {
      const r1 = service.compute('req-deterministic');
      const r2 = service.compute('req-deterministic');
      expect(r1.seed).toBe(r2.seed);
    });

    it('should produce identical proof for the same requestId', () => {
      const r1 = service.compute('req-deterministic');
      const r2 = service.compute('req-deterministic');
      expect(r1.proof).toBe(r2.proof);
    });

    it('should produce identical results with the same requestId + raffleId', () => {
      const r1 = service.compute('req-with-raffle', 42);
      const r2 = service.compute('req-with-raffle', 42);
      expect(r1.seed).toBe(r2.seed);
      expect(r1.proof).toBe(r2.proof);
    });
  });

  // ── Uniqueness ────────────────────────────────────────────────────────────

  describe('uniqueness', () => {
    it('should produce different seeds for different requestIds', () => {
      const { seed: s1 } = service.compute('req-001');
      const { seed: s2 } = service.compute('req-002');
      expect(s1).not.toBe(s2);
    });

    it('should produce different proofs for different requestIds', () => {
      const { proof: p1 } = service.compute('req-001');
      const { proof: p2 } = service.compute('req-002');
      expect(p1).not.toBe(p2);
    });

    it('should produce different seeds when raffleId is included vs omitted', () => {
      const { seed: withoutRaffle } = service.compute('req-same');
      const { seed: withRaffle } = service.compute('req-same', 0);
      expect(withoutRaffle).not.toBe(withRaffle);
    });

    it('should produce different seeds for the same requestId with different raffleIds', () => {
      const { seed: s1 } = service.compute('req-same', 1);
      const { seed: s2 } = service.compute('req-same', 2);
      expect(s1).not.toBe(s2);
    });
  });

  // ── Proof independence ────────────────────────────────────────────────────

  describe('proof independence from raffleId', () => {
    it('should produce the same proof regardless of raffleId (proof derives only from requestId)', () => {
      const { proof: p1 } = service.compute('req-proof-test');
      const { proof: p2 } = service.compute('req-proof-test', 99);
      // proof mixes only requestId — raffleId is seed-only
      expect(p1).toBe(p2);
    });
  });

  // ── No randomness across calls ────────────────────────────────────────────

  describe('no ambient randomness', () => {
    it('should not be affected by time — results match across multiple fast calls', () => {
      const results = Array.from({ length: 10 }, () => service.compute('req-time-invariant'));
      const seeds = results.map((r) => r.seed);
      expect(new Set(seeds).size).toBe(1); // all identical
    });
  });
});
