import { XBullAdapter } from './xbull.adapter';
import { WalletName } from './wallet.interface';
import { TikkaSdkError, TikkaSdkErrorCode } from '../utils/errors';
import { Networks } from '@stellar/stellar-sdk';

describe('XBullAdapter', () => {
  let adapter: XBullAdapter;
  let mockXBullSdk: any;

  beforeEach(() => {
    mockXBullSdk = {
      getPublicKey: jest.fn(),
      signTransaction: jest.fn(),
    };

    (globalThis as any).xbull = mockXBullSdk;

    adapter = new XBullAdapter({
      networkPassphrase: Networks.TESTNET,
    });
  });

  afterEach(() => {
    delete (globalThis as any).xbull;
  });

  describe('name', () => {
    it('should return correct wallet name', () => {
      expect(adapter.name).toBe(WalletName.XBull);
    });
  });

  describe('isAvailable', () => {
    it('should return true when xBull is installed', () => {
      expect(adapter.isAvailable()).toBe(true);
    });

    it('should return false when xBull is not installed', () => {
      delete (globalThis as any).xbull;
      expect(adapter.isAvailable()).toBe(false);
    });
  });

  describe('getPublicKey', () => {
    it('should return public key string', async () => {
      const expectedPublicKey = 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
      mockXBullSdk.getPublicKey.mockResolvedValue(expectedPublicKey);

      const publicKey = await adapter.getPublicKey();

      expect(publicKey).toBe(expectedPublicKey);
      expect(mockXBullSdk.getPublicKey).toHaveBeenCalledTimes(1);
    });

    it('should throw WalletNotInstalled error when xBull is not available', async () => {
      delete (globalThis as any).xbull;
      const freshAdapter = new XBullAdapter();

      await expect(freshAdapter.getPublicKey()).rejects.toThrow(TikkaSdkError);
      await expect(freshAdapter.getPublicKey()).rejects.toMatchObject({
        code: TikkaSdkErrorCode.WalletNotInstalled,
        message: expect.stringContaining('xBull wallet is not installed'),
      });
    });

    it('should throw UserRejected error when user cancels', async () => {
      mockXBullSdk.getPublicKey.mockRejectedValue(new Error('User cancelled the request'));

      await expect(adapter.getPublicKey()).rejects.toThrow(TikkaSdkError);
      await expect(adapter.getPublicKey()).rejects.toMatchObject({
        code: TikkaSdkErrorCode.UserRejected,
        message: 'User rejected xBull request',
      });
    });

    it('should throw Unknown error for other failures', async () => {
      mockXBullSdk.getPublicKey.mockRejectedValue(new Error('Network timeout'));

      await expect(adapter.getPublicKey()).rejects.toThrow(TikkaSdkError);
      await expect(adapter.getPublicKey()).rejects.toMatchObject({
        code: TikkaSdkErrorCode.Unknown,
        message: expect.stringContaining('xBull getPublicKey failed'),
      });
    });
  });

  describe('signTransaction', () => {
    const mockXdr = 'AAAAAgAAAABqxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxQ==';
    const mockSignedXdr = 'AAAAAgAAAABqyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyQ==';

    it('should sign transaction and return signed XDR', async () => {
      mockXBullSdk.signTransaction.mockResolvedValue(mockSignedXdr);

      const result = await adapter.signTransaction(mockXdr);

      expect(result.signedXdr).toBe(mockSignedXdr);
      expect(mockXBullSdk.signTransaction).toHaveBeenCalledWith(mockXdr, {
        networkPassphrase: Networks.TESTNET,
        accountToSign: undefined,
      });
    });

    it('should use provided network passphrase', async () => {
      mockXBullSdk.signTransaction.mockResolvedValue(mockSignedXdr);

      await adapter.signTransaction(mockXdr, {
        networkPassphrase: Networks.PUBLIC,
      });

      expect(mockXBullSdk.signTransaction).toHaveBeenCalledWith(mockXdr, {
        networkPassphrase: Networks.PUBLIC,
        accountToSign: undefined,
      });
    });

    it('should pass accountToSign parameter', async () => {
      const accountToSign = 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
      mockXBullSdk.signTransaction.mockResolvedValue(mockSignedXdr);

      await adapter.signTransaction(mockXdr, { accountToSign });

      expect(mockXBullSdk.signTransaction).toHaveBeenCalledWith(mockXdr, {
        networkPassphrase: Networks.TESTNET,
        accountToSign,
      });
    });

    it('should throw WalletNotInstalled error when xBull is not available', async () => {
      delete (globalThis as any).xbull;
      const freshAdapter = new XBullAdapter();

      await expect(freshAdapter.signTransaction(mockXdr)).rejects.toThrow(TikkaSdkError);
      await expect(freshAdapter.signTransaction(mockXdr)).rejects.toMatchObject({
        code: TikkaSdkErrorCode.WalletNotInstalled,
      });
    });

    it('should throw UserRejected error when user cancels', async () => {
      mockXBullSdk.signTransaction.mockRejectedValue(new Error('User cancelled transaction'));

      await expect(adapter.signTransaction(mockXdr)).rejects.toThrow(TikkaSdkError);
      await expect(adapter.signTransaction(mockXdr)).rejects.toMatchObject({
        code: TikkaSdkErrorCode.UserRejected,
        message: 'User rejected transaction signing',
      });
    });

    it('should throw Unknown error for other failures', async () => {
      mockXBullSdk.signTransaction.mockRejectedValue(new Error('Invalid transaction XDR'));

      await expect(adapter.signTransaction(mockXdr)).rejects.toThrow(TikkaSdkError);
      await expect(adapter.signTransaction(mockXdr)).rejects.toMatchObject({
        code: TikkaSdkErrorCode.Unknown,
        message: expect.stringContaining('xBull signTransaction failed'),
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
        'xbull does not support signMessage',
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
      mockXBullSdk.signTransaction.mockResolvedValue(mockSignedXdr);

      const result = await adapter.signTransaction('mockXdr');

      expect(result).toHaveProperty('signedXdr');
      expect(typeof result.signedXdr).toBe('string');
    });
  });

  describe('error mapping consistency', () => {
    it('should map cancel errors consistently', async () => {
      mockXBullSdk.getPublicKey.mockRejectedValueOnce(new Error('User cancelled'));
      await expect(adapter.getPublicKey()).rejects.toMatchObject({
        code: TikkaSdkErrorCode.UserRejected,
      });

      mockXBullSdk.signTransaction.mockRejectedValueOnce(new Error('User cancelled'));
      await expect(adapter.signTransaction('xdr')).rejects.toMatchObject({
        code: TikkaSdkErrorCode.UserRejected,
      });
    });

    it('should map rejected errors consistently', async () => {
      mockXBullSdk.getPublicKey.mockRejectedValueOnce(new Error('Request rejected'));
      await expect(adapter.getPublicKey()).rejects.toMatchObject({
        code: TikkaSdkErrorCode.UserRejected,
      });

      mockXBullSdk.signTransaction.mockRejectedValueOnce(new Error('Request rejected'));
      await expect(adapter.signTransaction('xdr')).rejects.toMatchObject({
        code: TikkaSdkErrorCode.UserRejected,
      });
    });

    it('should map denied errors consistently', async () => {
      mockXBullSdk.getPublicKey.mockRejectedValueOnce(new Error('Access denied'));
      await expect(adapter.getPublicKey()).rejects.toMatchObject({
        code: TikkaSdkErrorCode.UserRejected,
      });

      mockXBullSdk.signTransaction.mockRejectedValueOnce(new Error('Access denied'));
      await expect(adapter.signTransaction('xdr')).rejects.toMatchObject({
        code: TikkaSdkErrorCode.UserRejected,
      });
    });
  });
});
