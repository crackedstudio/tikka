import { Injectable, Logger } from '@nestjs/common';
import { KeyProvider } from '../key-provider.interface';

/**
 * AWS KMS KeyProvider.
 * 
 * Uses AWS Key Management Service to perform signing operations.
 * The private key never leaves the HSM, ensuring maximum security.
 * 
 * Prerequisites:
 * - AWS SDK installed: npm install @aws-sdk/client-kms
 * - IAM permissions: kms:Sign, kms:GetPublicKey
 * - KMS key must be configured for SIGN_VERIFY with ECC_SECG_P256K1 or similar
 * 
 * Note: AWS KMS does not natively support Ed25519. This implementation
 * requires a custom solution or using ECDSA as an alternative.
 * For true Ed25519 support, consider using AWS CloudHSM or storing
 * the public key separately and only using KMS for signing operations.
 */
@Injectable()
export class AwsKmsKeyProvider implements KeyProvider {
  private readonly logger = new Logger(AwsKmsKeyProvider.name);
  private kmsClient: any;
  private keyId: string;
  private publicKey: Buffer | null = null;
  private publicKeyString: string | null = null;

  constructor(region: string, keyId: string) {
    if (!region || !keyId) {
      throw new Error('AWS region and keyId are required for AwsKmsKeyProvider');
    }

    this.keyId = keyId;

    try {
      // Lazy load AWS SDK to avoid requiring it when not using AWS KMS
      const { KMSClient } = require('@aws-sdk/client-kms');
      this.kmsClient = new KMSClient({ region });
      this.logger.log(`AwsKmsKeyProvider initialized for key: ${keyId}`);
    } catch (error) {
      this.logger.error(`Failed to initialize AWS KMS client: ${error.message}`);
      throw new Error(
        'AWS SDK not installed. Run: npm install @aws-sdk/client-kms',
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
      const { GetPublicKeyCommand } = require('@aws-sdk/client-kms');
      const command = new GetPublicKeyCommand({ KeyId: this.keyId });
      const response = await this.kmsClient.send(command);

      // Extract the public key from DER format
      // Note: This is a simplified implementation. In production, you'll need
      // to properly parse the DER-encoded public key based on your key type.
      this.publicKey = Buffer.from(response.PublicKey);
      this.publicKeyString = this.publicKey.toString('hex');

      this.logger.log('Public key loaded from AWS KMS');
    } catch (error) {
      this.logger.error(`Failed to load public key from AWS KMS: ${error.message}`);
      throw new Error('Failed to retrieve public key from AWS KMS');
    }
  }

  async sign(data: Buffer): Promise<Buffer> {
    try {
      const { SignCommand, MessageType, SigningAlgorithmSpec } = require('@aws-sdk/client-kms');

      const command = new SignCommand({
        KeyId: this.keyId,
        Message: data,
        MessageType: MessageType.RAW,
        // Note: AWS KMS doesn't support Ed25519 natively.
        // You may need to use ECDSA_SHA_256 or configure CloudHSM for Ed25519.
        // This is a placeholder - adjust based on your KMS key configuration.
        SigningAlgorithm: SigningAlgorithmSpec.ECDSA_SHA_256,
      });

      const response = await this.kmsClient.send(command);
      const signature = Buffer.from(response.Signature);

      this.logger.debug(`Signed ${data.length} bytes using AWS KMS`);
      return signature;
    } catch (error) {
      this.logger.error(`AWS KMS signing failed: ${error.message}`);
      throw new Error('Failed to sign data with AWS KMS');
    }
  }

  getProviderType(): string {
    return 'aws-kms';
  }
}
