import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KeyProvider } from './key-provider.interface';
import { KeyProviderFactory } from './key-provider.factory';
import { EnvKeyProvider } from './providers/env-key.provider';
import * as StellarSdk from 'stellar-sdk';

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
  private readonly logger = new Logger(KeyService.name);
  private provider: KeyProvider;

  constructor(private readonly configService: ConfigService) {}

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
      this.logger.error(`Failed to initialize KeyProvider: ${error.message}`);
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
    return this.provider.sign(data);
  }

  /**
   * Signs a Stellar Transaction or FeeBumpTransaction.
   * This method is provider-agnostic and works with both Env and HSM providers.
   * 
   * @param tx The transaction to sign
   */
  async signTransaction(tx: StellarSdk.Transaction | StellarSdk.FeeBumpTransaction): Promise<void> {
    const publicKey = await this.getPublicKey();
    const signature = await this.sign(tx.hash());
    tx.addSignature(publicKey, signature.toString('base64'));
  }

  /**
   * Returns the provider type for debugging and monitoring.
   */
  getProviderType(): string {
    return this.provider.getProviderType();
  }
}
