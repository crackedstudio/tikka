import { describe, it, expect, beforeEach, vi } from 'vitest';
import { attemptAutoReconnect } from './walletService';

// Mock @stellar/freighter-api
vi.mock('@stellar/freighter-api', () => ({
  isConnected: vi.fn(),
  getAddress: vi.fn(),
}));

// Mock stellar-wallets-kit
vi.mock('@creit.tech/stellar-wallets-kit', () => ({
  StellarWalletsKit: vi.fn().mockImplementation(() => ({
    getAddress: vi.fn(),
    setWallet: vi.fn(),
    disconnect: vi.fn(),
  })),
  allowAllModules: vi.fn(() => []),
  FREIGHTER_ID: 'freighter',
  WalletNetwork: {},
}));

describe('walletService - Auto-reconnect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    Object.defineProperty(globalThis, 'window', {
      value: {
        freighter: {},
        localStorage: {
          getItem: vi.fn((key: string) => localStorage.getItem(key)),
          setItem: vi.fn((key: string, value: string) => localStorage.setItem(key, value)),
          removeItem: vi.fn((key: string) => localStorage.removeItem(key)),
        },
      },
      configurable: true,
    });
  });

  it('should return false when no wallet was previously connected', async () => {
    const result = await attemptAutoReconnect();
    expect(result.success).toBe(false);
  });

  it('should attempt to reconnect Freighter if it was last connected', async () => {
    localStorage.setItem('tikka_last_connected_wallet', 'freighter');
    
    const mockFreighterApi = await import('@stellar/freighter-api');
    vi.mocked(mockFreighterApi.isConnected).mockResolvedValue(true);
    vi.mocked(mockFreighterApi.getAddress).mockResolvedValue({ address: 'GAUTO123' });

    const result = await attemptAutoReconnect();
    
    expect(result.success).toBe(true);
    expect(result.address).toBe('GAUTO123');
  });

  it('should return false if Freighter is not connected', async () => {
    localStorage.setItem('tikka_last_connected_wallet', 'freighter');
    
    const mockFreighterApi = await import('@stellar/freighter-api');
    vi.mocked(mockFreighterApi.isConnected).mockResolvedValue(false);

    const result = await attemptAutoReconnect();
    
    expect(result.success).toBe(false);
  });

  it('should handle errors gracefully', async () => {
    localStorage.setItem('tikka_last_connected_wallet', 'freighter');
    
    const mockFreighterApi = await import('@stellar/freighter-api');
    vi.mocked(mockFreighterApi.isConnected).mockRejectedValue(new Error('Connection failed'));

    const result = await attemptAutoReconnect();
    
    expect(result.success).toBe(false);
  });

  it('should not attempt reconnect for non-Freighter wallets', async () => {
    localStorage.setItem('tikka_last_connected_wallet', 'xbull');

    const result = await attemptAutoReconnect();
    
    expect(result.success).toBe(false);
  });

  it('should return false if Freighter extension is not available', async () => {
    localStorage.setItem('tikka_last_connected_wallet', 'freighter');
    delete (globalThis.window as { freighter?: unknown }).freighter;

    const result = await attemptAutoReconnect();
    
    expect(result.success).toBe(false);
  });
});
