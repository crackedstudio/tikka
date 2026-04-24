import { Injectable, Logger } from '@nestjs/common';
import { KeyProvider } from '../key-provider.interface';

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
    locationId: string,
    keyRingId: string,
    keyId: string,
    keyVersion: string = '1',
  ) {
    if (!projectId || !locationId || !keyRingId || !keyId) {
      throw new Error(
        'GCP project, location, keyRing, and key IDs are required for GcpKmsKeyProvider',
      );
    }

    this.keyVersionName = `projects/${projectId}/locations/${locationId}/keyRings/${keyRingId}/cryptoKeys/${keyId}/cryptoKeyVersions/${keyVersion}`;

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
}
