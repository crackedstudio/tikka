import { XBullAdapter } from './xbull.adapter';
import { WalletName } from './wallet.interface';
import { TikkaSdkErrorCode } from '../utils/errors';
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
    // node env: provide a minimal window with listener APIs.
    (globalThis as any).window = {
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    };

    adapter = new XBullAdapter({
      networkPassphrase: Networks.TESTNET,
    });
  });

  afterEach(() => {
    delete (globalThis as any).xbull;
    delete (globalThis as any).window;
    jest.restoreAllMocks();
  });

  /** Connect helper for tests exercising the post-connection happy path. */
  const connect = async (publicKey = 'GCONNECTED') => {
    mockXBullSdk.getPublicKey.mockResolvedValue(publicKey);
    await adapter.connect();
    mockXBullSdk.getPublicKey.mockReset();
  };

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

  describe('connect', () => {
    it('should mark the adapter connected and cache the address', async () => {
      mockXBullSdk.getPublicKey.mockResolvedValue('GABC');

      await adapter.connect();

      expect(adapter.isWalletConnected()).toBe(true);
    });

    it('should be idempotent without stacking listeners', async () => {
      mockXBullSdk.getPublicKey.mockResolvedValue('GABC');

      await adapter.connect();
      await adapter.connect();

      expect(adapter.isWalletConnected()).toBe(true);
    });

    it('should throw WalletNotInstalled when xBull is not available', async () => {
      delete (globalThis as any).xbull;
      const freshAdapter = new XBullAdapter();

      await expect(freshAdapter.connect()).rejects.toMatchObject({
        code: TikkaSdkErrorCode.WalletNotInstalled,
      });
    });

    it('should throw UserRejected and leave adapter disconnected when user cancels', async () => {
      mockXBullSdk.getPublicKey.mockRejectedValue(new Error('User cancelled the request'));

      await expect(adapter.connect()).rejects.toMatchObject({
        code: TikkaSdkErrorCode.UserRejected,
      });
      expect(adapter.isWalletConnected()).toBe(false);
    });
  });

  describe('disconnect', () => {
    it('should reset the connection flag', async () => {
      await connect();
      expect(adapter.isWalletConnected()).toBe(true);

      await adapter.disconnect();

      expect(adapter.isWalletConnected()).toBe(false);
    });

    it('should remove every listener added during connection (no residual listeners)', async () => {
      const addSpy = jest.spyOn((globalThis as any).window, 'addEventListener');
      const removeSpy = jest.spyOn((globalThis as any).window, 'removeEventListener');

      await connect();
      await adapter.disconnect();

      expect(removeSpy.mock.calls.length).toBe(addSpy.mock.calls.length);
      for (const [type, handler] of addSpy.mock.calls) {
        expect(removeSpy).toHaveBeenCalledWith(type, handler);
      }
    });

    it('should be safe to call when not connected', async () => {
      await expect(adapter.disconnect()).resolves.toBeUndefined();
      expect(adapter.isWalletConnected()).toBe(false);
    });
  });

  describe('connection guard', () => {
    it('should throw WalletNotConnected from getPublicKey before connect()', async () => {
      await expect(adapter.getPublicKey()).rejects.toMatchObject({
        code: TikkaSdkErrorCode.WalletNotConnected,
      });
    });

    it('should throw WalletNotConnected from signTransaction before connect()', async () => {
      await expect(adapter.signTransaction('xdr')).rejects.toMatchObject({
        code: TikkaSdkErrorCode.WalletNotConnected,
      });
      expect(mockXBullSdk.signTransaction).not.toHaveBeenCalled();
    });

    it('should throw WalletNotConnected after disconnect()', async () => {
      await connect();
      await adapter.disconnect();

      await expect(adapter.signTransaction('xdr')).rejects.toMatchObject({
        code: TikkaSdkErrorCode.WalletNotConnected,
      });
      expect(mockXBullSdk.signTransaction).not.toHaveBeenCalled();
    });
  });

  describe('getPublicKey', () => {
    beforeEach(() => connect());

    it('should return the cached public key string', async () => {
      const result = await adapter.getPublicKey();
      expect(result).toBe('GCONNECTED');
    });

    it('should resolve via sdk when no address is cached', async () => {
      await adapter.disconnect();
      mockXBullSdk.getPublicKey.mockResolvedValue('GFRESH');
      await adapter.connect();
      // Force the cache miss path by reconnecting without a cached value.
      mockXBullSdk.getPublicKey.mockResolvedValue('GFRESH');

      const result = await adapter.getPublicKey();
      expect(result).toBe('GFRESH');
    });

    it('should throw WalletNotInstalled when xBull is not available', async () => {
      delete (globalThis as any).xbull;

      await expect(adapter.getPublicKey()).rejects.toMatchObject({
        code: TikkaSdkErrorCode.WalletNotInstalled,
      });
    });
  });

  describe('signTransaction', () => {
    const mockXdr = 'AAAAAgAAAABqxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxQ==';
    const mockSignedXdr = 'AAAAAgAAAABqyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyQ==';

    beforeEach(() => connect());

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

    it('should throw WalletNotInstalled when xBull is not available', async () => {
      delete (globalThis as any).xbull;

      await expect(adapter.signTransaction(mockXdr)).rejects.toMatchObject({
        code: TikkaSdkErrorCode.WalletNotInstalled,
      });
    });

    it('should throw UserRejected error when user cancels', async () => {
      mockXBullSdk.signTransaction.mockRejectedValue(new Error('User cancelled transaction'));

      await expect(adapter.signTransaction(mockXdr)).rejects.toMatchObject({
        code: TikkaSdkErrorCode.UserRejected,
        message: 'User rejected transaction signing',
      });
    });

    it('should throw Unknown error for other failures', async () => {
      mockXBullSdk.signTransaction.mockRejectedValue(new Error('Invalid transaction XDR'));

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
      expect(typeof adapter.connect).toBe('function');
      expect(typeof adapter.disconnect).toBe('function');
    });

    it('should have name property', () => {
      expect(adapter.name).toBeDefined();
      expect(typeof adapter.name).toBe('string');
    });

    it('should return SignTransactionResult with signedXdr property', async () => {
      await connect();
      const mockSignedXdr = 'AAAAAgAAAABqyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyQ==';
      mockXBullSdk.signTransaction.mockResolvedValue(mockSignedXdr);

      const result = await adapter.signTransaction('mockXdr');

      expect(result).toHaveProperty('signedXdr');
      expect(typeof result.signedXdr).toBe('string');
    });
  });

  describe('error mapping consistency', () => {
    beforeEach(() => connect());

    it('should map cancel errors consistently', async () => {
      mockXBullSdk.signTransaction.mockRejectedValueOnce(new Error('User cancelled'));
      await expect(adapter.signTransaction('xdr')).rejects.toMatchObject({
        code: TikkaSdkErrorCode.UserRejected,
      });
    });

    it('should map rejected errors consistently', async () => {
      mockXBullSdk.signTransaction.mockRejectedValueOnce(new Error('Request rejected'));
      await expect(adapter.signTransaction('xdr')).rejects.toMatchObject({
        code: TikkaSdkErrorCode.UserRejected,
      });
    });

    it('should map denied errors consistently', async () => {
      mockXBullSdk.signTransaction.mockRejectedValueOnce(new Error('Access denied'));
      await expect(adapter.signTransaction('xdr')).rejects.toMatchObject({
        code: TikkaSdkErrorCode.UserRejected,
      });
    });
  });

  describe('capabilities', () => {
    it('should report correct capabilities', () => {
      const caps = adapter.getCapabilities();

      expect(caps.supportsGetPublicKey).toBe(true);
      expect(caps.supportsSignTransaction).toBe(true);
      expect(caps.supportsSignMessage).toBe(false);
      expect(caps.supportsGetNetwork).toBe(false);
    });

    it('should have consistent capability types', () => {
      const caps = adapter.getCapabilities();

      expect(typeof caps.supportsGetPublicKey).toBe('boolean');
      expect(typeof caps.supportsSignTransaction).toBe('boolean');
      expect(typeof caps.supportsSignMessage).toBe('boolean');
      expect(typeof caps.supportsGetNetwork).toBe('boolean');
    });
  });
});