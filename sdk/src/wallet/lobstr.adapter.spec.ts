import { LobstrAdapter } from './lobstr.adapter';
import { WalletName } from './wallet.interface';
import { TikkaSdkErrorCode } from '../utils/errors';

jest.mock('@lobstrco/signer-extension-api', () => ({
  isConnected: jest.fn(),
  getPublicKey: jest.fn(),
  signTransaction: jest.fn(),
}));

describe('LobstrAdapter', () => {
  let adapter: LobstrAdapter;
  let mockApi: {
    isConnected: jest.Mock;
    getPublicKey: jest.Mock;
    signTransaction: jest.Mock;
  };

  beforeEach(async () => {
    mockApi = (await import('@lobstrco/signer-extension-api')) as any;
    jest.clearAllMocks();
    mockApi.isConnected.mockResolvedValue(true);
    (globalThis as any).window = {};
    adapter = new LobstrAdapter();
  });

  afterEach(() => {
    delete (globalThis as any).window;
  });

  /** Connect helper for tests exercising the post-connection happy path. */
  const connect = async () => {
    mockApi.isConnected.mockResolvedValue(true);
    await adapter.connect();
  };

  describe('name', () => {
    it('should return correct wallet name', () => {
      expect(adapter.name).toBe(WalletName.LOBSTR);
    });
  });

  describe('isAvailable', () => {
    it('should return true in a browser-like environment', () => {
      (globalThis as any).window = {};
      expect(adapter.isAvailable()).toBe(true);
    });
  });

  describe('connect', () => {
    it('should mark the adapter connected when the extension is connected', async () => {
      mockApi.isConnected.mockResolvedValue(true);

      await adapter.connect();

      expect(adapter.isWalletConnected()).toBe(true);
    });

    it('should be idempotent', async () => {
      mockApi.isConnected.mockResolvedValue(true);

      await adapter.connect();
      await adapter.connect();

      expect(adapter.isWalletConnected()).toBe(true);
    });

    it('should throw WalletNotConnected when the extension is not connected', async () => {
      mockApi.isConnected.mockResolvedValue(false);

      await expect(adapter.connect()).rejects.toMatchObject({
        code: TikkaSdkErrorCode.WalletNotConnected,
      });
      expect(adapter.isWalletConnected()).toBe(false);
    });

    it('should throw WalletNotConnected when the extension probe throws', async () => {
      mockApi.isConnected.mockRejectedValue(new Error('extension unavailable'));

      await expect(adapter.connect()).rejects.toMatchObject({
        code: TikkaSdkErrorCode.WalletNotConnected,
      });
      expect(adapter.isWalletConnected()).toBe(false);
    });

    it('should throw WalletNotConnected outside a browser environment', async () => {
      delete (globalThis as any).window;

      await expect(adapter.connect()).rejects.toMatchObject({
        code: TikkaSdkErrorCode.WalletNotConnected,
      });
    });
  });

  describe('disconnect', () => {
    it('should reset the connection flag', async () => {
      await connect();
      expect(adapter.isWalletConnected()).toBe(true);

      await adapter.disconnect();

      expect(adapter.isWalletConnected()).toBe(false);
    });
  });

  describe('connection guard', () => {
    it('should throw WalletNotConnected from getPublicKey before connect()', async () => {
      await expect(adapter.getPublicKey()).rejects.toMatchObject({
        code: TikkaSdkErrorCode.WalletNotConnected,
      });
      expect(mockApi.getPublicKey).not.toHaveBeenCalled();
    });

    it('should throw WalletNotConnected from signTransaction before connect()', async () => {
      await expect(adapter.signTransaction('xdr')).rejects.toMatchObject({
        code: TikkaSdkErrorCode.WalletNotConnected,
      });
      expect(mockApi.signTransaction).not.toHaveBeenCalled();
    });

    it('should throw WalletNotConnected from getPublicKey after disconnect()', async () => {
      await connect();
      await adapter.disconnect();

      await expect(adapter.getPublicKey()).rejects.toMatchObject({
        code: TikkaSdkErrorCode.WalletNotConnected,
      });
      expect(mockApi.getPublicKey).not.toHaveBeenCalled();
    });

    it('should throw WalletNotConnected from signTransaction after disconnect()', async () => {
      await connect();
      await adapter.disconnect();

      await expect(adapter.signTransaction('xdr')).rejects.toMatchObject({
        code: TikkaSdkErrorCode.WalletNotConnected,
      });
      expect(mockApi.signTransaction).not.toHaveBeenCalled();
    });

    it('should throw WalletNotConnected if the live extension state is lost after connect()', async () => {
      await connect();
      // User disconnects inside the extension after the adapter connected.
      mockApi.isConnected.mockResolvedValue(false);

      await expect(adapter.getPublicKey()).rejects.toMatchObject({
        code: TikkaSdkErrorCode.WalletNotConnected,
      });
      expect(adapter.isWalletConnected()).toBe(false);
      expect(mockApi.getPublicKey).not.toHaveBeenCalled();
    });
  });

  describe('getPublicKey', () => {
    beforeEach(connect);

    it('should return public key string', async () => {
      const expected = 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
      mockApi.getPublicKey.mockResolvedValue(expected);

      const result = await adapter.getPublicKey();

      expect(result).toBe(expected);
    });

    it('should throw UserRejected when user rejects', async () => {
      mockApi.getPublicKey.mockRejectedValue(new Error('User rejected the request'));

      await expect(adapter.getPublicKey()).rejects.toMatchObject({
        code: TikkaSdkErrorCode.UserRejected,
        message: 'User rejected public key request',
      });
    });

    it('should throw Unknown for other errors', async () => {
      mockApi.getPublicKey.mockRejectedValue(new Error('Network error'));

      await expect(adapter.getPublicKey()).rejects.toMatchObject({
        code: TikkaSdkErrorCode.Unknown,
        message: expect.stringContaining('LOBSTR getPublicKey failed'),
      });
    });

    it('should throw Unknown when empty public key returned', async () => {
      mockApi.getPublicKey.mockResolvedValue('');

      await expect(adapter.getPublicKey()).rejects.toMatchObject({
        code: TikkaSdkErrorCode.Unknown,
      });
    });
  });

  describe('signTransaction', () => {
    const mockXdr = 'AAAAAgAAAABqxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxQ==';
    const mockSignedXdr = 'AAAAAgAAAABqyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyQ==';

    beforeEach(connect);

    it('should sign transaction and return signed XDR', async () => {
      mockApi.signTransaction.mockResolvedValue(mockSignedXdr);

      const result = await adapter.signTransaction(mockXdr);

      expect(result.signedXdr).toBe(mockSignedXdr);
      expect(mockApi.signTransaction).toHaveBeenCalledWith(mockXdr);
    });

    it('should throw UserRejected when user cancels', async () => {
      mockApi.signTransaction.mockRejectedValue(new Error('User cancelled'));

      await expect(adapter.signTransaction(mockXdr)).rejects.toMatchObject({
        code: TikkaSdkErrorCode.UserRejected,
        message: 'User rejected transaction signing',
      });
    });

    it('should throw Unknown for other errors', async () => {
      mockApi.signTransaction.mockRejectedValue(new Error('Invalid XDR'));

      await expect(adapter.signTransaction(mockXdr)).rejects.toMatchObject({
        code: TikkaSdkErrorCode.Unknown,
        message: expect.stringContaining('LOBSTR signTransaction failed'),
      });
    });

    it('should throw Unknown when empty signed XDR returned', async () => {
      mockApi.signTransaction.mockResolvedValue('');

      await expect(adapter.signTransaction(mockXdr)).rejects.toMatchObject({
        code: TikkaSdkErrorCode.Unknown,
      });
    });
  });

  describe('error mapping consistency', () => {
    beforeEach(connect);

    it('should map cancel/reject/denied to UserRejected', async () => {
      for (const msg of ['User cancelled', 'Request rejected', 'Access denied']) {
        mockApi.isConnected.mockResolvedValue(true);
        mockApi.getPublicKey.mockRejectedValueOnce(new Error(msg));
        await expect(adapter.getPublicKey()).rejects.toMatchObject({
          code: TikkaSdkErrorCode.UserRejected,
        });

        mockApi.isConnected.mockResolvedValue(true);
        mockApi.signTransaction.mockRejectedValueOnce(new Error(msg));
        await expect(adapter.signTransaction('xdr')).rejects.toMatchObject({
          code: TikkaSdkErrorCode.UserRejected,
        });
      }
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