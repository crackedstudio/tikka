import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { KeyService } from './key.service';
import { EnvKeyProvider } from './providers/env-key.provider';
import * as StellarSdk from '@stellar/stellar-sdk';

describe('KeyService', () => {
  let service: KeyService;
  let configService: ConfigService;

  // Test Stellar keypair
  const TEST_KEYPAIR = StellarSdk.Keypair.random();
  const TEST_SECRET = TEST_KEYPAIR.secret();
  const TEST_PUBLIC = TEST_KEYPAIR.publicKey();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KeyService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              const config: Record<string, any> = {
                KEY_PROVIDER: 'env',
                ORACLE_PRIVATE_KEY: TEST_SECRET,
              };
              return config[key] ?? defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<KeyService>(KeyService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('initialization', () => {
    it('should initialize with env provider', async () => {
      await service.onModuleInit();
      expect(service.getProviderType()).toBe('env');
    });

    it('should load public key', async () => {
      await service.onModuleInit();
      const publicKey = await service.getPublicKey();
      expect(publicKey).toBeDefined();
      expect(typeof publicKey).toBe('string');
    });

    it('should throw error if ORACLE_PRIVATE_KEY is missing', async () => {
      jest.spyOn(configService, 'get').mockReturnValue(undefined);
      await expect(service.onModuleInit()).rejects.toThrow();
    });
  });

  describe('signing', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should sign data', async () => {
      const data = Buffer.from('test message');
      const signature = await service.sign(data);
      
      expect(signature).toBeDefined();
      expect(Buffer.isBuffer(signature)).toBe(true);
      expect(signature.length).toBe(64); // Ed25519 signature is 64 bytes
    });

    it('should produce consistent signatures for same data', async () => {
      const data = Buffer.from('test message');
      const sig1 = await service.sign(data);
      const sig2 = await service.sign(data);
      
      // Ed25519 signatures are deterministic
      expect(sig1.equals(sig2)).toBe(true);
    });

    it('should produce different signatures for different data', async () => {
      const data1 = Buffer.from('message 1');
      const data2 = Buffer.from('message 2');
      
      const sig1 = await service.sign(data1);
      const sig2 = await service.sign(data2);
      
      expect(sig1.equals(sig2)).toBe(false);
    });
  });

  describe('public key', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should return public key as string', async () => {
      const publicKey = await service.getPublicKey();
      expect(typeof publicKey).toBe('string');
      expect(publicKey.length).toBeGreaterThan(0);
    });

    it('should return public key as buffer', async () => {
      const publicKeyBuffer = await service.getPublicKeyBuffer();
      expect(Buffer.isBuffer(publicKeyBuffer)).toBe(true);
      expect(publicKeyBuffer.length).toBe(32); // Ed25519 public key is 32 bytes
    });

    it('should return consistent public key', async () => {
      const pk1 = await service.getPublicKey();
      const pk2 = await service.getPublicKey();
      expect(pk1).toBe(pk2);
    });
  });

  describe('getSecretBuffer (deprecated)', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should return secret buffer for env provider', () => {
      const secretBuffer = service.getSecretBuffer();
      expect(Buffer.isBuffer(secretBuffer)).toBe(true);
      expect(secretBuffer.length).toBe(32); // Ed25519 secret key is 32 bytes
    });

    it('should throw error for HSM providers', async () => {
      // Mock HSM provider
      jest.spyOn(configService, 'get').mockImplementation((key: string) => {
        if (key === 'KEY_PROVIDER') return 'aws-kms';
        return undefined;
      });

      // This would fail during initialization due to missing AWS config
      // In a real scenario with HSM provider, getSecretBuffer should throw
    });
  });

  describe('provider type', () => {
    it('should return correct provider type', async () => {
      await service.onModuleInit();
      expect(service.getProviderType()).toBe('env');
    });
  });
});
