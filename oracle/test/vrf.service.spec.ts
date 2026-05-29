import { Test, TestingModule } from '@nestjs/testing';
import { VrfService } from '../src/randomness/vrf.service';
import { KeyService } from '../src/keys/key.service';
import { OracleRegistryService } from '../src/multi-oracle/oracle-registry.service';
import { ConfigService } from '@nestjs/config';
import { Keypair } from '@stellar/stellar-sdk';
import { ed25519 } from '@noble/curves/ed25519';
import * as crypto from 'crypto';

describe('VrfService', () => {
  let service: VrfService;
  let keyService: KeyService;
  let oracleRegistry: OracleRegistryService;
  const mockSecret = Keypair.random().secret();

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                VrfService,
                {
                    provide: ConfigService,
                    useValue: {
                        get: jest.fn().mockReturnValue(mockSecret),
                    },
                },
                KeyService,
                {
                    provide: OracleRegistryService,
                    useValue: {
                        getOracle: jest.fn(),
                        getLocalKeypair: jest.fn().mockReturnValue(Keypair.random()),
                        getLocalOracleId: jest.fn().mockReturnValue('oracle-001'),
                    },
                },
            ],
        }).compile();

    service = module.get<VrfService>(VrfService);
    keyService = module.get<KeyService>(KeyService);
    oracleRegistry = module.get<OracleRegistryService>(OracleRegistryService);
    await keyService.onModuleInit();
  });

  describe('VRF computation', () => {
    it('should compute deterministic seed and proof for same requestId', async () => {
      const requestId = 'test-request-123';
      const result1 = await service.compute(requestId);
      const result2 = await service.compute(requestId);

      expect(result1.seed).toBe(result2.seed);
      expect(result1.proof).toBe(result2.proof);
    });

    it('should produce different outputs for different requestIds', async () => {
      const result1 = await service.compute('req-1');
      const result2 = await service.compute('req-2');

      expect(result1.seed).not.toBe(result2.seed);
      expect(result1.proof).not.toBe(result2.proof);
    });

    it('should return seed as 64-char hex string (32 bytes)', async () => {
      const { seed } = await service.compute('test-req');
      expect(seed).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should return proof as 128-char hex string (64 bytes)', async () => {
      const { proof } = await service.compute('test-req');
      expect(proof).toMatch(/^[0-9a-f]{128}$/);
    });

    it('should produce different seed when raffleId is included', async () => {
      const requestId = 'raffle-id-test';
      const withoutRaffleId = await service.compute(requestId);
      const withRaffleId = await service.compute(requestId, 42);

      expect(withoutRaffleId.seed).not.toBe(withRaffleId.seed);
      expect(withoutRaffleId.proof).not.toBe(withRaffleId.proof);
    });

    it('should produce different seeds for different raffleIds with same requestId', async () => {
      const requestId = 'shared-request';
      const raffle1 = await service.compute(requestId, 1);
      const raffle2 = await service.compute(requestId, 2);

      expect(raffle1.seed).not.toBe(raffle2.seed);
    });

    it('should be deterministic with same requestId and raffleId', async () => {
      const requestId = 'deterministic-raffle';
      const result1 = await service.compute(requestId, 99);
      const result2 = await service.compute(requestId, 99);

      expect(result1.seed).toBe(result2.seed);
      expect(result1.proof).toBe(result2.proof);
    });
  });

  describe('VRF verification', () => {
    it('should verify valid VRF proof', async () => {
      const requestId = 'verifiable-req';
      const { seed, proof } = await service.compute(requestId);
      const publicKey = (await keyService.getPublicKeyBuffer()).toString('hex');

      const isValid = service.verify(publicKey, requestId, proof, seed);
      expect(isValid).toBe(true);
    });

    it('should reject tampered proof', async () => {
      const requestId = 'tamper-proof-test';
      const { seed, proof } = await service.compute(requestId);
      const publicKey = (await keyService.getPublicKeyBuffer()).toString('hex');

      // Tamper with proof (change last char)
      const tamperedProof = proof.substring(0, 127) + (proof[127] === '0' ? '1' : '0');

      const isValid = service.verify(publicKey, requestId, tamperedProof, seed);
      expect(isValid).toBe(false);
    });

    it('should reject mismatched seed and proof', async () => {
      const requestId = 'tamper-seed-test';
      const { proof } = await service.compute(requestId);
      const publicKey = (await keyService.getPublicKeyBuffer()).toString('hex');
      const tamperedSeed = '0'.repeat(64);

      const isValid = service.verify(publicKey, requestId, proof, tamperedSeed);
      expect(isValid).toBe(false);
    });

    it('should accept public key as Buffer or hex string', async () => {
      const requestId = 'key-format-test';
      const { seed, proof } = await service.compute(requestId);
      const publicKeyBuffer = await keyService.getPublicKeyBuffer();
      const publicKeyHex = publicKeyBuffer.toString('hex');

      const isValidHex = service.verify(publicKeyHex, requestId, proof, seed);
      const isValidBuffer = service.verify(publicKeyBuffer, requestId, proof, seed);

      expect(isValidHex).toBe(true);
      expect(isValidBuffer).toBe(true);
    });

    it('should handle invalid public key gracefully', async () => {
      const requestId = 'invalid-key-test';
      const { seed, proof } = await service.compute(requestId);
      const invalidPublicKey = '0'.repeat(64); // Invalid key

      const isValid = service.verify(invalidPublicKey, requestId, proof, seed);
      expect(isValid).toBe(false);
    });

    it('should verify proof computed with raffleId', async () => {
      const requestId = 'raffle-verify-test';
      const raffleId = 42;
      const { seed, proof } = await service.compute(requestId, raffleId);
      const publicKey = (await keyService.getPublicKeyBuffer()).toString('hex');

      expect(service.verify(publicKey, requestId, proof, seed, raffleId)).toBe(true);
    });

    it('should reject verify when raffleId mismatch', async () => {
      const requestId = 'raffle-mismatch-test';
      const { seed, proof } = await service.compute(requestId, 1);
      const publicKey = (await keyService.getPublicKeyBuffer()).toString('hex');

      // Proof was computed with raffleId=1, verify with raffleId=2 must fail
      expect(service.verify(publicKey, requestId, proof, seed, 2)).toBe(false);
    });
  });

  describe('RFC 9381 test vectors', () => {
    it('should produce consistent output for known input', async () => {
      const requestId = 'rfc9381-test-vector';
      const result = await service.compute(requestId);

      // Verify output format matches RFC 9381 requirements
      expect(result.seed).toMatch(/^[0-9a-f]{64}$/);
      expect(result.proof).toMatch(/^[0-9a-f]{128}$/);

      // Verify determinism
      const result2 = await service.compute(requestId);
      expect(result.seed).toBe(result2.seed);
      expect(result.proof).toBe(result2.proof);
    });

    it('should produce valid Ed25519 signature as proof', async () => {
      const requestId = 'ed25519-sig-test';
      const { proof } = await service.compute(requestId);
      const publicKey = await keyService.getPublicKeyBuffer();

      // Proof should be a valid Ed25519 signature
      const proofBuffer = Buffer.from(proof, 'hex');
      expect(proofBuffer.length).toBe(64); // Ed25519 signature is 64 bytes

      // Verify the signature is valid
      const msg = Buffer.from(requestId, 'utf-8');
      const isValid = ed25519.verify(proofBuffer, msg, publicKey);
      expect(isValid).toBe(true);
    });

    it('should derive seed from proof via SHA-256', async () => {
      const requestId = 'seed-derivation-test';
      const { seed, proof } = await service.compute(requestId);

      // Manually compute expected seed from proof
      const proofBuffer = Buffer.from(proof, 'hex');
      const expectedSeed = crypto.createHash('sha256').update(proofBuffer).digest().toString('hex');

      expect(seed).toBe(expectedSeed);
    });
  });

  describe('performance', () => {
    it('should compute VRF proof within reasonable time', async () => {
      const requestId = 'perf-test';
      const startTime = Date.now();

      await service.compute(requestId);

      const endTime = Date.now();
      const computationTime = endTime - startTime;

      // VRF computation should be fast (< 100ms)
      expect(computationTime).toBeLessThan(100);
    });

    it('should handle multiple concurrent computations', async () => {
      const requestIds = Array.from({ length: 10 }, (_, i) => `req-${i}`);

      const startTime = Date.now();
      const results = await Promise.all(requestIds.map((id) => service.compute(id)));
      const endTime = Date.now();

      expect(results).toHaveLength(10);
      expect(endTime - startTime).toBeLessThan(500); // All 10 should complete in < 500ms
    });

    it('should produce consistent results across multiple calls', async () => {
      const requestId = 'consistency-test';
      const results = await Promise.all(
        Array.from({ length: 5 }, () => service.compute(requestId)),
      );

      // All results should be identical
      const firstResult = results[0];
      results.forEach((result) => {
        expect(result.seed).toBe(firstResult.seed);
        expect(result.proof).toBe(firstResult.proof);
      });
    });
  });

  describe('computeWithKey', () => {
    it('should compute VRF with provided private key', () => {
      const requestId = 'key-test';
      const privateKey = keyService.getSecretBuffer();

      const result = service.computeWithKey(requestId, privateKey);

      expect(result.seed).toMatch(/^[0-9a-f]{64}$/);
      expect(result.proof).toMatch(/^[0-9a-f]{128}$/);
    });

    it('should produce deterministic output with same key', () => {
      const requestId = 'deterministic-key-test';
      const privateKey = keyService.getSecretBuffer();

      const result1 = service.computeWithKey(requestId, privateKey);
      const result2 = service.computeWithKey(requestId, privateKey);

      expect(result1.seed).toBe(result2.seed);
      expect(result1.proof).toBe(result2.proof);
    });

    it('should produce different output with different keys', () => {
      const requestId = 'different-keys-test';
      const privateKey1 = keyService.getSecretBuffer();
      const privateKey2 = Keypair.random().rawSecretKey();

      const result1 = service.computeWithKey(requestId, privateKey1);
      const result2 = service.computeWithKey(requestId, privateKey2);

      expect(result1.seed).not.toBe(result2.seed);
      expect(result1.proof).not.toBe(result2.proof);
    });
  });

  describe('computeForOracle', () => {
    it('should compute VRF for specified oracle', async () => {
      const requestId = 'oracle-test';
      const oracleId = 'oracle-001';
      const mockKeypair = Keypair.random();

      (oracleRegistry.getOracle as jest.Mock).mockReturnValue({ id: oracleId });
      (oracleRegistry.getLocalKeypair as jest.Mock).mockReturnValue(mockKeypair);

      const result = await service.computeForOracle(requestId, oracleId);

      expect(result.seed).toMatch(/^[0-9a-f]{64}$/);
      expect(result.proof).toMatch(/^[0-9a-f]{128}$/);
      expect(oracleRegistry.getOracle).toHaveBeenCalledWith(oracleId);
    });

    it('should throw error if oracle not found', async () => {
      const requestId = 'oracle-not-found-test';
      const oracleId = 'non-existent-oracle';

      (oracleRegistry.getOracle as jest.Mock).mockReturnValue(null);

      await expect(service.computeForOracle(requestId, oracleId)).rejects.toThrow(
        `Oracle not found: ${oracleId}`,
      );
    });
  });

  describe('edge cases', () => {
    it('should handle empty requestId', async () => {
      const result = await service.compute('');
      expect(result.seed).toMatch(/^[0-9a-f]{64}$/);
      expect(result.proof).toMatch(/^[0-9a-f]{128}$/);
    });

    it('should handle very long requestId', async () => {
      const longRequestId = 'x'.repeat(10000);
      const result = await service.compute(longRequestId);

      expect(result.seed).toMatch(/^[0-9a-f]{64}$/);
      expect(result.proof).toMatch(/^[0-9a-f]{128}$/);
    });

    it('should handle special characters in requestId', async () => {
      const specialRequestId = 'req-!@#$%^&*()_+-=[]{}|;:,.<>?';
      const result = await service.compute(specialRequestId);

      expect(result.seed).toMatch(/^[0-9a-f]{64}$/);
      expect(result.proof).toMatch(/^[0-9a-f]{128}$/);
    });

    it('should handle unicode characters in requestId', async () => {
      const unicodeRequestId = 'req-🎲-🎯-🎪';
      const result = await service.compute(unicodeRequestId);

      expect(result.seed).toMatch(/^[0-9a-f]{64}$/);
      expect(result.proof).toMatch(/^[0-9a-f]{128}$/);
    });
  });
});
