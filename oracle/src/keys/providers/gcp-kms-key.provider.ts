import { Injectable, Logger } from '@nestjs/common';
import { KeyProvider, KeyProviderHealth } from '../key-provider.interface';

/**
 * Google Cloud KMS KeyProvider.
 * 
 * Uses Google Cloud Key Management Service to perform signing operations.
 * The private key never leaves the HSM, ensuring maximum security.
 * 
 * Prerequisites:
 * - Google Cloud SDK installed: npm install @google-cloud/kms
 * - Service account with permissions: cloudkms.cryptoKeyVersions.useToSign, cloudkms.cryptoKeyVersions.viewPublicKey
 * - KMS key must be configured for ASYMMETRIC_SIGN with EC_SIGN_ED25519 algorithm
 * 
 * Key Resource Name Format:
 * projects/{project}/locations/{location}/keyRings/{keyRing}/cryptoKeys/{key}/cryptoKeyVersions/{version}
 */
@Injectable()
export class GcpKmsKeyProvider implements KeyProvider {
  private readonly logger = new Logger(GcpKmsKeyProvider.name);
  private kmsClient: any;
  private keyVersionName: string;
  private publicKey: Buffer | null = null;
  private publicKeyString: string | null = null;

  constructor(
    projectId: string,
    keyPath: string,
  ) {
    if (!projectId || !keyPath) {
      throw new Error(
        'GCP_KMS_PROJECT and GCP_KMS_KEY_PATH are required for GcpKmsKeyProvider',
      );
    }

    this.keyVersionName = keyPath;

    try {
      // Lazy load Google Cloud SDK to avoid requiring it when not using GCP KMS
      const { KeyManagementServiceClient } = require('@google-cloud/kms');
      this.kmsClient = new KeyManagementServiceClient();
      this.logger.log(`GcpKmsKeyProvider initialized for key: ${this.keyVersionName}`);
    } catch (error) {
      this.logger.error(`Failed to initialize GCP KMS client: ${error.message}`);
      throw new Error(
        'Google Cloud KMS SDK not installed. Run: npm install @google-cloud/kms',
      );
    }
  }

  async getPublicKey(): Promise<string> {
    if (this.publicKeyString) {
      return this.publicKeyString;
    }

    await this.loadPublicKey();
    return this.publicKeyString!;
  }

  async getPublicKeyBuffer(): Promise<Buffer> {
    if (this.publicKey) {
      return this.publicKey;
    }

    await this.loadPublicKey();
    return this.publicKey!;
  }

  private async loadPublicKey(): Promise<void> {
    try {
      const [publicKeyResponse] = await this.kmsClient.getPublicKey({
        name: this.keyVersionName,
      });

      // Parse the PEM-encoded public key
      const pem = publicKeyResponse.pem;
      
      // Extract the raw public key from PEM format
      // For Ed25519, the public key is 32 bytes
      const pemLines = pem.split('\n').filter(
        (line: string) => !line.includes('BEGIN') && !line.includes('END'),
      );
      const pemData = pemLines.join('');
      const derBuffer = Buffer.from(pemData, 'base64');

      // For Ed25519, the last 32 bytes of the DER encoding contain the public key
      // This is a simplified extraction - in production, use a proper ASN.1 parser
      this.publicKey = derBuffer.slice(-32);
      this.publicKeyString = this.publicKey.toString('hex');

      this.logger.log('Public key loaded from GCP KMS');
    } catch (error) {
      this.logger.error(`Failed to load public key from GCP KMS: ${error.message}`);
      throw new Error('Failed to retrieve public key from GCP KMS');
    }
  }

  async sign(data: Buffer): Promise<Buffer> {
    try {
      // Create a digest for the data
      // For Ed25519, we sign the raw message directly
      const [signResponse] = await this.kmsClient.asymmetricSign({
        name: this.keyVersionName,
        data: data,
      });

      const signature = Buffer.from(signResponse.signature);

      this.logger.debug(`Signed ${data.length} bytes using GCP KMS`);
      return signature;
    } catch (error) {
      this.logger.error(`GCP KMS signing failed: ${error.message}`);
      throw new Error('Failed to sign data with GCP KMS');
    }
  }

  getProviderType(): string {
    return 'gcp-kms';
  }

  /**
   * Probes GCP KMS and returns a safe health snapshot.
   *
   * Calls `getCryptoKeyVersion` (read-only, no key material returned) to verify
   * connectivity and IAM permissions, then exposes only the key-version resource name.
   *
   * SECURITY: GCP KMS never returns private key material from getCryptoKeyVersion.
   *           Raw gRPC error details are sanitised before inclusion.
   */
  async getProviderHealth(): Promise<KeyProviderHealth> {
    const checkedAt = new Date().toISOString();
    // Use the key-version resource name as identifier (contains no secrets).
    const cachedKeyId = this.keyVersionName ?? null;

    try {
      const [keyVersion] = await this.kmsClient.getCryptoKeyVersion({
        name: this.keyVersionName,
      });

      const resourceName: string = keyVersion?.name ?? this.keyVersionName;

      return {
        status: 'healthy',
        activeKeyId: resourceName,
        message: 'GCP KMS provider is healthy. Key version is accessible.',
        checkedAt,
        providerType: this.getProviderType(),
      };
    } catch (error: any) {
      const status = this.classifyGcpError(error);
      return {
        status,
        activeKeyId: cachedKeyId,
        message: this.sanitiseGcpError(status),
        checkedAt,
        providerType: this.getProviderType(),
      };
    }
  }

  /** Maps gRPC / GCP error codes to our status taxonomy. */
  private classifyGcpError(error: any): 'unavailable' | 'permission_denied' | 'unknown' {
    // gRPC status codes are numeric; gRPC-js also sets a `code` property.
    const code: number | string = error?.code ?? error?.status ?? '';
    // gRPC PERMISSION_DENIED = 7, UNAUTHENTICATED = 16
    if (code === 7 || code === 16 || error?.message?.includes('PERMISSION_DENIED') || error?.message?.includes('UNAUTHENTICATED')) {
      return 'permission_denied';
    }
    // gRPC UNAVAILABLE = 14, DEADLINE_EXCEEDED = 4
    if (
      code === 14 ||
      code === 4 ||
      error?.message?.includes('UNAVAILABLE') ||
      error?.message?.includes('DEADLINE_EXCEEDED') ||
      error?.message?.includes('ECONNREFUSED') ||
      error?.message?.includes('ETIMEDOUT')
    ) {
      return 'unavailable';
    }
    return 'unknown';
  }

  /** Returns a safe, sanitised description of a GCP error. */
  private sanitiseGcpError(status: 'unavailable' | 'permission_denied' | 'unknown'): string {
    switch (status) {
      case 'permission_denied':
        return 'GCP KMS returned a permission or authentication error. Check the service-account IAM bindings.';
      case 'unavailable':
        return 'GCP KMS is unreachable. Check network connectivity and the configured project/location.';
      default:
        return 'An unexpected error occurred while contacting GCP KMS.';
    }
  }
}
