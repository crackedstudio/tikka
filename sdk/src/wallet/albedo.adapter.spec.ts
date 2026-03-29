import { AlbedoAdapter } from './albedo.adapter';
import { WalletName } from './wallet.interface';
import { TikkaSdkError, TikkaSdkErrorCode } from '../utils/errors';
import { Networks } from '@stellar/stellar-sdk';

// Mock the @albedo-link/intent module
jest.mock('@albedo-link/intent', () => ({
  intent: jest.fn(),
}), { virtual: true });

describe('AlbedoAdapter', () => {
  let adapter: AlbedoAdapter;
  let mockAlbedoLib: any;

  beforeEach(() => {
    // Mock document to simulate browser environment
    (globalThis as any).document = {};

    adapter = new AlbedoAdapter({
      networkPassphrase: Networks.TESTNET,
    });

    // Get reference to the mocked intent function
    mockAlbedoLib = require('@albedo-link/intent');
  });

  afterEach(() => {
    delete (globalThis as any).document;
    jest.clearAllMocks();
  });

  describe('name', () => {
    it('should return correct wallet name', () => {
      expect(adapter.name).toBe(WalletName.Albedo);
    });
  });

  describe('isAvailable', () => {
    it('should return true in browser environment', () => {
      expect(adapter.isAvailable()).toBe(true);
    });

    it('should return false in non-browser environment', () => {
      delete (globalThis as any).document;
      const freshAdapter = new AlbedoAdapter();
      expect(freshAdapter.isAvailable()).toBe(false);
    });
  });

  describe('getPublicKey', () => {
    it('should return public key string', async () => {
      const expectedPubkey = 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
      mockAlbedoLib.intent.mockResolvedValue({ pubkey: expectedPubkey });

      const publicKey = await adapter.getPublicKey();

      expect(publicKey).toBe(expectedPubkey);
      expect(mockAlbedoLib.intent).toHaveBeenCalledWith('public_key', {});
    });

    it('should throw UserRejected error when user cancels', async () => {
      mockAlbedoLib.intent.mockRejectedValue(new Error('User cancelled the request'));

      await expect(adapter.getPublicKey()).rejects.toThrow(TikkaSdkError);
      await expect(adapter.getPublicKey()).rejects.toMatchObject({
        code: TikkaSdkErrorCode.UserRejected,
        message: 'User rejected Albedo request',
      });
    });

    it('should throw UserRejected error when user rejects', async () => {
      mockAlbedoLib.intent.mockRejectedValue(new Error('Request rejected by user'));

      await expect(adapter.getPublicKey()).rejects.toMatchObject({
        code: TikkaSdkErrorCode.UserRejected,
      });
    });

    it('should throw Unknown error for other failures', async () => {
      mockAlbedoLib.intent.mockRejectedValue(new Error('Network error'));

      await expect(adapter.getPublicKey()).rejects.toThrow(TikkaSdkError);
      await expect(adapter.getPublicKey()).rejects.toMatchObject({
        code: TikkaSdkErrorCode.Unknown,
        message: expect.stringContaining('Albedo getPublicKey failed'),
      });
    });
  });

  describe('signTransaction', () => {
    const mockXdr = 'AAAAAgAAAABqxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxQ==';
    const mockSignedXdr = 'AAAAAgAAAABqyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyQ==';

    it('should sign transaction and return signed XDR', async () => {
      mockAlbedoLib.intent.mockResolvedValue({ signed_envelope_xdr: mockSignedXdr });

      const result = await adapter.signTransaction(mockXdr);

      expect(result.signedXdr).toBe(mockSignedXdr);
      expect(mockAlbedoLib.intent).toHaveBeenCalledWith('tx', {
        xdr: mockXdr,
        network: Networks.TESTNET,
      });
    });

    it('should use provided network passphrase', async () => {
      mockAlbedoLib.intent.mockResolvedValue({ signed_envelope_xdr: mockSignedXdr });

      await adapter.signTransaction(mockXdr, {
        networkPassphrase: Networks.PUBLIC,
      });

      expect(mockAlbedoLib.intent).toHaveBeenCalledWith('tx', {
        xdr: mockXdr,
        network: Networks.PUBLIC,
      });
    });

    it('should use default network passphrase from options', async () => {
      mockAlbedoLib.intent.mockResolvedValue({ signed_envelope_xdr: mockSignedXdr });

      await adapter.signTransaction(mockXdr);

      expect(mockAlbedoLib.intent).toHaveBeenCalledWith('tx', {
        xdr: mockXdr,
        network: Networks.TESTNET,
      });
    });

    it('should throw UserRejected error when user cancels', async () => {
      mockAlbedoLib.intent.mockRejectedValue(new Error('User cancelled transaction'));

      await expect(adapter.signTransaction(mockXdr)).rejects.toThrow(TikkaSdkError);
      await expect(adapter.signTransaction(mockXdr)).rejects.toMatchObject({
        code: TikkaSdkErrorCode.UserRejected,
        message: 'User rejected transaction signing',
      });
    });

    it('should throw UserRejected error when user rejects', async () => {
      mockAlbedoLib.intent.mockRejectedValue(new Error('Transaction rejected'));

      await expect(adapter.signTransaction(mockXdr)).rejects.toMatchObject({
        code: TikkaSdkErrorCode.UserRejected,
      });
    });

    it('should throw Unknown error for other failures', async () => {
      mockAlbedoLib.intent.mockRejectedValue(new Error('Invalid XDR format'));

      await expect(adapter.signTransaction(mockXdr)).rejects.toThrow(TikkaSdkError);
      await expect(adapter.signTransaction(mockXdr)).rejects.toMatchObject({
        code: TikkaSdkErrorCode.Unknown,
        message: expect.stringContaining('Albedo signTransaction failed'),
      });
    });
  });

  describe('getNetwork', () => {
    it('should return undefined (not implemented)', async () => {
      const network = await adapter.getNetwork();
      expect(network).toBeUndefined();
    });
  });

  describe('signMessage', () => {
    it('should throw error (not supported)', async () => {
      await expect(adapter.signMessage('test message')).rejects.toThrow(
        'albedo does not support signMessage',
      );
    });
  });

  describe('interface consistency', () => {
    it('should have all required WalletAdapter methods', () => {
      expect(typeof adapter.isAvailable).toBe('function');
      expect(typeof adapter.getPublicKey).toBe('function');
      expect(typeof adapter.signTransaction).toBe('function');
      expect(typeof adapter.signMessage).toBe('function');
      expect(typeof adapter.getNetwork).toBe('function');
    });

    it('should have name property', () => {
      expect(adapter.name).toBeDefined();
      expect(typeof adapter.name).toBe('string');
    });

    it('should return SignTransactionResult with signedXdr property', async () => {
      const mockSignedXdr = 'AAAAAgAAAABqyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyQ==';
      mockAlbedoLib.intent.mockResolvedValue({ signed_envelope_xdr: mockSignedXdr });

      const result = await adapter.signTransaction('mockXdr');

      expect(result).toHaveProperty('signedXdr');
      expect(typeof result.signedXdr).toBe('string');
    });
  });

  describe('error mapping consistency', () => {
    it('should map cancel errors consistently', async () => {
      mockAlbedoLib.intent.mockRejectedValueOnce(new Error('User cancelled'));
      await expect(adapter.getPublicKey()).rejects.toMatchObject({
        code: TikkaSdkErrorCode.UserRejected,
      });

      mockAlbedoLib.intent.mockRejectedValueOnce(new Error('User cancelled'));
      await expect(adapter.signTransaction('xdr')).rejects.toMatchObject({
        code: TikkaSdkErrorCode.UserRejected,
      });
    });

    it('should map rejected errors consistently', async () => {
      mockAlbedoLib.intent.mockRejectedValueOnce(new Error('Request rejected'));
      await expect(adapter.getPublicKey()).rejects.toMatchObject({
        code: TikkaSdkErrorCode.UserRejected,
      });

      mockAlbedoLib.intent.mockRejectedValueOnce(new Error('Request rejected'));
      await expect(adapter.signTransaction('xdr')).rejects.toMatchObject({
        code: TikkaSdkErrorCode.UserRejected,
      });
    });

    it('should map denied errors consistently', async () => {
      mockAlbedoLib.intent.mockRejectedValueOnce(new Error('Access denied'));
      await expect(adapter.getPublicKey()).rejects.toMatchObject({
        code: TikkaSdkErrorCode.UserRejected,
      });

      mockAlbedoLib.intent.mockRejectedValueOnce(new Error('Access denied'));
      await expect(adapter.signTransaction('xdr')).rejects.toMatchObject({
        code: TikkaSdkErrorCode.UserRejected,
      });
    });
  });
});
