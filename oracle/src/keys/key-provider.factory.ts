import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KeyProvider, KeyProviderConfig } from './key-provider.interface';
import { EnvKeyProvider } from './providers/env-key.provider';
import { AwsKmsKeyProvider } from './providers/aws-kms-key.provider';
import { GcpKmsKeyProvider } from './providers/gcp-kms-key.provider';

/**
 * Factory for creating KeyProvider instances based on configuration.
 */
export class KeyProviderFactory {
  private static readonly logger = new Logger(KeyProviderFactory.name);

  /**
   * Creates a KeyProvider based on the configuration.
   * 
   * Configuration priority:
   * 1. Explicit KEY_PROVIDER environment variable
   * 2. Presence of cloud-specific environment variables
   * 3. Fallback to 'env' provider
   * 
   * @param configService NestJS ConfigService
   * @returns KeyProvider instance
   */
  static create(configService: ConfigService): KeyProvider {
    const providerType = configService.get<string>('KEY_PROVIDER', 'env').toLowerCase();

    this.logger.log(`Creating KeyProvider of type: ${providerType}`);

    switch (providerType) {
      case 'env':
        return this.createEnvProvider(configService);

      case 'aws-kms':
      case 'aws':
        return this.createAwsKmsProvider(configService);

      case 'gcp-kms':
      case 'gcp':
      case 'google':
        return this.createGcpKmsProvider(configService);

      default:
        this.logger.warn(
          `Unknown KEY_PROVIDER type: ${providerType}. Falling back to 'env' provider.`,
        );
        return this.createEnvProvider(configService);
    }
  }

  private static createEnvProvider(configService: ConfigService): EnvKeyProvider {
    const privateKey = configService.get<string>('ORACLE_PRIVATE_KEY');

    if (!privateKey) {
      throw new Error(
        'ORACLE_PRIVATE_KEY environment variable is required for env provider',
      );
    }

    this.logger.warn(
      'Using EnvKeyProvider: Private key is stored in memory. ' +
      'For production, use AWS KMS or GCP KMS.',
    );

    return new EnvKeyProvider(privateKey);
  }

  private static createAwsKmsProvider(configService: ConfigService): AwsKmsKeyProvider {
    const region = configService.get<string>('AWS_REGION');
    const keyId = configService.get<string>('AWS_KMS_KEY_ID');

    if (!region || !keyId) {
      throw new Error(
        'AWS_REGION and AWS_KMS_KEY_ID environment variables are required for AWS KMS provider',
      );
    }

    this.logger.log('Using AWS KMS for secure key management');
    return new AwsKmsKeyProvider(region, keyId);
  }

  private static createGcpKmsProvider(configService: ConfigService): GcpKmsKeyProvider {
    const projectId = configService.get<string>('GCP_PROJECT_ID');
    const locationId = configService.get<string>('GCP_LOCATION_ID', 'global');
    const keyRingId = configService.get<string>('GCP_KEY_RING_ID');
    const keyId = configService.get<string>('GCP_KEY_ID');
    const keyVersion = configService.get<string>('GCP_KEY_VERSION', '1');

    if (!projectId || !keyRingId || !keyId) {
      throw new Error(
        'GCP_PROJECT_ID, GCP_KEY_RING_ID, and GCP_KEY_ID environment variables are required for GCP KMS provider',
      );
    }

    this.logger.log('Using Google Cloud KMS for secure key management');
    return new GcpKmsKeyProvider(projectId, locationId, keyRingId, keyId, keyVersion);
  }
}
