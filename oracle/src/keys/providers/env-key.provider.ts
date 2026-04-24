import { Injectable, Logger } from '@nestjs/common';
import { Keypair } from '@stellar/stellar-sdk';
import { KeyProvider } from '../key-provider.interface';

/**
 * Environment-based KeyProvider.
 * 
 * Loads the private key from environment variables.
 * WARNING: This approach exposes the private key in memory and should only
 * be used in development or low-security environments.
 * 
 * For production, use AWS KMS or Google Cloud KMS providers.
 */
@Injectable()
export class EnvKeyProvider implements KeyProvider {
  private readonly logger = new Logger(EnvKeyProvider.name);
  private keypair: Keypair;

  constructor(privateKey: string) {
    if (!privateKey) {
      throw new Error('Private key is required for EnvKeyProvider');
    }

    try {
      this.keypair = Keypair.fromSecret(privateKey);
      this.logger.log(`EnvKeyProvider initialized for address: ${this.keypair.publicKey()}`);
    } catch (error) {
      this.logger.error(`Failed to load keypair from secret: ${error.message}`);
      throw new Error(`Invalid private key format: ${error.message}`);
    }
  }

  async getPublicKey(): Promise<string> {
    return this.keypair.publicKey();
  }

  async getPublicKeyBuffer(): Promise<Buffer> {
    return this.keypair.rawPublicKey();
  }

  async sign(data: Buffer): Promise<Buffer> {
    return this.keypair.sign(data);
  }

  getProviderType(): string {
    return 'env';
  }

  /**
   * Returns the raw secret key bytes (32 bytes).
   * WARNING: Only available in EnvKeyProvider. HSM providers will not expose this.
   */
  getSecretBuffer(): Buffer {
    return this.keypair.rawSecretKey();
  }
}
