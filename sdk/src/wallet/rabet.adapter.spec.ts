import { RabetAdapter } from './rabet.adapter';
import { WalletName } from './wallet.interface';
import { TikkaSdkError, TikkaSdkErrorCode } from '../utils/errors';
import { Networks } from '@stellar/stellar-sdk';

describe('RabetAdapter', () => {
  let adapter: RabetAdapter;
  let mockRabet: any;

  beforeEach(() => {
    // Mock window.rabet
    mockRabet = {
      connect: jest.fn(),
      sign: jest.fn(),
      disconnect: jest.fn(),
      isUnlocked: jest.fn(),
      close: jest.fn(),
      on: jest.fn(),
    };

    (globalThis as any).rabet = mockRabet;

    adapter = new RabetAdapter({
      networkPassphrase: Networks.TESTNET,
    });
  });

  afterEach(() => {
    delete (globalThis as any).rabet;
    jest.clearAllMocks();
  });

  describe('name', () => {
    it('should return correct wallet name', () => {
      expect(adapter.name).toBe(WalletName.Rabet);
    });
  });

  describe('isAvailable', () => {
    it('should return true when Rabet is installed', () => {
      (globalThis as any).rabet = mockRabet;
      expect(adapter.isAvailable()).toBe(true);
    });

    it('should return false when Rabet is not installed', () => {
      delete (globalThis as any).rabet;
      expect(adapter.isAvailable()).toBe(false);
    });
  });

  describe('getPublicKey', () => {
    it('should return public key string', async () => {
      const expectedAddress = 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
      mockRabet.connect.mockResolvedValue({ publicKey: expectedAddress });

      const publicKey = await adapter.getPublicKey();

      expect(publicKey).toBe(expectedAddress);
      expect(mockRabet.connect).toHaveBeenCalledTimes(1);
    });

    it('should throw WalletNotInstalled error when Rabet is not available', async () => {
      delete (globalThis as any).rabet;
      const freshAdapter = new RabetAdapter();

      await expect(freshAdapter.getPublicKey()).rejects.toThrow(TikkaSdkError);
      await expect(freshAdapter.getPublicKey()).rejects.toMatchObject({
        code: TikkaSdkErrorCode.WalletNotInstalled,
        message: expect.stringContaining('Rabet wallet extension is not installed'),
      });
    });

    it('should throw error when connect returns error', async () => {
      mockRabet.connect.mockResolvedValue({ 
        publicKey: '', 
        error: 'User rejected connection' 
      });

      await expect(adapter.getPublicKey()).rejects.toThrow(TikkaSdkError);
    });

    it('should throw UserRejected error when user declines', async () => {
      mockRabet.connect.mockRejectedValue(new Error('User rejected the request'));

      await expect(adapter.getPublicKey()).rejects.toThrow(TikkaSdkError);
      await expect(adapter.getPublicKey()).rejects.toMatchObject({
        code: TikkaSdkErrorCode.UserRejected,
        message: 'User rejected public key request',
      });
    });

    it('should throw Unknown error for other failures', async () => {
      mockRabet.connect.mockRejectedValue(new Error('Network error'));

      await expect(adapter.getPublicKey()).rejects.toThrow(TikkaSdkError);
      await expect(adapter.getPublicKey()).rejects.toMatchObject({
        code: TikkaSdkErrorCode.Unknown,
        message: expect.stringContaining('Rabet getPublicKey failed'),
      });
    });
  });

  describe('signTransaction', () => {
    const mockXdr = 'AAAAAgAAAABqxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxQ==';
    const mockSignedXdr = 'AAAAAgAAAABqyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyQ==';

    it('should sign transaction and return signed XDR', async () => {
      mockRabet.sign.mockResolvedValue({ xdr: mockSignedXdr });

      const result = await adapter.signTransaction(mockXdr);

      expect(result.signedXdr).toBe(mockSignedXdr);
      expect(mockRabet.sign).toHaveBeenCalledWith(mockXdr, Networks.TESTNET);
    });

    it('should use provided network passphrase', async () => {
      mockRabet.sign.mockResolvedValue({ xdr: mockSignedXdr });

      await adapter.signTransaction(mockXdr, {
        networkPassphrase: Networks.PUBLIC,
      });

      expect(mockRabet.sign).toHaveBeenCalledWith(mockXdr, Networks.PUBLIC);
    });

    it('should throw error when network passphrase is not provided', async () => {
      const adapterWithoutNetwork = new RabetAdapter();

      await expect(adapterWithoutNetwork.signTransaction(mockXdr)).rejects.toThrow(TikkaSdkError);
      await expect(adapterWithoutNetwork.signTransaction(mockXdr)).rejects.toMatchObject({
        code: TikkaSdkErrorCode.InvalidParams,
        message: 'Network passphrase is required for Rabet transaction signing',
      });
    });

    it('should throw WalletNotInstalled error when Rabet is not available', async () => {
      delete (globalThis as any).rabet;
      const freshAdapter = new RabetAdapter({ networkPassphrase: Networks.TESTNET });

      await expect(freshAdapter.signTransaction(mockXdr)).rejects.toThrow(TikkaSdkError);
      await expect(freshAdapter.signTransaction(mockXdr)).rejects.toMatchObject({
        code: TikkaSdkErrorCode.WalletNotInstalled,
      });
    });

    it('should throw error when sign returns error', async () => {
      mockRabet.sign.mockResolvedValue({ 
        xdr: '', 
        error: 'User rejected signing' 
      });

      await expect(adapter.signTransaction(mockXdr)).rejects.toThrow(TikkaSdkError);
    });

    it('should throw UserRejected error when user cancels', async () => {
      mockRabet.sign.mockRejectedValue(new Error('User rejected the transaction'));

      await expect(adapter.signTransaction(mockXdr)).rejects.toThrow(TikkaSdkError);
      await expect(adapter.signTransaction(mockXdr)).rejects.toMatchObject({
        code: TikkaSdkErrorCode.UserRejected,
        message: 'User rejected transaction signing',
      });
    });

    it('should map user declined error to UserRejected', async () => {
      mockRabet.sign.mockRejectedValue(new Error('User declined to sign'));

      await expect(adapter.signTransaction(mockXdr)).rejects.toMatchObject({
        code: TikkaSdkErrorCode.UserRejected,
      });
    });

    it('should map cancelled error to UserRejected', async () => {
      mockRabet.sign.mockRejectedValue(new Error('Transaction cancelled by user'));

      await expect(adapter.signTransaction(mockXdr)).rejects.toMatchObject({
        code: TikkaSdkErrorCode.UserRejected,
      });
    });

    it('should map denied error to UserRejected', async () => {
      mockRabet.sign.mockRejectedValue(new Error('Access denied'));

      await expect(adapter.signTransaction(mockXdr)).rejects.toMatchObject({
        code: TikkaSdkErrorCode.UserRejected,
      });
    });

    it('should throw Unknown error for other failures', async () => {
      mockRabet.sign.mockRejectedValue(new Error('Invalid XDR'));

      await expect(adapter.signTransaction(mockXdr)).rejects.toThrow(TikkaSdkError);
      await expect(adapter.signTransaction(mockXdr)).rejects.toMatchObject({
        code: TikkaSdkErrorCode.Unknown,
        message: expect.stringContaining('Rabet signTransaction failed'),
      });
    });
  });

  describe('signMessage', () => {
    it('should throw error as Rabet does not support signMessage', async () => {
      const message = 'Sign this message';

      await expect(adapter.signMessage(message)).rejects.toThrow(
        'rabet does not support signMessage',
      );
    });
  });

  describe('getNetwork', () => {
    it('should return network passphrase from adapter options', async () => {
      const network = await adapter.getNetwork();

      expect(network).toBe(Networks.TESTNET);
    });

    it('should return undefined when no network is configured', async () => {
      const adapterWithoutNetwork = new RabetAdapter();
      const network = await adapterWithoutNetwork.getNetwork();

      expect(network).toBeUndefined();
    });

    it('should return public network passphrase', async () => {
      const publicAdapter = new RabetAdapter({ networkPassphrase: Networks.PUBLIC });
      const network = await publicAdapter.getNetwork();

      expect(network).toBe(Networks.PUBLIC);
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
      mockRabet.sign.mockResolvedValue({ xdr: mockSignedXdr });

      const result = await adapter.signTransaction('mockXdr');

      expect(result).toHaveProperty('signedXdr');
      expect(typeof result.signedXdr).toBe('string');
    });
  });

  describe('error mapping consistency', () => {
    it('should map user rejected errors consistently', async () => {
      // Test getPublicKey
      mockRabet.connect.mockRejectedValueOnce(new Error('User rejected'));
      await expect(adapter.getPublicKey()).rejects.toMatchObject({
        code: TikkaSdkErrorCode.UserRejected,
      });

      // Test signTransaction
      mockRabet.sign.mockRejectedValueOnce(new Error('User rejected'));
      await expect(adapter.signTransaction('xdr')).rejects.toMatchObject({
        code: TikkaSdkErrorCode.UserRejected,
      });
    });

    it('should map cancelled errors consistently', async () => {
      // Test getPublicKey
      mockRabet.connect.mockRejectedValueOnce(new Error('Cancelled by user'));
      await expect(adapter.getPublicKey()).rejects.toMatchObject({
        code: TikkaSdkErrorCode.UserRejected,
      });

      // Test signTransaction
      mockRabet.sign.mockRejectedValueOnce(new Error('Cancelled'));
      await expect(adapter.signTransaction('xdr')).rejects.toMatchObject({
        code: TikkaSdkErrorCode.UserRejected,
      });
    });

    it('should map denied errors consistently', async () => {
      // Test getPublicKey
      mockRabet.connect.mockRejectedValueOnce(new Error('Access denied'));
      await expect(adapter.getPublicKey()).rejects.toMatchObject({
        code: TikkaSdkErrorCode.UserRejected,
      });

      // Test signTransaction
      mockRabet.sign.mockRejectedValueOnce(new Error('Denied'));
      await expect(adapter.signTransaction('xdr')).rejects.toMatchObject({
        code: TikkaSdkErrorCode.UserRejected,
      });
    });
  });

  describe('Rabet-specific behavior', () => {
    it('should handle connect result with error field', async () => {
      mockRabet.connect.mockResolvedValue({
        publicKey: '',
        error: 'Connection timeout',
      });

      await expect(adapter.getPublicKey()).rejects.toThrow('Connection timeout');
    });

    it('should handle sign result with error field', async () => {
      mockRabet.sign.mockResolvedValue({
        xdr: '',
        error: 'Signing failed',
      });

      await expect(adapter.signTransaction('xdr')).rejects.toThrow('Signing failed');
    });

    it('should work with valid connect response', async () => {
      const publicKey = 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
      mockRabet.connect.mockResolvedValue({ publicKey });

      const result = await adapter.getPublicKey();

      expect(result).toBe(publicKey);
    });

    it('should work with valid sign response', async () => {
      const signedXdr = 'AAAAAgAAAABqyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyQ==';
      mockRabet.sign.mockResolvedValue({ xdr: signedXdr });

      const result = await adapter.signTransaction('mockXdr');

      expect(result.signedXdr).toBe(signedXdr);
    });
  });
});
