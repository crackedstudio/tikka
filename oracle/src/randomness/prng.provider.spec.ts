import { Test, TestingModule } from '@nestjs/testing';
import { PrngProvider } from './prng.provider';
import { RandomnessProviderType } from './randomness-provider.interface';

describe('PrngProvider', () => {
  let provider: PrngProvider;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrngProvider],
    }).compile();

    provider = module.get<PrngProvider>(PrngProvider);
  });

  describe('getMetadata', () => {
    it('should return correct provider metadata', () => {
      const metadata = provider.getMetadata();

      expect(metadata.type).toBe(RandomnessProviderType.PRNG);
      expect(metadata.algorithm).toBe('SHA-256-PRNG');
      expect(metadata.isVerifiable).toBe(false);
      expect(metadata.description).toContain('pseudo-random');
    });
  });

  describe('validateRequest', () => {
    it('should validate valid request', () => {
      const input = { requestId: 'test-request-123', raffleId: 42 };
      expect(provider.validateRequest(input)).toBe(true);
    });

    it('should reject request without requestId', () => {
      const input = { requestId: '', raffleId: 42 };
      expect(provider.validateRequest(input)).toBe(false);
    });

    it('should reject request with non-string requestId', () => {
      const input = { requestId: 123 as any, raffleId: 42 };
      expect(provider.validateRequest(input)).toBe(false);
    });

    it('should reject request with negative raffleId', () => {
      const input = { requestId: 'test-request', raffleId: -1 };
      expect(provider.validateRequest(input)).toBe(false);
    });

    it('should accept request without raffleId', () => {
      const input = { requestId: 'test-request' };
      expect(provider.validateRequest(input)).toBe(true);
    });
  });

  describe('generate', () => {
    it('should generate randomness with provider metadata', async () => {
      const requestId = 'test-request-123';
      const raffleId = 42;

      const result = await provider.generate({ requestId, raffleId });

      expect(result.seed).toBeDefined();
      expect(result.proof).toBeDefined();
      expect(result.provider).toBe(RandomnessProviderType.PRNG);
      expect(result.algorithm).toBe('SHA-256-PRNG');
      expect(result.generatedAt).toBeInstanceOf(Date);
    });

    it('should throw on invalid request', async () => {
      await expect(
        provider.generate({ requestId: '', raffleId: 42 }),
      ).rejects.toThrow('Invalid randomness request input');
    });
  });

  describe('compute', () => {
    it('should compute deterministic PRNG output', () => {
      const requestId = 'test-request-123';
      const result = provider.compute(requestId);

      expect(result.seed).toBeDefined();
      expect(result.proof).toBeDefined();
      expect(result.seed).toHaveLength(64); // 32 bytes as hex
      expect(result.proof).toHaveLength(128); // 64 bytes as hex
    });

    it('should be deterministic - same input produces same output', () => {
      const requestId = 'test-request-123';
      const raffleId = 42;

      const result1 = provider.compute(requestId, raffleId);
      const result2 = provider.compute(requestId, raffleId);

      expect(result1.seed).toBe(result2.seed);
      expect(result1.proof).toBe(result2.proof);
    });

    it('should produce different seeds for different requestIds', () => {
      const result1 = provider.compute('request-1');
      const result2 = provider.compute('request-2');

      expect(result1.seed).not.toBe(result2.seed);
      expect(result1.proof).not.toBe(result2.proof);
    });

    it('should produce different seeds for same requestId with different raffleIds', () => {
      const result1 = provider.compute('request-1', 1);
      const result2 = provider.compute('request-1', 2);

      expect(result1.seed).not.toBe(result2.seed);
      // Proof is based only on requestId, so it should be the same
      expect(result1.proof).toBe(result2.proof);
    });

    it('should produce different seeds with and without raffleId', () => {
      const requestId = 'test-request';
      const result1 = provider.compute(requestId);
      const result2 = provider.compute(requestId, 42);

      expect(result1.seed).not.toBe(result2.seed);
      expect(result1.proof).toBe(result2.proof); // Proof doesn't include raffleId
    });
  });

  describe('verifyProof', () => {
    it('should verify valid proof', () => {
      const requestId = 'test-request-123';
      const raffleId = 42;

      const generated = provider.compute(requestId, raffleId);
      const result = provider.verifyProof(null, requestId, generated.proof, raffleId);

      expect(result.valid).toBe(true);
      expect(result.seed).toBe(generated.seed);
      expect(result.error).toBeUndefined();
    });

    it('should reject invalid proof', () => {
      const result = provider.verifyProof(null, 'test-request', 'invalid-proof', 42);

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject proof for wrong requestId', () => {
      const generated = provider.compute('request-1', 42);
      const result = provider.verifyProof(null, 'request-2', generated.proof, 42);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('does not match');
    });

    it('should not require public key', () => {
      const requestId = 'test-request';
      const generated = provider.compute(requestId);
      const result = provider.verifyProof(null, requestId, generated.proof);

      expect(result.valid).toBe(true);
    });
  });

  describe('verify', () => {
    it('should verify valid proof and seed', () => {
      const requestId = 'test-request-123';
      const raffleId = 42;

      const generated = provider.compute(requestId, raffleId);
      const result = provider.verify(
        null,
        requestId,
        generated.proof,
        generated.seed,
        raffleId,
      );

      expect(result).toBe(true);
    });

    it('should reject mismatched seed', () => {
      const requestId = 'test-request-123';
      const generated = provider.compute(requestId);
      const result = provider.verify(null, requestId, generated.proof, 'wrong-seed');

      expect(result).toBe(false);
    });

    it('should reject mismatched proof', () => {
      const requestId = 'test-request-123';
      const generated = provider.compute(requestId);
      const result = provider.verify(null, requestId, 'wrong-proof', generated.seed);

      expect(result).toBe(false);
    });
  });

  describe('determinism and consistency', () => {
    it('should produce consistent output across multiple calls', () => {
      const requestId = 'consistency-test';
      const raffleId = 999;

      const results = Array.from({ length: 10 }, () =>
        provider.compute(requestId, raffleId),
      );

      const firstSeed = results[0].seed;
      const firstProof = results[0].proof;

      results.forEach((result) => {
        expect(result.seed).toBe(firstSeed);
        expect(result.proof).toBe(firstProof);
      });
    });

    it('should produce valid hex strings', () => {
      const result = provider.compute('test-request');

      expect(result.seed).toMatch(/^[0-9a-f]{64}$/);
      expect(result.proof).toMatch(/^[0-9a-f]{128}$/);
    });
  });
});
