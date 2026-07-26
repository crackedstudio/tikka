import { FreighterAdapter } from './freighter.adapter';
import { TikkaSdkError, TikkaSdkErrorCode } from '../utils/errors';
import { WalletName } from './wallet.interface';

// Mock the freighter-api module
jest.mock('@stellar/freighter-api', () => ({
  getAddress: jest.fn(),
  signTransaction: jest.fn(),
  signMessage: jest.fn(),
  getNetworkDetails: jest.fn(),
  isConnected: jest.fn(),
}));

describe('FreighterAdapter', () => {
  let adapter: FreighterAdapter;
  let mockFreighterApi: any;

  beforeEach(async () => {
    // Setup window.freighter mock
    (globalThis as any).freighter = {};
    
    mockFreighterApi = await import('@stellar/freighter-api');
    jest.clearAllMocks();
  });

  afterEach(() => {
    delete (globalThis as any).freighter;
  });

  describe('Auto-reconnect on construction', () => {
    it('should auto-reconnect if Freighter is already connected', async () => {
      mockFreighterApi.isConnected.mockResolvedValue(true);
      mockFreighterApi.getAddress.mockResolvedValue({ address: 'GAUTOCONNECT123' });

      adapter = new FreighterAdapter();
      
      // Wait for async constructor logic
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should not show permission prompt when getting public key
      const publicKey = await adapter.getPublicKey();
      expect(publicKey).toBe('GAUTOCONNECT123');
      
      // getAddress should have been called during auto-reconnect
      expect(mockFreighterApi.getAddress).toHaveBeenCalled();
    });

    it('should not auto-reconnect if Freighter is not connected', async () => {
      mockFreighterApi.isConnected.mockResolvedValue(false);

      adapter = new FreighterAdapter();
      
      // Wait for async constructor logic
      await new Promise(resolve => setTimeout(resolve, 100));

      mockFreighterApi.getAddress.mockResolvedValue({ address: 'GNEWCONNECT456' });

      // Should prompt user for permission
      const publicKey = await adapter.getPublicKey();
      expect(publicKey).toBe('GNEWCONNECT456');
    });

    it('should handle auto-reconnect failure silently', async () => {
      mockFreighterApi.isConnected.mockRejectedValue(new Error('Connection check failed'));

      // Should not throw during construction
      expect(() => {
        adapter = new FreighterAdapter();
      }).not.toThrow();

      await new Promise(resolve => setTimeout(resolve, 100));

      mockFreighterApi.getAddress.mockResolvedValue({ address: 'GFALLBACK789' });
      
      const publicKey = await adapter.getPublicKey();
      expect(publicKey).toBe('GFALLBACK789');
    });

    it('should work when isConnected API is not available', async () => {
      mockFreighterApi.isConnected = undefined;

      adapter = new FreighterAdapter();
      
      await new Promise(resolve => setTimeout(resolve, 100));

      mockFreighterApi.getAddress.mockResolvedValue({ address: 'GNOAPI123' });
      
      const publicKey = await adapter.getPublicKey();
      expect(publicKey).toBe('GNOAPI123');
    });
  });

  describe('connect() method', () => {
    beforeEach(() => {
      mockFreighterApi.isConnected.mockResolvedValue(false);
    });

    it('should return immediately if already auto-reconnected', async () => {
      mockFreighterApi.isConnected.mockResolvedValue(true);
      mockFreighterApi.getAddress.mockResolvedValue({ address: 'GALREADY123' });

      adapter = new FreighterAdapter();
      await new Promise(resolve => setTimeout(resolve, 100));

      const callCount = mockFreighterApi.getAddress.mock.calls.length;
      
      await adapter.connect();
      
      // Should not call getAddress again
      expect(mockFreighterApi.getAddress).toHaveBeenCalledTimes(callCount);
    });

    it('should attempt auto-reconnect before prompting user', async () => {
      adapter = new FreighterAdapter();
      await new Promise(resolve => setTimeout(resolve, 100));

      mockFreighterApi.isConnected.mockResolvedValue(true);
      mockFreighterApi.getAddress.mockResolvedValue({ address: 'GCONNECT456' });

      await adapter.connect();
      
      expect(mockFreighterApi.isConnected).toHaveBeenCalled();
      expect(mockFreighterApi.getAddress).toHaveBeenCalled();
    });

    it('should prompt user if auto-reconnect fails', async () => {
      adapter = new FreighterAdapter();
      await new Promise(resolve => setTimeout(resolve, 100));

      mockFreighterApi.isConnected.mockResolvedValue(false);
      mockFreighterApi.getAddress.mockResolvedValue({ address: 'GPROMPT789' });

      await adapter.connect();
      
      expect(mockFreighterApi.getAddress).toHaveBeenCalled();
      
      const key = await adapter.getPublicKey();
      expect(key).toBe('GPROMPT789');
    });
  });

  describe('Page reload simulation', () => {
    it('should reconnect after simulated page reload without user prompt', async () => {
      // First connection
      mockFreighterApi.isConnected.mockResolvedValue(false);
      adapter = new FreighterAdapter();
      await new Promise(resolve => setTimeout(resolve, 100));

      mockFreighterApi.getAddress.mockResolvedValue({ address: 'GRELOAD123' });
      const firstConnect = await adapter.getPublicKey();
      expect(firstConnect).toBe('GRELOAD123');

      // Simulate page reload - create new adapter instance
      mockFreighterApi.isConnected.mockResolvedValue(true);
      mockFreighterApi.getAddress.mockResolvedValue({ address: 'GRELOAD123' });
      
      const reloadedAdapter = new FreighterAdapter();
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should return cached key without additional prompt
      const afterReload = await reloadedAdapter.getPublicKey();
      expect(afterReload).toBe('GRELOAD123');
    });
  });

  describe('Basic adapter functionality', () => {
    beforeEach(() => {
      mockFreighterApi.isConnected.mockResolvedValue(false);
      adapter = new FreighterAdapter();
    });

    it('should have correct wallet name', () => {
      expect(adapter.name).toBe(WalletName.Freighter);
    });

    it('should detect Freighter availability', () => {
      expect(adapter.isAvailable()).toBe(true);
      
      delete (globalThis as any).freighter;
      expect(adapter.isAvailable()).toBe(false);
    });

    it('should throw WalletNotInstalled when Freighter is not available', async () => {
      delete (globalThis as any).freighter;
      
      await expect(adapter.getPublicKey()).rejects.toThrow(TikkaSdkError);
      await expect(adapter.getPublicKey()).rejects.toMatchObject({
        code: TikkaSdkErrorCode.WalletNotInstalled,
      });
    });

    it('should handle user rejection during getPublicKey', async () => {
      mockFreighterApi.getAddress.mockRejectedValue(new Error('User declined access'));

      await expect(adapter.getPublicKey()).rejects.toMatchObject({
        code: TikkaSdkErrorCode.UserRejected,
        message: expect.stringContaining('User rejected'),
      });
    });

    it('should sign transactions', async () => {
      mockFreighterApi.signTransaction.mockResolvedValue({ 
        signedTxXdr: 'signed-xdr-123' 
      });

      const result = await adapter.signTransaction('xdr-123');
      expect(result.signedXdr).toBe('signed-xdr-123');
    });

    it('should handle user rejection during signing', async () => {
      mockFreighterApi.signTransaction.mockRejectedValue(
        new Error('User rejected transaction')
      );

      await expect(adapter.signTransaction('xdr')).rejects.toMatchObject({
        code: TikkaSdkErrorCode.UserRejected,
      });
    });

    it('should return correct capabilities', () => {
      const caps = adapter.getCapabilities();
      expect(caps.supportsGetPublicKey).toBe(true);
      expect(caps.supportsSignTransaction).toBe(true);
      expect(caps.supportsSignMessage).toBe(true);
      expect(caps.supportsGetNetwork).toBe(true);
    });
  });

  describe('disconnect', () => {
    beforeEach(() => {
      mockFreighterApi.isConnected.mockResolvedValue(false);
      adapter = new FreighterAdapter();
    });

    it('should clear cached public key on disconnect', async () => {
      mockFreighterApi.getAddress.mockResolvedValue({ address: 'GDISCONNECT123' });
      
      await adapter.getPublicKey();
      
      adapter.disconnect();
      
      // After disconnect, should request public key again
      mockFreighterApi.getAddress.mockResolvedValue({ address: 'GNEWKEY456' });
      const newKey = await adapter.getPublicKey();
      expect(newKey).toBe('GNEWKEY456');
      expect(mockFreighterApi.getAddress).toHaveBeenCalledTimes(2);
    });
  });
});
