import { OracleLoggerService } from '../../logger/oracle-logger';
import { Injectable, Logger } from '@nestjs/common';
import { Keypair } from '@stellar/stellar-sdk';
import { KeyProvider, KeyProviderHealth } from '../key-provider.interface';

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
  
  private keypair: Keypair;

  constructor(private readonly logger: OracleLoggerService, privateKey: string) {
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

  /**
   * Probes the env key provider and returns a safe health snapshot.
   *
   * Because the key is held in memory there is no remote call to make.
   * The health check simply verifies that the keypair is still loaded and
   * readable, then returns the public key as the active key identifier.
   *
   * SECURITY: only the public key (G-address) is included — never the secret.
   */
  async getProviderHealth(): Promise<KeyProviderHealth> {
    const checkedAt = new Date().toISOString();
    try {
      // Verify the keypair is intact and the public key is readable.
      const publicKey = this.keypair.publicKey();
      if (!publicKey) {
        return {
          status: 'unknown',
          activeKeyId: null,
          message: 'Keypair is loaded but publicKey() returned an empty value.',
          checkedAt,
          providerType: this.getProviderType(),
        };
      }
      return {
        status: 'healthy',
        activeKeyId: publicKey,
        message: 'Env key provider is healthy. Key is loaded and accessible.',
        checkedAt,
        providerType: this.getProviderType(),
      };
    } catch {
      // Intentionally not forwarding the raw error to avoid leaking key material.
      return {
        status: 'unknown',
        activeKeyId: null,
        message: 'An unexpected error occurred while reading the in-memory keypair.',
        checkedAt,
        providerType: this.getProviderType(),
      };
    }
  }
}
