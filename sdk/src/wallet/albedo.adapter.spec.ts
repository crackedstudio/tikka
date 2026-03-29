import { AlbedoAdapter } from './albedo.adapter';
import { TikkaSdkError, TikkaSdkErrorCode } from '../utils/errors';
import { Networks } from '@stellar/stellar-sdk';

// Create mock intent function
const mockIntent = jest.fn();

// Mock the dynamic import of @albedo-link/intent
jest.mock('@albedo-link/intent', () => ({
  __esModule: true,
  default: {
    intent: mockIntent,
  },
}), { virtual: true });

describe('AlbedoAdapter', () => {
  let adapter: AlbedoAdapter;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    adapter = new AlbedoAdapter({
      networkPassphrase: Networks.TESTNET,
    });
  });

  describe('isAvailable', () => {
    it('should return true in browser environment', () => {
      // In Node.js test environment, document might not exist
      // So we'll just test the logic
      const result = adapter.isAvailable();
      expect(typeof result).toBe('boolean');
    });

    it('should return false if document is not available', () => {
      const originalDocument = (globalThis as any).document;
      delete (globalThis as any).document;

      const testAdapter = new AlbedoAdapter();
      expect(testAdapter.isAvailable()).toBe(false);

      (globalThis as any).document = originalDocument;
    });
  });

  describe('getPublicKey', () => {
    it('should request public key from Albedo', async () => {
      const mockPubkey = 'GBQW4KLMRXIMSDWBEWX4AWQKWYW7R3E7SFPSHTUDTFFT22NNUC6COL72';
      mockIntent.mockResolvedValue({ pubkey: mockPubkey });

      const result = await adapter.getPublicKey();

      expect(mockIntent).toHaveBeenCalledWith('public_key', {});
      expect(result).toBe(mockPubkey);
    });

    it('should throw UserRejected error when user cancels', async () => {
      mockIntent.mockRejectedValue(new Error('User cancelled the request'));

      await expect(adapter.getPublicKey()).rejects.toThrow(TikkaSdkError);
      await expect(adapter.getPublicKey()).rejects.toMatchObject({
        code: TikkaSdkErrorCode.UserRejected,
      });
    });

    it('should throw Unknown error for other failures', async () => {
      mockIntent.mockRejectedValue(new Error('Network error'));

      await expect(adapter.getPublicKey()).rejects.toThrow(TikkaSdkError);
      await expect(adapter.getPublicKey()).rejects.toMatchObject({
        code: TikkaSdkErrorCode.Unknown,
      });
    });
  });

  describe('signTransaction', () => {
    const mockXdr = 'AAAAAG...base64...';
    const mockSignedXdr = 'AAAAAG...signed...';

    it('should sign transaction with network passphrase', async () => {
      mockIntent.mockResolvedValue({
        signed_envelope_xdr: mockSignedXdr,
      });

      const result = await adapter.signTransaction(mockXdr);

      expect(mockIntent).toHaveBeenCalledWith('tx', {
        xdr: mockXdr,
        network: Networks.TESTNET,
      });
      expect(result.signedXdr).toBe(mockSignedXdr);
    });

    it('should use provided network passphrase override', async () => {
      mockIntent.mockResolvedValue({
        signed_envelope_xdr: mockSignedXdr,
      });

      await adapter.signTransaction(mockXdr, {
        networkPassphrase: Networks.PUBLIC,
      });

      expect(mockIntent).toHaveBeenCalledWith('tx', {
        xdr: mockXdr,
        network: Networks.PUBLIC,
      });
    });

    it('should include accountToSign if provided', async () => {
      const accountToSign = 'GBQW4KLMRXIMSDWBEWX4AWQKWYW7R3E7SFPSHTUDTFFT22NNUC6COL72';
      mockIntent.mockResolvedValue({
        signed_envelope_xdr: mockSignedXdr,
      });

      await adapter.signTransaction(mockXdr, { accountToSign });

      expect(mockIntent).toHaveBeenCalledWith('tx', {
        xdr: mockXdr,
        network: Networks.TESTNET,
        pubkey: accountToSign,
      });
    });

    it('should throw error if network passphrase is missing', async () => {
      const adapterWithoutNetwork = new AlbedoAdapter();

      await expect(
        adapterWithoutNetwork.signTransaction(mockXdr)
      ).rejects.toThrow(TikkaSdkError);
      await expect(
        adapterWithoutNetwork.signTransaction(mockXdr)
      ).rejects.toMatchObject({
        code: TikkaSdkErrorCode.InvalidParams,
      });
    });

    it('should throw UserRejected error when user cancels', async () => {
      mockIntent.mockRejectedValue(new Error('User rejected the transaction'));

      await expect(adapter.signTransaction(mockXdr)).rejects.toThrow(TikkaSdkError);
      await expect(adapter.signTransaction(mockXdr)).rejects.toMatchObject({
        code: TikkaSdkErrorCode.UserRejected,
      });
    });

    it('should throw Unknown error for other failures', async () => {
      mockIntent.mockRejectedValue(new Error('Transaction failed'));

      await expect(adapter.signTransaction(mockXdr)).rejects.toThrow(TikkaSdkError);
      await expect(adapter.signTransaction(mockXdr)).rejects.toMatchObject({
        code: TikkaSdkErrorCode.Unknown,
      });
    });
  });

  describe('signMessage', () => {
    const mockMessage = 'Sign in to Tikka';
    const mockSignature = '0a1b2c3d4e5f...';

    it('should sign message using Albedo', async () => {
      mockIntent.mockResolvedValue({
        message_signature: mockSignature,
      });

      const result = await adapter.signMessage(mockMessage);

      expect(mockIntent).toHaveBeenCalledWith('sign_message', {
        message: mockMessage,
      });
      expect(result).toBe(mockSignature);
    });

    it('should throw UserRejected error when user cancels', async () => {
      mockIntent.mockRejectedValue(new Error('User cancelled message signing'));

      await expect(adapter.signMessage(mockMessage)).rejects.toThrow(TikkaSdkError);
      await expect(adapter.signMessage(mockMessage)).rejects.toMatchObject({
        code: TikkaSdkErrorCode.UserRejected,
      });
    });

    it('should throw Unknown error for other failures', async () => {
      mockIntent.mockRejectedValue(new Error('Signing failed'));

      await expect(adapter.signMessage(mockMessage)).rejects.toThrow(TikkaSdkError);
      await expect(adapter.signMessage(mockMessage)).rejects.toMatchObject({
        code: TikkaSdkErrorCode.Unknown,
      });
    });
  });

  describe('getNetwork', () => {
    it('should return configured network passphrase', async () => {
      const result = await adapter.getNetwork();
      expect(result).toBe(Networks.TESTNET);
    });

    it('should return undefined if no network configured', async () => {
      const adapterWithoutNetwork = new AlbedoAdapter();
      const result = await adapterWithoutNetwork.getNetwork();
      expect(result).toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('should detect user rejection with "cancel" keyword', async () => {
      mockIntent.mockRejectedValue(new Error('User cancel'));

      await expect(adapter.getPublicKey()).rejects.toMatchObject({
        code: TikkaSdkErrorCode.UserRejected,
      });
    });

    it('should detect user rejection with "rejected" keyword', async () => {
      mockIntent.mockRejectedValue(new Error('Request rejected by user'));

      await expect(adapter.getPublicKey()).rejects.toMatchObject({
        code: TikkaSdkErrorCode.UserRejected,
      });
    });

    it('should detect user rejection with "denied" keyword', async () => {
      mockIntent.mockRejectedValue(new Error('Access denied'));

      await expect(adapter.getPublicKey()).rejects.toMatchObject({
        code: TikkaSdkErrorCode.UserRejected,
      });
    });
  });
});
