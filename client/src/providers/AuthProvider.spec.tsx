/**
 * Property-based tests for AuthProvider
 * Feature: siws-auth
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import * as fc from 'fast-check';
import { AuthProvider } from './AuthProvider';

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Mutable wallet context state
let walletState = { address: 'GTEST1234567890' as string | null, isConnected: true };

vi.mock('./WalletProvider', () => ({
  useWalletContext: () => walletState,
}));

// Capture the logout mock from useAuth
const mockLogout = vi.fn();
const mockLogin = vi.fn();
const mockCheckAuth = vi.fn();

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    isAuthenticated: !!sessionStorage.getItem('tikka_auth_token'),
    address: sessionStorage.getItem('tikka_auth_address'),
    token: sessionStorage.getItem('tikka_auth_token'),
    isAuthenticating: false,
    error: null,
    login: mockLogin,
    logout: mockLogout,
    checkAuth: mockCheckAuth,
  }),
}));

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  walletState = { address: 'GTEST1234567890', isConnected: true };
});

afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

// ── Helper: render AuthProvider and get context ───────────────────────────────

function TestConsumer({ onContext }: { onContext: (ctx: ReturnType<typeof useAuthContext>) => void }) {
  const ctx = useAuthContext();
  onContext(ctx);
  return null;
}
 
// ── P11: Wallet disconnect triggers logout ────────────────────────────────────

describe('P11: Wallet disconnect triggers logout', () => {
  // Feature: siws-auth, Property 11: For any authenticated session, when isConnected
  // transitions from true to false (after the initial mount), AuthProvider must call
  // logout() — unless VITE_TEST_MODE is "true".
  it('calls logout when isConnected transitions from true to false while authenticated', async () => {
    await fc.assert(
      fc.asyncProperty(fc.boolean(), async (_seed) => {
        vi.unstubAllEnvs();
        vi.stubEnv('VITE_TEST_MODE', '');
        vi.clearAllMocks();
        sessionStorage.clear();

        // Set up authenticated state
        sessionStorage.setItem('tikka_auth_token', 'valid-token');
        walletState = { address: 'GTEST1234567890', isConnected: true };

        const { rerender } = render(
          <AuthProvider>
            <div />
          </AuthProvider>,
        );

        // Transition to disconnected
        walletState = { address: null, isConnected: false };
        await act(async () => {
          rerender(
            <AuthProvider>
              <div />
            </AuthProvider>,
          );
        });

        expect(mockLogout).toHaveBeenCalled();
        sessionStorage.clear();
      }),
      { numRuns: 100 },
    );
  });

  it('does NOT call logout on initial mount when wallet starts connected', async () => {
    vi.stubEnv('VITE_TEST_MODE', '');
    sessionStorage.setItem('tikka_auth_token', 'valid-token');
    // Start connected - no disconnect transition
    walletState = { address: 'GTEST1234567890', isConnected: true };

    await act(async () => {
      render(
        <AuthProvider>
          <div />
        </AuthProvider>,
      );
    });

    // No disconnect happened, so logout should not be called
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it('does NOT call logout on disconnect when VITE_TEST_MODE=true', async () => {
    vi.stubEnv('VITE_TEST_MODE', 'true');
    sessionStorage.setItem('tikka_auth_token', 'valid-token');
    walletState = { address: 'GTEST1234567890', isConnected: true };

    const { rerender } = render(
      <AuthProvider>
        <div />
      </AuthProvider>,
    );

    walletState = { address: null, isConnected: false };
    await act(async () => {
      rerender(
        <AuthProvider>
          <div />
        </AuthProvider>,
      );
    });

    expect(mockLogout).not.toHaveBeenCalled();
  });
});

// ── P12: Address change triggers logout ───────────────────────────────────────

describe('P12: Address change triggers logout', () => {
  // Feature: siws-auth, Property 12: For any authenticated session where auth.address is set,
  // when the wallet address changes to a different non-null value, AuthProvider must call logout().
  it('calls logout when wallet address changes to a different non-null value while authenticated', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        async (addr1, addr2) => {
          // Skip if addresses are the same — no change means no logout
          fc.pre(addr1 !== addr2);

          vi.clearAllMocks();
          sessionStorage.clear();

          // Set up authenticated state with addr1 as the auth address
          sessionStorage.setItem('tikka_auth_token', 'valid-token');
          sessionStorage.setItem('tikka_auth_address', addr1);
          walletState = { address: addr1, isConnected: true };

          const { rerender } = render(
            <AuthProvider>
              <div />
            </AuthProvider>,
          );

          // Change wallet address to addr2
          walletState = { address: addr2, isConnected: true };
          await act(async () => {
            rerender(
              <AuthProvider>
                <div />
              </AuthProvider>,
            );
          });

          expect(mockLogout).toHaveBeenCalled();
          sessionStorage.clear();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('does NOT trigger additional logout when address changes to null', async () => {
    vi.stubEnv('VITE_TEST_MODE', '');
    vi.clearAllMocks();
    sessionStorage.setItem('tikka_auth_token', 'valid-token');
    sessionStorage.setItem('tikka_auth_address', 'GTEST1234567890');
    walletState = { address: 'GTEST1234567890', isConnected: true };

    const { rerender } = render(
      <AuthProvider>
        <div />
      </AuthProvider>,
    );

    // Address changes to null — address-change watcher should NOT fire
    walletState = { address: null, isConnected: true };
    await act(async () => {
      rerender(
        <AuthProvider>
          <div />
        </AuthProvider>,
      );
    });

    // The address-change effect requires both authAddress and address to be non-null
    // so logout should not be called from the address-change watcher
    // (disconnect watcher also won't fire since isConnected is still true)
    expect(mockLogout).not.toHaveBeenCalled();
  });
});
