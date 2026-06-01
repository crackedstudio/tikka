import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RandomnessProviderService } from './randomness-provider.service';
import { Ed25519Sha256VrfProvider } from './ed25519-sha256.vrf-provider';
import { PrngProvider } from './prng.provider';
import { RandomnessProviderType } from './randomness-provider.interface';

describe('RandomnessProviderService', () => {
  let service: RandomnessProviderService;
  let vrfProvider: jest.Mocked<Ed25519Sha256VrfProvider>;
  let prngProvider: jest.Mocked<PrngProvider>;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    const mockVrfProvider = {
      getMetadata: jest.fn().mockReturnValue({
        type: RandomnessProviderType.VRF,
        algorithm: 'Ed25519-SHA-256',
        description: 'VRF Provider',
        isVerifiable: true,
      }),
      validateRequest: jest.fn().mockReturnValue(true),
      generate: jest.fn(),
      verifyProof: jest.fn(),
      verify: jest.fn(),
    };

    const mockPrngProvider = {
      getMetadata: jest.fn().mockReturnValue({
        type: RandomnessProviderType.PRNG,
        algorithm: 'SHA-256-PRNG',
        description: 'PRNG Provider',
        isVerifiable: false,
      }),
      validateRequest: jest.fn().mockReturnValue(true),
      generate: jest.fn(),
      verifyProof: jest.fn(),
      verify: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn().mockReturnValue('500'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RandomnessProviderService,
        { provide: Ed25519Sha256VrfProvider, useValue: mockVrfProvider },
        { provide: PrngProvider, useValue: mockPrngProvider },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<RandomnessProviderService>(RandomnessProviderService);
    vrfProvider = module.get(Ed25519Sha256VrfProvider) as jest.Mocked<Ed25519Sha256VrfProvider>;
    prngProvider = module.get(PrngProvider) as jest.Mocked<PrngProvider>;
    configService = module.get(ConfigService) as jest.Mocked<ConfigService>;
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should register VRF and PRNG providers', () => {
      const providers = service.getAllProviders();
      expect(providers).toHaveLength(2);
    });

    it('should load VRF threshold from config', () => {
      expect(configService.get).toHaveBeenCalledWith('VRF_THRESHOLD_XLM', '500');
    });
  });

  describe('getProvider', () => {
    it('should return VRF provider', () => {
      const provider = service.getProvider(RandomnessProviderType.VRF);
      expect(provider).toBe(vrfProvider);
    });

    it('should return PRNG provider', () => {
      const provider = service.getProvider(RandomnessProviderType.PRNG);
      expect(provider).toBe(prngProvider);
    });

    it('should throw for unknown provider', () => {
      expect(() => service.getProvider('unknown' as any)).toThrow('Provider not found');
    });
  });

  describe('getAllProviders', () => {
    it('should return all registered providers', () => {
      const providers = service.getAllProviders();
      expect(providers).toContain(vrfProvider);
      expect(providers).toContain(prngProvider);
    });
  });

  describe('getProviderMetadata', () => {
    it('should return metadata for all providers', () => {
      const metadata = service.getProviderMetadata();
      expect(metadata).toHaveLength(2);
      expect(metadata.some((m) => m.type === RandomnessProviderType.VRF)).toBe(true);
      expect(metadata.some((m) => m.type === RandomnessProviderType.PRNG)).toBe(true);
    });
  });

  describe('generate - provider selection', () => {
    it('should use VRF for high-stakes raffle (>= threshold)', async () => {
      const input = {
        requestId: 'test-request',
        raffleId: 1,
        prizeAmount: 500,
      };

      vrfProvider.generate.mockResolvedValue({
        seed: 'vrf-seed',
        proof: 'vrf-proof',
        provider: RandomnessProviderType.VRF,
        algorithm: 'Ed25519-SHA-256',
        generatedAt: new Date(),
      });

      await service.generate(input);

      expect(vrfProvider.generate).toHaveBeenCalledWith(input);
      expect(prngProvider.generate).not.toHaveBeenCalled();
    });

    it('should use VRF for prize exactly at threshold', async () => {
      const input = {
        requestId: 'test-request',
        raffleId: 1,
        prizeAmount: 500,
      };

      vrfProvider.generate.mockResolvedValue({
        seed: 'vrf-seed',
        proof: 'vrf-proof',
        provider: RandomnessProviderType.VRF,
        algorithm: 'Ed25519-SHA-256',
        generatedAt: new Date(),
      });

      await service.generate(input);

      expect(vrfProvider.generate).toHaveBeenCalled();
      expect(prngProvider.generate).not.toHaveBeenCalled();
    });

    it('should use PRNG for low-stakes raffle (< threshold)', async () => {
      const input = {
        requestId: 'test-request',
        raffleId: 1,
        prizeAmount: 499,
      };

      prngProvider.generate.mockResolvedValue({
        seed: 'prng-seed',
        proof: 'prng-proof',
        provider: RandomnessProviderType.PRNG,
        algorithm: 'SHA-256-PRNG',
        generatedAt: new Date(),
      });

      await service.generate(input);

      expect(prngProvider.generate).toHaveBeenCalledWith(input);
      expect(vrfProvider.generate).not.toHaveBeenCalled();
    });

    it('should use PRNG for zero prize', async () => {
      const input = {
        requestId: 'test-request',
        raffleId: 1,
        prizeAmount: 0,
      };

      prngProvider.generate.mockResolvedValue({
        seed: 'prng-seed',
        proof: 'prng-proof',
        provider: RandomnessProviderType.PRNG,
        algorithm: 'SHA-256-PRNG',
        generatedAt: new Date(),
      });

      await service.generate(input);

      expect(prngProvider.generate).toHaveBeenCalled();
      expect(vrfProvider.generate).not.toHaveBeenCalled();
    });

    it('should default to VRF when prizeAmount is undefined', async () => {
      const input = {
        requestId: 'test-request',
        raffleId: 1,
      };

      vrfProvider.generate.mockResolvedValue({
        seed: 'vrf-seed',
        proof: 'vrf-proof',
        provider: RandomnessProviderType.VRF,
        algorithm: 'Ed25519-SHA-256',
        generatedAt: new Date(),
      });

      await service.generate(input);

      expect(vrfProvider.generate).toHaveBeenCalled();
      expect(prngProvider.generate).not.toHaveBeenCalled();
    });
  });

  describe('generate - response', () => {
    it('should return response with provider metadata', async () => {
      const input = {
        requestId: 'test-request',
        raffleId: 1,
        prizeAmount: 1000,
      };

      const mockResponse = {
        seed: 'test-seed',
        proof: 'test-proof',
        provider: RandomnessProviderType.VRF,
        algorithm: 'Ed25519-SHA-256',
        generatedAt: new Date(),
      };

      vrfProvider.generate.mockResolvedValue(mockResponse);

      const result = await service.generate(input);

      expect(result).toEqual(mockResponse);
      expect(result.provider).toBe(RandomnessProviderType.VRF);
      expect(result.algorithm).toBe('Ed25519-SHA-256');
    });
  });

  describe('custom VRF threshold', () => {
    it('should respect custom threshold from config', async () => {
      // Create new service with custom threshold
      configService.get.mockReturnValue('1000');

      const customModule = await Test.createTestingModule({
        providers: [
          RandomnessProviderService,
          { provide: Ed25519Sha256VrfProvider, useValue: vrfProvider },
          { provide: PrngProvider, useValue: prngProvider },
          { provide: ConfigService, useValue: configService },
        ],
      }).compile();

      const customService = customModule.get<RandomnessProviderService>(
        RandomnessProviderService,
      );

      // Prize below new threshold should use PRNG
      const input = {
        requestId: 'test-request',
        raffleId: 1,
        prizeAmount: 999,
      };

      prngProvider.generate.mockResolvedValue({
        seed: 'prng-seed',
        proof: 'prng-proof',
        provider: RandomnessProviderType.PRNG,
        algorithm: 'SHA-256-PRNG',
        generatedAt: new Date(),
      });

      await customService.generate(input);

      expect(prngProvider.generate).toHaveBeenCalled();
      expect(vrfProvider.generate).not.toHaveBeenCalled();
    });
  });
});
