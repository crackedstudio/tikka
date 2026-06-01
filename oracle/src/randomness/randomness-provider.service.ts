import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  IRandomnessProvider,
  RandomnessProviderType,
  RandomnessRequestInput,
  RandomnessResponse,
} from './randomness-provider.interface';
import { Ed25519Sha256VrfProvider } from './ed25519-sha256.vrf-provider';
import { PrngProvider } from './prng.provider';

/**
 * Randomness provider service — unified interface for VRF, PRNG, and future providers.
 *
 * This service:
 * - Selects the appropriate provider based on request parameters (e.g., prize amount)
 * - Provides a provider-agnostic API for randomness generation
 * - Records provider type in randomness responses
 * - Supports adding new providers without changing consumer code
 *
 * Provider selection logic:
 * - VRF: High-stakes raffles (prize >= VRF_THRESHOLD_XLM)
 * - PRNG: Low-stakes raffles (prize < VRF_THRESHOLD_XLM)
 * - Future providers can be added by implementing IRandomnessProvider
 */
@Injectable()
export class RandomnessProviderService {
  private readonly logger = new Logger(RandomnessProviderService.name);
  private readonly vrfThresholdXlm: number;
  private readonly providers: Map<RandomnessProviderType, IRandomnessProvider>;

  constructor(
    private readonly vrfProvider: Ed25519Sha256VrfProvider,
    private readonly prngProvider: PrngProvider,
    private readonly configService: ConfigService,
  ) {
    this.vrfThresholdXlm = Number(
      this.configService.get<string>('VRF_THRESHOLD_XLM', '500'),
    );

    // Register providers
    this.providers = new Map([
      [RandomnessProviderType.VRF, this.vrfProvider],
      [RandomnessProviderType.PRNG, this.prngProvider],
    ]);

    this.logger.log(
      `Randomness provider service initialized with VRF threshold: ${this.vrfThresholdXlm} XLM`,
    );
    this.logger.log(`Registered providers: ${Array.from(this.providers.keys()).join(', ')}`);
  }

  /**
   * Generate randomness using the appropriate provider.
   * Provider is selected based on prize amount and other request parameters.
   *
   * @param input Request input with requestId, raffleId, and optional prizeAmount
   * @returns Randomness response with provider metadata
   */
  async generate(input: RandomnessRequestInput): Promise<RandomnessResponse> {
    const provider = this.selectProvider(input);
    const metadata = provider.getMetadata();

    this.logger.log(
      `Generating randomness for request ${input.requestId} using ${metadata.type} provider (${metadata.algorithm})`,
    );

    return provider.generate(input);
  }

  /**
   * Get a specific provider by type.
   *
   * @param type Provider type
   * @returns Provider instance
   * @throws Error if provider not found
   */
  getProvider(type: RandomnessProviderType): IRandomnessProvider {
    const provider = this.providers.get(type);
    if (!provider) {
      throw new Error(`Provider not found: ${type}`);
    }
    return provider;
  }

  /**
   * Get all registered providers.
   *
   * @returns Array of provider instances
   */
  getAllProviders(): IRandomnessProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Get metadata for all registered providers.
   *
   * @returns Array of provider metadata
   */
  getProviderMetadata(): Array<ReturnType<IRandomnessProvider['getMetadata']>> {
    return this.getAllProviders().map((p) => p.getMetadata());
  }

  /**
   * Select the appropriate provider based on request parameters.
   *
   * Selection logic:
   * - If prizeAmount >= vrfThresholdXlm: use VRF
   * - If prizeAmount < vrfThresholdXlm: use PRNG
   * - If prizeAmount is undefined: default to VRF (safe default)
   *
   * @param input Request input
   * @returns Selected provider
   */
  private selectProvider(input: RandomnessRequestInput): IRandomnessProvider {
    // Default to VRF if prize amount is not provided (safe default)
    if (input.prizeAmount === undefined) {
      this.logger.debug(
        `Prize amount not provided for request ${input.requestId}, defaulting to VRF`,
      );
      return this.vrfProvider;
    }

    // Select based on prize amount threshold
    const useVrf = input.prizeAmount >= this.vrfThresholdXlm;
    const selectedType = useVrf ? RandomnessProviderType.VRF : RandomnessProviderType.PRNG;

    this.logger.debug(
      `Selected ${selectedType} provider for request ${input.requestId} (prize: ${input.prizeAmount} XLM, threshold: ${this.vrfThresholdXlm} XLM)`,
    );

    return this.providers.get(selectedType)!;
  }
}
