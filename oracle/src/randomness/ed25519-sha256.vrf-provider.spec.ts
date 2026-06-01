import { Test, TestingModule } from '@nestjs/testing';
import { Ed25519Sha256VrfProvider } from './ed25519-sha256.vrf-provider';
import { KeyService } from '../keys/key.service';
import { RandomnessProviderType } from './randomness-provider.interface';
import { ed25519 } from '@noble/curves/ed25519';
import * as crypto from 'crypto';

describe('Ed25519Sha256VrfProvider', () => {
  let provider: Ed25519Sha256VrfProvider;
  let keyService: jest.Mocked<KeyService>;
  let testPrivateKey: Uint8Array;
  let testPublicKey: Uint8Array;

  beforeEach(async () => {
    // Generate test key pair
    testPrivateKey = ed25519.utils.randomPrivateKey();
    testPublicKey = ed25519.getPublicKey(testPrivateKey);

    const mockKeyService = {
      sign: jest.fn(),
      getPublicKeyBuffer: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        Ed25519Sha256VrfProvider,
        { provide: KeyService, useValue: mockKeyService },
      ],
    }).compile();

    provider = module.get<Ed25519Sha256VrfProvider>(Ed25519Sha256VrfProvider);
    keyService = module.get(KeyService) as jest.Mocked<KeyService>;
  });

  describe('getMetadata', () => {
    it('should return correct provider metadata', () => {
      const metadata = provider.getMetadata();

      expect(metadata.type).toBe(RandomnessProviderType.VRF);
      expect(metadata.algorithm).toBe('Ed25519-SHA-256');
      expect(metadata.isVerifiable).toBe(true);
      expect(metadata.description).toContain('Verifiable Random Function');
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

    it('should reject request with non-integer raffleId', () => {
      const input = { requestId: 'test-request', raffleId: 3.14 };
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
      const mockProof = Buffer.from('mock-proof-data');

      keyService.sign.mockResolvedValue(mockProof);

      const result = await provider.generate({ requestId, raffleId });

      expect(result.seed).toBeDefined();
      expect(result.proof).toBeDefined();
      expect(result.provider).toBe(RandomnessProviderType.VRF);
      expect(result.algorithm).toBe('Ed25519-SHA-256');
      expect(result.generatedAt).toBeInstanceOf(Date);
      expect(keyService.sign).toHaveBeenCalled();
    });

    it('should throw on invalid request', async () => {
      await expect(
        provider.generate({ requestId: '', raffleId: 42 }),
      ).rejects.toThrow('Invalid randomness request input');
    });
  });

  describe('compute', () => {
    it('should compute VRF output', async () => {
      const requestId = 'test-request-123';
      const mockProof = Buffer.from('mock-proof-data');

      keyService.sign.mockResolvedValue(mockProof);

      const result = await provider.compute(requestId);

      expect(result.seed).toBeDefined();
      expect(result.proof).toBeDefined();
      expect(result.seed).toHaveLength(64); // 32 bytes as hex
      expect(result.proof).toHaveLength(128); // 64 bytes as hex
    });

    it('should produce different seeds for different requestIds', async () => {
      keyService.sign.mockImplementation(async (msg: Buffer) => {
        return ed25519.sign(msg, testPrivateKey);
      });

      const result1 = await provider.compute('request-1');
      const result2 = await provider.compute('request-2');

      expect(result1.seed).not.toBe(result2.seed);
      expect(result1.proof).not.toBe(result2.proof);
    });

    it('should produce different seeds for same requestId with different raffleIds', async () => {
      keyService.sign.mockImplementation(async (msg: Buffer) => {
        return ed25519.sign(msg, testPrivateKey);
      });

      const result1 = await provider.compute('request-1', 1);
      const result2 = await provider.compute('request-1', 2);

      expect(result1.seed).not.toBe(result2.seed);
      expect(result1.proof).not.toBe(result2.proof);
    });
  });

  describe('verifyProof', () => {
    it('should verify valid proof', async () => {
      const requestId = 'test-request-123';
      const raffleId = 42;

      keyService.sign.mockImplementation(async (msg: Buffer) => {
        return ed25519.sign(msg, testPrivateKey);
      });

      const generated = await provider.compute(requestId, raffleId);
      const result = provider.verifyProof(
        testPublicKey,
        requestId,
        generated.proof,
        raffleId,
      );

      expect(result.valid).toBe(true);
      expect(result.seed).toBe(generated.seed);
      expect(result.error).toBeUndefined();
    });

    it('should reject invalid proof', () => {
      const result = provider.verifyProof(
        testPublicKey,
        'test-request',
        'invalid-proof',
        42,
      );

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject when public key is null', () => {
      const result = provider.verifyProof(null, 'test-request', 'proof', 42);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Public key is required');
    });

    it('should reject proof for wrong requestId', async () => {
      keyService.sign.mockImplementation(async (msg: Buffer) => {
        return ed25519.sign(msg, testPrivateKey);
      });

      const generated = await provider.compute('request-1', 42);
      const result = provider.verifyProof(
        testPublicKey,
        'request-2',
        generated.proof,
        42,
      );

      expect(result.valid).toBe(false);
    });
  });

  describe('verify', () => {
    it('should verify valid proof and seed', async () => {
      const requestId = 'test-request-123';
      const raffleId = 42;

      keyService.sign.mockImplementation(async (msg: Buffer) => {
        return ed25519.sign(msg, testPrivateKey);
      });

      const generated = await provider.compute(requestId, raffleId);
      const result = provider.verify(
        testPublicKey,
        requestId,
        generated.proof,
        generated.seed,
        raffleId,
      );

      expect(result).toBe(true);
    });

    it('should reject mismatched seed', async () => {
      const requestId = 'test-request-123';

      keyService.sign.mockImplementation(async (msg: Buffer) => {
        return ed25519.sign(msg, testPrivateKey);
      });

      const generated = await provider.compute(requestId);
      const result = provider.verify(
        testPublicKey,
        requestId,
        generated.proof,
        'wrong-seed',
      );

      expect(result).toBe(false);
    });
  });
});
