import { GcpKmsKeyProvider } from './gcp-kms-key.provider';
import { OracleLoggerService } from '../../logger/oracle-logger';

const mockLogger = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } as unknown as OracleLoggerService;
const mockGetPublicKey = jest.fn();
const mockAsymmetricSign = jest.fn();
const mockGetCryptoKeyVersion = jest.fn();

jest.mock('@google-cloud/kms', () => {
  return {
    KeyManagementServiceClient: jest.fn().mockImplementation(() => {
      return {
        getPublicKey: mockGetPublicKey,
        asymmetricSign: mockAsymmetricSign,
        getCryptoKeyVersion: mockGetCryptoKeyVersion,
      };
    }),
  };
});

describe('GcpKmsKeyProvider', () => {
  let provider: GcpKmsKeyProvider;
  const testKeyPath = 'projects/test-project/locations/global/keyRings/test-ring/cryptoKeys/test-key/cryptoKeyVersions/1';

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new GcpKmsKeyProvider(mockLogger, 'test-project', testKeyPath);
  });

  describe('initialization', () => {
    it('throws error if project ID or key path are missing', () => {
      expect(() => new GcpKmsKeyProvider(mockLogger, '', 'key-path')).toThrow();
      expect(() => new GcpKmsKeyProvider(mockLogger, 'project', '')).toThrow();
    });
  });

  describe('getPublicKey / getPublicKeyBuffer', () => {
    it('loads and parses the public key successfully', async () => {
      const pemKey = `-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\n-----END PUBLIC KEY-----`;
      mockGetPublicKey.mockResolvedValue([{ pem: pemKey }]);

      const pubKeyString = await provider.getPublicKey();
      expect(mockGetPublicKey).toHaveBeenCalledWith({
        name: testKeyPath,
      });
      expect(pubKeyString).toBeDefined();

      const buffer = await provider.getPublicKeyBuffer();
      expect(buffer).toBeInstanceOf(Buffer);
    });

    it('caches the public key', async () => {
      const pemKey = `-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\n-----END PUBLIC KEY-----`;
      mockGetPublicKey.mockResolvedValue([{ pem: pemKey }]);

      await provider.getPublicKey();
      await provider.getPublicKey(); // Should use cache
      expect(mockGetPublicKey).toHaveBeenCalledTimes(1);
    });

    it('throws error if getPublicKey fails', async () => {
      mockGetPublicKey.mockRejectedValue(new Error('Network error'));
      await expect(provider.getPublicKey()).rejects.toThrow('Failed to retrieve public key from GCP KMS');
    });
  });

  describe('sign', () => {
    it('signs data successfully', async () => {
      const mockSignature = Buffer.from('test-signature');
      mockAsymmetricSign.mockResolvedValue([{ signature: mockSignature }]);

      const dataToSign = Buffer.from('test-data');
      const signature = await provider.sign(dataToSign);

      expect(mockAsymmetricSign).toHaveBeenCalledWith({
        name: testKeyPath,
        data: dataToSign,
      });
      expect(signature).toEqual(mockSignature);
    });

    it('throws error if asymmetricSign fails', async () => {
      mockAsymmetricSign.mockRejectedValue(new Error('Signing error'));
      const dataToSign = Buffer.from('test-data');
      await expect(provider.sign(dataToSign)).rejects.toThrow('Failed to sign data with GCP KMS');
    });
  });

  describe('getProviderHealth', () => {
    it('returns healthy when getCryptoKeyVersion succeeds', async () => {
      mockGetCryptoKeyVersion.mockResolvedValue([{ name: testKeyPath }]);
      const health = await provider.getProviderHealth();
      expect(health.status).toBe('healthy');
      expect(health.activeKeyId).toBe(testKeyPath);
    });

    it('returns permission_denied when IAM fails', async () => {
      const error: any = new Error('7 PERMISSION_DENIED');
      error.code = 7;
      mockGetCryptoKeyVersion.mockRejectedValue(error);
      const health = await provider.getProviderHealth();
      expect(health.status).toBe('permission_denied');
    });

    it('returns unavailable when network fails', async () => {
      const error: any = new Error('14 UNAVAILABLE');
      error.code = 14;
      mockGetCryptoKeyVersion.mockRejectedValue(error);
      const health = await provider.getProviderHealth();
      expect(health.status).toBe('unavailable');
    });
  });
});
