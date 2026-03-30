import { FreighterAdapter } from './freighter.adapter';
import { WalletName } from './wallet.interface';
import { TikkaSdkError, TikkaSdkErrorCode } from '../utils/errors';
import { Networks } from '@stellar/stellar-sdk';

// Mock the @stellar/freighter-api module
jest.mock('@stellar/freighter-api', () => {
  const mockApi = {
    getAddress: jest.fn(),
    signTransaction: jest.fn(),
    signMessage: jest.fn(),
    getNetworkDetails: jest.fn(),
  };
  return mockApi;
}, { virtual: true });

describe('FreighterAdapter', () => {
  let adapter: FreighterAdapter;
  let mockFreighterApi: any;

  beforeEach(async () => {
    // Get the mocked module
    mockFreighterApi = await import('@stellar/freighter-api');
    
    // Reset all mocks
    jest.clearAllMocks();
    
    // Mock window.freighter as well (fallback)
    (globalThis as any).freighter = mockFreighterApi;

    adapter = new FreighterAdapter({
      networkPassphrase: Networks.TESTNET,
    });
  });

  afterEach(() => {
    delete (globalThis as any).freighter;
  });

  describe('name', () => {
    it('should return correct wallet name', () => {
      expect(adapter.name).toBe(WalletName.Freighter);
    });
  });

  describe('isAvailable', () => {
    it('should return true when Freighter is installed', () => {
      (globalThis as any).freighter = {};
      expect(adapter.isAvailable()).toBe(true);
    });

    it('should return false when Freighter is not installed', () => {
      delete (globalThis as any).freighter;
      expect(adapter.isAvailable()).toBe(false);
    });
  });

  describe('getPublicKey', () => {
    it('should return public key string', async () => {
      const expectedAddress = 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
      mockFreighterApi.getAddress.mockResolvedValue({ address: expectedAddress });

      const publicKey = await adapter.getPublicKey();

      expect(publicKey).toBe(expectedAddress);
      expect(mockFreighterApi.getAddress).toHaveBeenCalledTimes(1);
    });

    it('should throw WalletNotInstalled error when Freighter is not available', async () => {
      delete (globalThis as any).freighter;
      const freshAdapter = new FreighterAdapter();

      await expect(freshAdapter.getPublicKey()).rejects.toThrow(TikkaSdkError);
      await expect(freshAdapter.getPublicKey()).rejects.toMatchObject({
        code: TikkaSdkErrorCode.WalletNotInstalled,
        message: expect.stringContaining('Freighter wallet extension is not installed'),
      });
    });

    it('should throw UserRejected error when user declines', async () => {
      mockFreighterApi.getAddress.mockRejectedValue(new Error('User declined to share public key'));

      await expect(adapter.getPublicKey()).rejects.toThrow(TikkaSdkError);
      await expect(adapter.getPublicKey()).rejects.toMatchObject({
        code: TikkaSdkErrorCode.UserRejected,
        message: 'User rejected public key request',
      });
    });

    it('should throw Unknown error for other failures', async () => {
      mockFreighterApi.getAddress.mockRejectedValue(new Error('Network error'));

      await expect(adapter.getPublicKey()).rejects.toThrow(TikkaSdkError);
      await expect(adapter.getPublicKey()).rejects.toMatchObject({
        code: TikkaSdkErrorCode.Unknown,
        message: expect.stringContaining('Freighter getPublicKey failed'),
      });
    });
  });

  describe('signTransaction', () => {
    const mockXdr = 'AAAAAgAAAABqxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxQ==';
    const mockSignedXdr = 'AAAAAgAAAABqyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyQ==';

    it('should sign transaction and return signed XDR', async () => {
      mockFreighterApi.signTransaction.mockResolvedValue({ signedTxXdr: mockSignedXdr });

      const result = await adapter.signTransaction(mockXdr);

      expect(result.signedXdr).toBe(mockSignedXdr);
      expect(mockFreighterApi.signTransaction).toHaveBeenCalledWith(mockXdr, {
        networkPassphrase: Networks.TESTNET,
        accountToSign: undefined,
      });
    });

    it('should use provided network passphrase', async () => {
      mockFreighterApi.signTransaction.mockResolvedValue({ signedTxXdr: mockSignedXdr });

      await adapter.signTransaction(mockXdr, {
        networkPassphrase: Networks.PUBLIC,
      });

      expect(mockFreighterApi.signTransaction).toHaveBeenCalledWith(mockXdr, {
        networkPassphrase: Networks.PUBLIC,
        accountToSign: undefined,
      });
    });

    it('should pass accountToSign parameter', async () => {
      const accountToSign = 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
      mockFreighterApi.signTransaction.mockResolvedValue({ signedTxXdr: mockSignedXdr });

      await adapter.signTransaction(mockXdr, {
        accountToSign,
      });

      expect(mockFreighterApi.signTransaction).toHaveBeenCalledWith(mockXdr, {
        networkPassphrase: Networks.TESTNET,
        accountToSign,
      });
    });

    it('should throw WalletNotInstalled error when Freighter is not available', async () => {
      delete (globalThis as any).freighter;
      const freshAdapter = new FreighterAdapter();

      await expect(freshAdapter.signTransaction(mockXdr)).rejects.toThrow(TikkaSdkError);
      await expect(freshAdapter.signTransaction(mockXdr)).rejects.toMatchObject({
        code: TikkaSdkErrorCode.WalletNotInstalled,
      });
    });

    it('should throw UserRejected error when user cancels', async () => {
      mockFreighterApi.signTransaction.mockRejectedValue(new Error('User rejected the transaction'));

      await expect(adapter.signTransaction(mockXdr)).rejects.toThrow(TikkaSdkError);
      await expect(adapter.signTransaction(mockXdr)).rejects.toMatchObject({
        code: TikkaSdkErrorCode.UserRejected,
        message: 'User rejected transaction signing',
      });
    });

    it('should map user declined error to UserRejected', async () => {
      mockFreighterApi.signTransaction.mockRejectedValue(new Error('User declined to sign'));

      await expect(adapter.signTransaction(mockXdr)).rejects.toMatchObject({
        code: TikkaSdkErrorCode.UserRejected,
      });
    });

    it('should map cancelled error to UserRejected', async () => {
      mockFreighterApi.signTransaction.mockRejectedValue(new Error('Transaction cancelled by user'));

      await expect(adapter.signTransaction(mockXdr)).rejects.toMatchObject({
        code: TikkaSdkErrorCode.UserRejected,
      });
    });

    it('should throw Unknown error for other failures', async () => {
      mockFreighterApi.signTransaction.mockRejectedValue(new Error('Invalid XDR'));

      await expect(adapter.signTransaction(mockXdr)).rejects.toThrow(TikkaSdkError);
      await expect(adapter.signTransaction(mockXdr)).rejects.toMatchObject({
        code: TikkaSdkErrorCode.Unknown,
        message: expect.stringContaining('Freighter signTransaction failed'),
      });
    });
  });

  describe('signMessage', () => {
    const mockMessage = 'Sign this message for authentication';
    const mockSignedMessage = 'signed_message_base64';

    it('should sign message and return signature', async () => {
      mockFreighterApi.signMessage = jest.fn().mockResolvedValue({ signedMessage: mockSignedMessage });

      const signature = await adapter.signMessage(mockMessage);

      expect(signature).toBe(mockSignedMessage);
      expect(mockFreighterApi.signMessage).toHaveBeenCalledWith(mockMessage);
    });

    it('should throw error when signMessage is not supported', async () => {
      delete mockFreighterApi.signMessage;

      await expect(adapter.signMessage(mockMessage)).rejects.toThrow(
        'signMessage not supported by this Freighter version',
      );
    });

    it('should throw UserRejected error when user declines', async () => {
      mockFreighterApi.signMessage = jest.fn().mockRejectedValue(new Error('User rejected message signing'));

      await expect(adapter.signMessage(mockMessage)).rejects.toMatchObject({
        code: TikkaSdkErrorCode.UserRejected,
        message: 'User rejected message signing',
      });
    });

    it('should throw WalletNotInstalled error when Freighter is not available', async () => {
      delete (globalThis as any).freighter;
      const freshAdapter = new FreighterAdapter();

      await expect(freshAdapter.signMessage(mockMessage)).rejects.toMatchObject({
        code: TikkaSdkErrorCode.WalletNotInstalled,
      });
    });
  });

  describe('getNetwork', () => {
    it('should return network passphrase from wallet', async () => {
      mockFreighterApi.getNetworkDetails.mockResolvedValue({ networkPassphrase: Networks.PUBLIC });

      const network = await adapter.getNetwork();

      expect(network).toBe(Networks.PUBLIC);
      expect(mockFreighterApi.getNetworkDetails).toHaveBeenCalledTimes(1);
    });

    it('should return undefined on error', async () => {
      mockFreighterApi.getNetworkDetails.mockRejectedValue(new Error('Failed to get network'));

      const network = await adapter.getNetwork();

      expect(network).toBeUndefined();
    });

    it('should return testnet passphrase', async () => {
      mockFreighterApi.getNetworkDetails.mockResolvedValue({ networkPassphrase: Networks.TESTNET });

      const network = await adapter.getNetwork();

      expect(network).toBe(Networks.TESTNET);
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
      mockFreighterApi.signTransaction.mockResolvedValue({ signedTxXdr: mockSignedXdr });

      const result = await adapter.signTransaction('mockXdr');

      expect(result).toHaveProperty('signedXdr');
      expect(typeof result.signedXdr).toBe('string');
    });
  });

  describe('error mapping consistency', () => {
    it('should map user declined errors consistently', async () => {
      // Test getPublicKey
      mockFreighterApi.getAddress.mockRejectedValueOnce(new Error('User declined'));
      await expect(adapter.getPublicKey()).rejects.toMatchObject({
        code: TikkaSdkErrorCode.UserRejected,
      });

      // Test signTransaction
      mockFreighterApi.signTransaction.mockRejectedValueOnce(new Error('User declined'));
      await expect(adapter.signTransaction('xdr')).rejects.toMatchObject({
        code: TikkaSdkErrorCode.UserRejected,
      });
    });

    it('should map cancelled errors consistently', async () => {
      // Test getPublicKey
      mockFreighterApi.getAddress.mockRejectedValueOnce(new Error('Cancelled by user'));
      await expect(adapter.getPublicKey()).rejects.toMatchObject({
        code: TikkaSdkErrorCode.UserRejected,
      });

      // Test signTransaction
      mockFreighterApi.signTransaction.mockRejectedValueOnce(new Error('Cancelled'));
      await expect(adapter.signTransaction('xdr')).rejects.toMatchObject({
        code: TikkaSdkErrorCode.UserRejected,
      });
    });
  });
});
