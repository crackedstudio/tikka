/**
 * Property-based tests for useAuth hook
 * Feature: siws-auth
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import * as fc from 'fast-check';
import { useAuth } from './useAuth';

// ── Module mocks ──────────────────────────────────────────────────────────────

const mockGetNonce = vi.fn();
const mockVerify = vi.fn();
const mockGetKit = vi.fn();

vi.mock('../services/authService', () => ({
  getNonce: (...args: unknown[]) => mockGetNonce(...args),
  verify: (...args: unknown[]) => mockVerify(...args),
}));

vi.mock('../services/walletService', () => ({
  getKit: () => mockGetKit(),
}));

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
  // Default: VITE_TEST_MODE not set
  vi.stubEnv('VITE_TEST_MODE', '');
});

afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

// ── P14: useAuth initialises from stored token ────────────────────────────────

describe('P14: useAuth initialises from stored token', () => {
  // Feature: siws-auth, Property 14: For any pre-existing token in
  // sessionStorage["tikka_auth_token"], initialising useAuth must set
  // isAuthenticated=true and token to that value.
  it('sets isAuthenticated=true and token from sessionStorage on init', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (token) => {
        sessionStorage.setItem('tikka_auth_token', token);
        const { result } = renderHook(() => useAuth());
        expect(result.current.isAuthenticated).toBe(true);
        expect(result.current.token).toBe(token);
        sessionStorage.clear();
      }),
      { numRuns: 100 },
    );
  });

  it('sets isAuthenticated=false when no token in sessionStorage', () => {
    sessionStorage.clear();
    const { result } = renderHook(() => useAuth());
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.token).toBeNull();
  });
});

// ── P4: Signature type handling ───────────────────────────────────────────────

describe('P4: Signature type handling', () => {
  // Feature: siws-auth, Property 4: For any value returned as signedMessage by
  // Wallet_Kit.signMessage, if it is a string it must be used as-is; if it is not
  // a string it must be converted via btoa before being passed to authService.verify.
  it('uses string signedMessage as-is and Uint8Array via btoa', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(fc.string(), fc.uint8Array({ maxLength: 64 })),
        async (signedMessage) => {
          vi.stubEnv('VITE_TEST_MODE', '');

          const nonceData = {
            nonce: 'nonce123',
            issuedAt: '2024-01-01T00:00:00Z',
            expiresAt: '2099-01-01T00:00:00Z',
            message: 'Sign this',
          };
          mockGetNonce.mockResolvedValue(nonceData);
          mockVerify.mockResolvedValue({ accessToken: 'token-abc' });

          const kitMock = { signMessage: vi.fn().mockResolvedValue({ signedMessage }) };
          mockGetKit.mockReturnValue(kitMock);

          const { result } = renderHook(() => useAuth());
          await act(async () => {
            await result.current.login('GTEST123');
          });

          const verifyCall = mockVerify.mock.calls[0][0];
          if (typeof signedMessage === 'string') {
            expect(verifyCall.signature).toBe(signedMessage);
          } else {
            const expected = btoa(
              String.fromCharCode.apply(null, Array.from(new Uint8Array(signedMessage))),
            );
            expect(verifyCall.signature).toBe(expected);
          }

          sessionStorage.clear();
          vi.clearAllMocks();
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ── P9: Login state transitions ───────────────────────────────────────────────

describe('P9: Login state transitions', () => {
  // Feature: siws-auth, Property 9: For any wallet address, calling login(address) must:
  // (a) set isAuthenticating=true, error=null before any async work;
  // (b) on success set isAuthenticated=true, address=walletAddress, isAuthenticating=false, error=null
  //     and call setToken(accessToken);
  // (c) on failure set isAuthenticating=false, error=<message> and re-throw.
  it('sets isAuthenticated=true and stores token on successful login', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 1 }), async (address) => {
        vi.stubEnv('VITE_TEST_MODE', 'true');

        const accessToken = 'jwt-' + address;
        mockGetNonce.mockResolvedValue({
          nonce: 'n',
          issuedAt: 'i',
          expiresAt: 'e',
          message: 'm',
        });
        mockVerify.mockResolvedValue({ accessToken });

        const { result } = renderHook(() => useAuth());
        await act(async () => {
          await result.current.login(address);
        });

        expect(result.current.isAuthenticated).toBe(true);
        expect(result.current.address).toBe(address);
        expect(result.current.isAuthenticating).toBe(false);
        expect(result.current.error).toBeNull();
        expect(sessionStorage.getItem('tikka_auth_token')).toBe(accessToken);

        sessionStorage.clear();
        vi.clearAllMocks();
      }),
      { numRuns: 100 },
    );
  });

  it('sets isAuthenticating=false and error on failed login, and re-throws', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        async (address, errorMsg) => {
          vi.stubEnv('VITE_TEST_MODE', 'true');

          mockGetNonce.mockRejectedValue(new Error(errorMsg));

          const { result } = renderHook(() => useAuth());

          let caughtError: Error | null = null;
          await act(async () => {
            try {
              await result.current.login(address);
            } catch (e) {
              caughtError = e as Error;
            }
          });

          expect(caughtError).not.toBeNull();
          expect(caughtError!.message).toBe(errorMsg);
          expect(result.current.isAuthenticating).toBe(false);
          expect(result.current.error).toBe(errorMsg);

          sessionStorage.clear();
          vi.clearAllMocks();
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ── P10: Logout resets state ──────────────────────────────────────────────────

describe('P10: Logout resets state', () => {
  // Feature: siws-auth, Property 10: For any authenticated state, calling logout() must
  // call clearToken() and reset all auth state fields to their initial values
  // (isAuthenticated=false, address=null, token=null, isAuthenticating=false, error=null).
  it('resets all state fields and clears token on logout', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 1 }), async (token) => {
        vi.stubEnv('VITE_TEST_MODE', 'true');

        // Pre-populate token so hook initialises as authenticated
        sessionStorage.setItem('tikka_auth_token', token);

        const { result } = renderHook(() => useAuth());
        expect(result.current.isAuthenticated).toBe(true);

        act(() => {
          result.current.logout();
        });

        expect(result.current.isAuthenticated).toBe(false);
        expect(result.current.address).toBeNull();
        expect(result.current.token).toBeNull();
        expect(result.current.isAuthenticating).toBe(false);
        expect(result.current.error).toBeNull();
        expect(sessionStorage.getItem('tikka_auth_token')).toBeNull();

        sessionStorage.clear();
      }),
      { numRuns: 100 },
    );
  });
});
