import { OracleLoggerService, redact } from '../../logger/oracle-logger';
import { Injectable } from '@nestjs/common';
import { Keypair } from '@stellar/stellar-sdk';
import { KeyProvider, KeyProviderHealth } from '../key-provider.interface';

const PRODUCTION_OVERRIDE = 'ALLOW_ENV_PROVIDER_IN_PRODUCTION';

export function envProviderRefusedInProduction(): boolean {
  return process.env.NODE_ENV === 'production' && process.env[PRODUCTION_OVERRIDE] !== 'true';
}

function withoutSecret(message: string, secret: string): string {
  const redacted = String(redact(message));
  if (!secret) return redacted;
  return redacted.split(secret).join('[REDACTED]');
}

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

  constructor(
    private readonly logger: OracleLoggerService,
    privateKey: string,
  ) {
    if (envProviderRefusedInProduction()) {
      throw new Error(
        `EnvKeyProvider is not allowed in production unless ${PRODUCTION_OVERRIDE}=true is set`,
      );
    }

    if (!privateKey) {
      throw new Error('Private key is required for EnvKeyProvider');
    }

    try {
      this.keypair = Keypair.fromSecret(privateKey);
      this.logger.log(`EnvKeyProvider initialized for address: ${this.keypair.publicKey()}`);
    } catch (error) {
      const safe = withoutSecret(
        error instanceof Error ? error.message : String(error),
        privateKey,
      );
      this.logger.error(`Failed to load keypair from secret: ${safe}`);
      throw new Error('Invalid private key format');
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
