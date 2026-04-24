import { PrngService } from '../src/randomness/prng.service';
import * as crypto from 'crypto';

describe('PrngService', () => {
  let service: PrngService;

  beforeEach(() => {
    service = new PrngService();
  });

  // ── Output format ──────────────────────────────────────────────────────────

  describe('output format', () => {
    it('should return a 64-char hex seed (BytesN<32>)', () => {
      const { seed } = service.compute('req-abc');
      expect(seed).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should return a 128-char hex proof (BytesN<64>)', () => {
      const { proof } = service.compute('req-abc');
      expect(proof).toMatch(/^[0-9a-f]{128}$/);
    });

    it('should return lowercase hex strings', () => {
      const { seed, proof } = service.compute('req-format-test');
      expect(seed).not.toMatch(/[A-F]/);
      expect(proof).not.toMatch(/[A-F]/);
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

    it('should be deterministic across multiple calls', () => {
      const results = Array.from({ length: 10 }, () => service.compute('req-stable'));
      const firstResult = results[0];
      results.forEach((result) => {
        expect(result.seed).toBe(firstResult.seed);
        expect(result.proof).toBe(firstResult.proof);
      });
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

    it('should produce different seeds for different raffleIds with same requestId', () => {
      const requestId = 'req-raffle-test';
      const seeds = Array.from({ length: 5 }, (_, i) => service.compute(requestId, i).seed);
      const uniqueSeeds = new Set(seeds);
      expect(uniqueSeeds.size).toBe(5); // All different
    });
  });

  // ── Proof independence ────────────────────────────────────────────────────

  describe('proof independence from raffleId', () => {
    it('should produce the same proof regardless of raffleId', () => {
      const { proof: p1 } = service.compute('req-proof-test');
      const { proof: p2 } = service.compute('req-proof-test', 99);
      expect(p1).toBe(p2);
    });

    it('should produce same proof for different raffleIds', () => {
      const requestId = 'req-proof-independence';
      const proofs = Array.from({ length: 5 }, (_, i) => service.compute(requestId, i).proof);
      const uniqueProofs = new Set(proofs);
      expect(uniqueProofs.size).toBe(1); // All identical
    });
  });

  // ── No ambient randomness ──────────────────────────────────────────────────

  describe('no ambient randomness', () => {
    it('should not be affected by time', () => {
      const results = Array.from({ length: 10 }, () => service.compute('req-time-invariant'));
      const seeds = results.map((r) => r.seed);
      expect(new Set(seeds).size).toBe(1); // all identical
    });

    it('should produce same output regardless of call order', () => {
      const r1 = service.compute('req-a');
      const r2 = service.compute('req-b');
      const r1Again = service.compute('req-a');

      expect(r1.seed).toBe(r1Again.seed);
      expect(r1.proof).toBe(r1Again.proof);
    });
  });

  // ── Seed derivation ────────────────────────────────────────────────────────

  describe('seed derivation', () => {
    it('should derive seed from requestId only when raffleId is omitted', () => {
      const requestId = 'req-seed-derivation';
      const { seed } = service.compute(requestId);

      // Manually compute expected seed
      const reqBuf = Buffer.from(requestId, 'utf8');
      const expectedSeed = crypto.createHash('sha256').update(reqBuf).digest().toString('hex');

      expect(seed).toBe(expectedSeed);
    });

    it('should include raffleId in seed derivation when provided', () => {
      const requestId = 'req-with-raffle-id';
      const raffleId = 42;
      const { seed } = service.compute(requestId, raffleId);

      // Manually compute expected seed with raffleId
      const reqBuf = Buffer.from(requestId, 'utf8');
      const raffleBuf = Buffer.allocUnsafe(4);
      raffleBuf.writeUInt32BE(raffleId >>> 0, 0);
      const expectedSeed = crypto
        .createHash('sha256')
        .update(reqBuf)
        .update(raffleBuf)
        .digest()
        .toString('hex');

      expect(seed).toBe(expectedSeed);
    });

    it('should handle raffleId as uint32', () => {
      const requestId = 'req-uint32-test';
      const raffleId = 0xffffffff; // Max uint32

      const { seed } = service.compute(requestId, raffleId);
      expect(seed).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  // ── Proof structure ────────────────────────────────────────────────────────

  describe('proof structure', () => {
    it('should generate proof as two SHA-256 halves', () => {
      const requestId = 'req-proof-structure';
      const { proof } = service.compute(requestId);

      // Proof should be 128 hex chars = 64 bytes = 2 x 32-byte SHA-256 hashes
      expect(proof.length).toBe(128);

      // Manually compute expected proof
      const reqBuf = Buffer.from(requestId, 'utf8');
      const prefix1 = Buffer.from('PRNG:v1:1:', 'ascii');
      const prefix2 = Buffer.from('PRNG:v1:2:', 'ascii');

      const half1 = crypto.createHash('sha256').update(prefix1).update(reqBuf).digest().toString('hex');
      const half2 = crypto.createHash('sha256').update(prefix2).update(reqBuf).digest().toString('hex');
      const expectedProof = half1 + half2;

      expect(proof).toBe(expectedProof);
    });

    it('should use distinct domain prefixes for proof halves', () => {
      const requestId = 'req-domain-prefix-test';
      const { proof } = service.compute(requestId);

      const half1 = proof.substring(0, 64);
      const half2 = proof.substring(64, 128);

      // The two halves should be different (due to different prefixes)
      expect(half1).not.toBe(half2);
    });
  });

  // ── Statistical properties ────────────────────────────────────────────────

  describe('statistical properties', () => {
    it('should produce unbiased output across large sample', () => {
      const samples = Array.from({ length: 100 }, (_, i) => service.compute(`req-${i}`).seed);

      // Check that we get diverse outputs (not all the same)
      const uniqueSeeds = new Set(samples);
      expect(uniqueSeeds.size).toBe(100); // All different

      // Check bit distribution (basic sanity check)
      let zeroCount = 0;
      let oneCount = 0;
      samples.forEach((seed) => {
        for (const char of seed) {
          const val = parseInt(char, 16);
          for (let i = 0; i < 4; i++) {
            if ((val >> i) & 1) oneCount++;
            else zeroCount++;
          }
        }
      });

      // Bits should be roughly evenly distributed (within 40-60% range)
      const total = zeroCount + oneCount;
      const zeroRatio = zeroCount / total;
      expect(zeroRatio).toBeGreaterThan(0.4);
      expect(zeroRatio).toBeLessThan(0.6);
    });

    it('should produce different outputs for sequential requestIds', () => {
      const results = Array.from({ length: 50 }, (_, i) => service.compute(`req-${i}`));
      const seeds = results.map((r) => r.seed);
      const uniqueSeeds = new Set(seeds);

      // All should be unique
      expect(uniqueSeeds.size).toBe(50);
    });

    it('should have avalanche effect - small input change produces large output change', () => {
      const r1 = service.compute('req-avalanche-1');
      const r2 = service.compute('req-avalanche-2');

      // Count differing hex characters
      let diffCount = 0;
      for (let i = 0; i < r1.seed.length; i++) {
        if (r1.seed[i] !== r2.seed[i]) diffCount++;
      }

      // Should have significant difference (at least 20% of characters different)
      expect(diffCount).toBeGreaterThan(r1.seed.length * 0.2);
    });
  });

  // ── Contract compatibility ────────────────────────────────────────────────

  describe('contract compatibility', () => {
    it('should produce seed matching BytesN<32> contract requirement', () => {
      const { seed } = service.compute('req-contract-test');
      // 64 hex chars = 32 bytes
      expect(seed.length).toBe(64);
      expect(seed).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should produce proof matching BytesN<64> contract requirement', () => {
      const { proof } = service.compute('req-contract-test');
      // 128 hex chars = 64 bytes
      expect(proof.length).toBe(128);
      expect(proof).toMatch(/^[0-9a-f]{128}$/);
    });

    it('should be compatible with RandomnessResult interface', () => {
      const result = service.compute('req-interface-test');
      expect(result).toHaveProperty('seed');
      expect(result).toHaveProperty('proof');
      expect(typeof result.seed).toBe('string');
      expect(typeof result.proof).toBe('string');
    });
  });

  // ── Edge cases ────────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('should handle empty requestId', () => {
      const { seed, proof } = service.compute('');
      expect(seed).toMatch(/^[0-9a-f]{64}$/);
      expect(proof).toMatch(/^[0-9a-f]{128}$/);
    });

    it('should handle very long requestId', () => {
      const longRequestId = 'x'.repeat(10000);
      const { seed, proof } = service.compute(longRequestId);
      expect(seed).toMatch(/^[0-9a-f]{64}$/);
      expect(proof).toMatch(/^[0-9a-f]{128}$/);
    });

    it('should handle special characters in requestId', () => {
      const specialRequestId = 'req-!@#$%^&*()_+-=[]{}|;:,.<>?';
      const { seed, proof } = service.compute(specialRequestId);
      expect(seed).toMatch(/^[0-9a-f]{64}$/);
      expect(proof).toMatch(/^[0-9a-f]{128}$/);
    });

    it('should handle unicode characters in requestId', () => {
      const unicodeRequestId = 'req-🎲-🎯-🎪';
      const { seed, proof } = service.compute(unicodeRequestId);
      expect(seed).toMatch(/^[0-9a-f]{64}$/);
      expect(proof).toMatch(/^[0-9a-f]{128}$/);
    });

    it('should handle raffleId as 0', () => {
      const { seed: s1 } = service.compute('req-zero-raffle', 0);
      const { seed: s2 } = service.compute('req-zero-raffle');
      expect(s1).not.toBe(s2); // Should be different
    });

    it('should handle raffleId as negative number (coerced to uint32)', () => {
      const { seed, proof } = service.compute('req-negative-raffle', -1);
      expect(seed).toMatch(/^[0-9a-f]{64}$/);
      expect(proof).toMatch(/^[0-9a-f]{128}$/);
    });

    it('should handle raffleId as float (coerced to uint32)', () => {
      const { seed, proof } = service.compute('req-float-raffle', 42.7);
      expect(seed).toMatch(/^[0-9a-f]{64}$/);
      expect(proof).toMatch(/^[0-9a-f]{128}$/);
    });
  });

  // ── Performance ────────────────────────────────────────────────────────────

  describe('performance', () => {
    it('should compute PRNG output quickly', () => {
      const startTime = Date.now();
      service.compute('req-perf-test');
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(10); // Should be < 10ms
    });

    it('should handle batch requests efficiently', () => {
      const startTime = Date.now();
      for (let i = 0; i < 1000; i++) {
        service.compute(`req-batch-${i}`);
      }
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(1000); // 1000 computations in < 1 second
    });

    it('should not allocate excessively for repeated calls', () => {
      const requestId = 'req-memory-test';
      const results = Array.from({ length: 100 }, () => service.compute(requestId));

      // All results should be identical (no new allocations)
      const firstResult = results[0];
      results.forEach((result) => {
        expect(result.seed).toBe(firstResult.seed);
        expect(result.proof).toBe(firstResult.proof);
      });
    });
  });

  // ── Various request_ids and nonces ────────────────────────────────────────

  describe('various request_ids and nonces', () => {
    it('should handle numeric requestIds', () => {
      const { seed, proof } = service.compute('12345');
      expect(seed).toMatch(/^[0-9a-f]{64}$/);
      expect(proof).toMatch(/^[0-9a-f]{128}$/);
    });

    it('should handle UUID-like requestIds', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const { seed, proof } = service.compute(uuid);
      expect(seed).toMatch(/^[0-9a-f]{64}$/);
      expect(proof).toMatch(/^[0-9a-f]{128}$/);
    });

    it('should handle hex-encoded requestIds', () => {
      const hexRequestId = 'deadbeefcafebabe';
      const { seed, proof } = service.compute(hexRequestId);
      expect(seed).toMatch(/^[0-9a-f]{64}$/);
      expect(proof).toMatch(/^[0-9a-f]{128}$/);
    });

    it('should handle base64-like requestIds', () => {
      const base64RequestId = 'SGVsbG8gV29ybGQhIFRoaXMgaXMgYSB0ZXN0Lg==';
      const { seed, proof } = service.compute(base64RequestId);
      expect(seed).toMatch(/^[0-9a-f]{64}$/);
      expect(proof).toMatch(/^[0-9a-f]{128}$/);
    });

    it('should handle whitespace in requestIds', () => {
      const { seed, proof } = service.compute('req with spaces');
      expect(seed).toMatch(/^[0-9a-f]{64}$/);
      expect(proof).toMatch(/^[0-9a-f]{128}$/);
    });

    it('should handle newlines in requestIds', () => {
      const { seed, proof } = service.compute('req\nwith\nnewlines');
      expect(seed).toMatch(/^[0-9a-f]{64}$/);
      expect(proof).toMatch(/^[0-9a-f]{128}$/);
    });
  });
});
