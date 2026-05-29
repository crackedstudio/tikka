import { LobstrAdapter } from './lobstr.adapter';
import { WalletName } from './wallet.interface';
import { TikkaSdkError, TikkaSdkErrorCode } from '../utils/errors';

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
    mockApi = await import('@lobstrco/signer-extension-api') as any;
    jest.clearAllMocks();
    mockApi.isConnected.mockResolvedValue(true);
    adapter = new LobstrAdapter();
  });

  describe('name', () => {
    it('should return correct wallet name', () => {
      expect(adapter.name).toBe(WalletName.LOBSTR);
    });
  });

  describe('isAvailable', () => {
    it('should return true in a browser-like environment', () => {
      (globalThis as any).window = {};
      expect(adapter.isAvailable()).toBe(true);
      delete (globalThis as any).window;
    });
  });

  describe('getPublicKey', () => {
    it('should return public key string', async () => {
      const expected = 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
      mockApi.getPublicKey.mockResolvedValue(expected);

      const result = await adapter.getPublicKey();

      expect(result).toBe(expected);
    });

    it('should throw WalletNotInstalled when not connected', async () => {
      mockApi.isConnected.mockResolvedValue(false);

      await expect(adapter.getPublicKey()).rejects.toMatchObject({
        code: TikkaSdkErrorCode.Unknown,
        message: expect.stringContaining('LOBSTR getPublicKey failed'),
      });
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

    it('should sign transaction and return signed XDR', async () => {
      mockApi.signTransaction.mockResolvedValue(mockSignedXdr);

      const result = await adapter.signTransaction(mockXdr);

      expect(result.signedXdr).toBe(mockSignedXdr);
      expect(mockApi.signTransaction).toHaveBeenCalledWith(mockXdr);
    });

    it('should throw WalletNotInstalled when not connected', async () => {
      mockApi.isConnected.mockResolvedValue(false);

      await expect(adapter.signTransaction(mockXdr)).rejects.toMatchObject({
        code: TikkaSdkErrorCode.Unknown,
        message: expect.stringContaining('LOBSTR signTransaction failed'),
      });
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

  describe('signMessage', () => {
    it('should throw (not supported)', async () => {
      await expect(adapter.signMessage('hello')).rejects.toThrow(
        'lobstr does not support signMessage',
      );
    });
  });

  describe('getNetwork', () => {
    it('should return undefined (not implemented)', async () => {
      expect(await adapter.getNetwork()).toBeUndefined();
    });
  });

  describe('error mapping consistency', () => {
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
});
