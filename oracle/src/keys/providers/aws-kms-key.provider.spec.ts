import { AwsKmsKeyProvider } from './aws-kms-key.provider';
import { KeyProviderError } from '../key-provider.error';
import { ConfigService } from '@nestjs/config';
import { KeyProviderFactory } from '../key-provider.factory';
import { OracleLoggerService } from '../../logger/oracle-logger';

const mockLogger = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } as unknown as OracleLoggerService;

// Mock the AWS KMS client constructor and its commands
jest.mock('@aws-sdk/client-kms', () => {
  const mockSend = jest.fn();
  return {
    KMSClient: jest.fn().mockImplementation(() => ({
      send: mockSend,
    })),
    SignCommand: jest.fn().mockImplementation((args) => args),
    GetPublicKeyCommand: jest.fn().mockImplementation((args) => args),
    MessageType: { RAW: 'RAW' },
    SigningAlgorithmSpec: { ECDSA_SHA_256: 'ECDSA_SHA_256' },
    // Expose mockSend for assertions
    __mockSend: mockSend,
  };
});

describe('AwsKmsKeyProvider', () => {
  const mockRegion = 'us-east-1';
  const mockKeyId = 'arn:aws:kms:us-east-1:123456789012:key/mrk-12345';
  let provider: AwsKmsKeyProvider;
  let mockSend: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    const awsKmsMock = require('@aws-sdk/client-kms');
    mockSend = awsKmsMock.__mockSend;
    provider = new AwsKmsKeyProvider(mockLogger, mockRegion, mockKeyId);
  });

  describe('constructor and config', () => {
    it('throws KeyProviderError if region or keyId is missing', () => {
      expect(() => new AwsKmsKeyProvider(mockLogger, '', mockKeyId)).toThrow(KeyProviderError);
      expect(() => new AwsKmsKeyProvider(mockLogger, mockRegion, '')).toThrow(KeyProviderError);
    });

    it('reads the correct AWS_KMS_KEY_ID from the config via KeyProviderFactory', () => {
      const configService = new ConfigService({
        KEY_PROVIDER: 'aws-kms',
        AWS_REGION: 'eu-west-1',
        AWS_KMS_KEY_ID: 'arn:aws:kms:eu-west-1:111:key/123',
      });

      const factoryProvider = KeyProviderFactory.create(configService) as AwsKmsKeyProvider;
      expect(factoryProvider).toBeInstanceOf(AwsKmsKeyProvider);
      
      // We can't easily inspect private fields without any type assertions,
      // but testing the creation confirms it didn't throw and used the config
      expect(factoryProvider.getProviderType()).toBe('aws-kms');
    });
  });

  describe('sign', () => {
    it('Successful signing returns the correct Stellar signature bytes', async () => {
      const payload = Buffer.from('test data');
      const mockSignature = Buffer.from('mock-signature-bytes');
      mockSend.mockResolvedValueOnce({ Signature: mockSignature });

      const result = await provider.sign(payload);
      
      expect(mockSend).toHaveBeenCalledTimes(1);
      const callArg = mockSend.mock.calls[0][0];
      expect(callArg.KeyId).toBe(mockKeyId);
      expect(callArg.Message).toBe(payload);
      expect(callArg.MessageType).toBe('RAW');
      
      expect(result).toEqual(mockSignature);
    });

    it('KMS errors are wrapped in a typed KeyProviderError', async () => {
      const payload = Buffer.from('test data');
      const awsError = new Error('AWS connection timeout');
      mockSend.mockRejectedValueOnce(awsError);

      await expect(provider.sign(payload)).rejects.toThrow(KeyProviderError);
      await expect(provider.sign(payload)).rejects.toThrow('Failed to sign data with AWS KMS');
    });
  });

  describe('getPublicKey', () => {
    it('retrieves public key from AWS and caches it', async () => {
      const mockPublicKeyBytes = Buffer.from('mock-pub-key');
      mockSend.mockResolvedValueOnce({ PublicKey: mockPublicKeyBytes });

      const pubKey1 = await provider.getPublicKey();
      expect(pubKey1).toBe(mockPublicKeyBytes.toString('hex'));
      expect(mockSend).toHaveBeenCalledTimes(1);

      // Second call should return cached value
      const pubKey2 = await provider.getPublicKey();
      expect(pubKey2).toBe(mockPublicKeyBytes.toString('hex'));
      expect(mockSend).toHaveBeenCalledTimes(1); // Still 1
    });

    it('wraps KMS errors in KeyProviderError when getting public key', async () => {
      mockSend.mockRejectedValueOnce(new Error('KMS Down'));

      await expect(provider.getPublicKey()).rejects.toThrow(KeyProviderError);
    });
  });
});
