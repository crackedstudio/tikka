import { describe, it, expect, beforeEach, vi } from 'vitest';
import { attemptAutoReconnect } from './walletService';

// Mock stellar-wallets-kit
vi.mock('@creit.tech/stellar-wallets-kit', () => ({
  StellarWalletsKit: vi.fn().mockImplementation(() => ({
    getAddress: vi.fn().mockResolvedValue({ address: 'GAUTO123' }),
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
    localStorage.removeItem('selectedWalletId');
    localStorage.removeItem('tikka_last_connected_wallet');
    
    // Setup window.freighter mock
    (globalThis as any).window = {
      freighter: {},
      localStorage: {
        getItem: vi.fn((key: string) => localStorage.getItem(key)),
        setItem: vi.fn((key: string, value: string) => localStorage.setItem(key, value)),
        removeItem: vi.fn((key: string) => localStorage.removeItem(key)),
      },
    };
  });

  it('should return false when no wallet was previously connected', async () => {
    const result = await attemptAutoReconnect();
    expect(result.success).toBe(false);
  });

  it('should attempt to reconnect Freighter if it was last connected', async () => {
    localStorage.setItem('tikka_last_connected_wallet', 'freighter');
    localStorage.setItem('selectedWalletId', 'freighter');
    
    // Mock window.freighter.isConnected
    (globalThis as any).window.freighter.isConnected = vi.fn().mockResolvedValue(true);

    const result = await attemptAutoReconnect();
    
    expect(result.success).toBe(true);
    expect(result.address).toBe('GAUTO123');
  });

  it('should return false if Freighter is not connected', async () => {
    localStorage.setItem('tikka_last_connected_wallet', 'freighter');
    
    (globalThis as any).window.freighter.isConnected = vi.fn().mockResolvedValue(false);

    const result = await attemptAutoReconnect();
    
    expect(result.success).toBe(false);
  });

  it('should handle errors gracefully', async () => {
    localStorage.setItem('tikka_last_connected_wallet', 'freighter');
    
    (globalThis as any).window.freighter.isConnected = vi.fn().mockRejectedValue(new Error('Connection failed'));

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
    delete (globalThis as any).window.freighter;

    const result = await attemptAutoReconnect();
    
    expect(result.success).toBe(false);
  });
});
