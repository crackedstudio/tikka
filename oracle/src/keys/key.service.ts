import { OracleLoggerService } from '../logger/oracle-logger';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KeyProvider, KeyProviderHealth } from './key-provider.interface';
import { KeyProviderFactory } from './key-provider.factory';
import { EnvKeyProvider } from './providers/env-key.provider';
import * as StellarSdk from '@stellar/stellar-sdk';

/**
 * KeyService — manages the oracle's Ed25519 keypair using pluggable providers.
 *
 * Responsibilities:
 *  - Initialize the appropriate KeyProvider based on configuration
 *  - Provide the public key for contract verification
 *  - Provide signing capabilities for VRF and transaction submission
 *  - Support HSM-backed signing (AWS KMS, Google Cloud KMS)
 *
 * Security:
 *  - When using HSM providers, private keys never leave the HSM
 *  - Signing operations are performed within the secure hardware
 *  - Only the public key and signatures are exposed
 */
@Injectable()
export class KeyService implements OnModuleInit {
  static readonly GRACE_PERIOD_MS = 24 * 60 * 60 * 1000;

  private provider!: KeyProvider;
  private previousProvider: KeyProvider | null = null;
  private previousRotatedAt: number | null = null;
  private lock: Promise<void> = Promise.resolve();

  constructor(
    private readonly logger: OracleLoggerService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    await this.initializeProvider();
  }

  /**
   * Initializes the KeyProvider based on configuration.
   */
  private async initializeProvider() {
    try {
      this.provider = KeyProviderFactory.create(this.configService);
      const publicKey = await this.provider.getPublicKey();
      const providerType = this.provider.getProviderType();

      this.logger.log(
        `KeyService initialized with ${providerType} provider for address: ${publicKey}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to initialize KeyProvider: ${message}`);
      throw error;
    }
  }

  /**
   * Returns the oracle's public key as a string.
   */
  async getPublicKey(): Promise<string> {
    return this.provider.getPublicKey();
  }

  /**
   * Returns the raw public key bytes (32 bytes).
   */
  async getPublicKeyBuffer(): Promise<Buffer> {
    return this.provider.getPublicKeyBuffer();
  }

  /**
   * Returns the raw secret key bytes (32 bytes).
   *
   * WARNING: This method only works with EnvKeyProvider.
   * HSM providers (AWS KMS, GCP KMS) will throw an error.
   *
   * @deprecated Use sign() method instead for HSM compatibility
   */
  getSecretBuffer(): Buffer {
    if (this.provider instanceof EnvKeyProvider) {
      return this.provider.getSecretBuffer();
    }

    throw new Error(
      'getSecretBuffer() is not supported with HSM providers. Use sign() method instead.',
    );
  }

  /**
   * Signs a buffer using the oracle's private key.
   * For HSM providers, signing is performed within the secure hardware.
   *
   * @param data The data to sign
   * @returns Ed25519 signature (64 bytes for Ed25519, may vary for other algorithms)
   */
  async sign(data: Buffer): Promise<Buffer> {
    return this.exclusive(async () => this.provider.sign(data));
  }

  /**
   * Stable reference to the key that is active at the moment of the call.
   * Callers that hold this reference keep signing with it if a rotation
   * starts after they captured it.
   */
  getActiveSigningKey(): KeyProvider {
    return this.provider;
  }

  /**
   * Atomically swaps the active key. The displaced key stays available for
   * the 24-hour grace period. A provider that cannot return a public key
   * aborts the swap.
   */
  async rotateKey(newProvider: KeyProvider): Promise<void> {
    await this.exclusive(async () => {
      let newPublicKey: string;
      try {
        newPublicKey = await newProvider.getPublicKey();
        if (!newPublicKey) throw new Error('empty public key');
      } catch {
        this.logger.error('Key rotation failed');
        throw new Error('Key rotation failed: new provider did not return a valid public key');
      }

      const previousPublicKey = await this.provider.getPublicKey();
      this.logger.log(
        `Key rotation requested previousPublicKey=${previousPublicKey} newPublicKey=${newPublicKey}`,
      );
      this.previousProvider = this.provider;
      this.previousRotatedAt = Date.now();
      this.provider = newProvider;
      const expiresAt = new Date(this.previousRotatedAt + KeyService.GRACE_PERIOD_MS).toISOString();
      this.logger.log(
        `Key rotation completed newPublicKey=${newPublicKey} gracePeriodExpiresAt=${expiresAt}`,
      );
    });
  }

  getPreviousProvider(): KeyProvider | null {
    if (!this.previousProvider || this.previousRotatedAt == null) return null;
    if (Date.now() - this.previousRotatedAt >= KeyService.GRACE_PERIOD_MS) {
      this.previousProvider = null;
      this.previousRotatedAt = null;
      return null;
    }
    return this.previousProvider;
  }

  async getPreviousPublicKey(): Promise<string | null> {
    const previous = this.getPreviousProvider();
    if (!previous) return null;
    return previous.getPublicKey();
  }

  private async exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const previous = this.lock;
    let release: () => void = () => undefined;
    this.lock = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  /**
   * Signs a Stellar Transaction or FeeBumpTransaction.
   * This method is provider-agnostic and works with both Env and HSM providers.
   *
   * @param tx The transaction to sign
   */
  async signTransaction(tx: StellarSdk.Transaction | StellarSdk.FeeBumpTransaction): Promise<void> {
    await this.exclusive(async () => {
      const active = this.provider;
      const publicKey = await active.getPublicKey();
      const signature = await active.sign(tx.hash());
      tx.addSignature(publicKey, signature.toString('base64'));
    });
  }

  /**
   * Returns the provider type for debugging and monitoring.
   */
  getProviderType(): string {
    return this.provider.getProviderType();
  }
}
