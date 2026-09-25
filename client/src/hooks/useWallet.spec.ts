/**
 * useWallet.spec.ts — Tests for Issue #1549
 *
 * Verifies that mid-session wallet account and network changes are handled
 * correctly:
 *
 *  P1549-1  Account switch mid-session clears stale address and uses the new one
 *  P1549-2  Network switch mid-session re-evaluates isWrongNetwork
 *  P1549-3  Direct disconnect from the wallet extension clears all wallet state
 *  P1549-4  A signing attempt after an account change uses the new identity or
 *           is refused — never the stale one
 *
 * Architecture notes:
 *  - useWallet reads the module-level constant IS_TEST_MODE at import time.
 *    We stub VITE_TEST_MODE='', then call vi.resetModules() + dynamic import so
 *    the hook module is evaluated fresh with the stub in place.
 *  - A synthetic EventEmitter-style provider is installed on window.freighter
 *    so the event-listener useEffect has a provider to attach to.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ── Mutable service mock state ────────────────────────────────────────────────

const mockIsWalletInstalled = vi.fn();
const mockIsWalletConnected = vi.fn();
const mockGetAccountAddress = vi.fn();
const mockGetNetwork = vi.fn();
const mockGetWalletCapabilities = vi.fn();
const mockSignTransaction = vi.fn();
const mockDisconnectWallet = vi.fn();
const mockConnectWallet = vi.fn();
const mockSetNetwork = vi.fn();

const DEFAULT_CAPABILITIES = {
    canSignTransaction: true,
    canSwitchNetwork: false,
    canGetAccount: true,
    supportsMobileDeepLink: false,
    walletName: 'Freighter',
    unsupportedActionCopy: 'Use Freighter.',
};

vi.mock('../services/walletService', () => ({
    isWalletInstalled: (...a: unknown[]) => mockIsWalletInstalled(...a),
    isWalletConnected: (...a: unknown[]) => mockIsWalletConnected(...a),
    getAccountAddress: (...a: unknown[]) => mockGetAccountAddress(...a),
    getNetwork: (...a: unknown[]) => mockGetNetwork(...a),
    getWalletCapabilities: (...a: unknown[]) => mockGetWalletCapabilities(...a),
    signTransaction: (...a: unknown[]) => mockSignTransaction(...a),
    disconnectWallet: (...a: unknown[]) => mockDisconnectWallet(...a),
    connectWallet: (...a: unknown[]) => mockConnectWallet(...a),
    setNetwork: (...a: unknown[]) => mockSetNetwork(...a),
}));

// ── Synthetic injected-provider factory ───────────────────────────────────────

type Listener = (...args: any[]) => void;

function makeProvider() {
    const listeners: Record<string, Listener[]> = {};
    return {
        on(event: string, handler: Listener) {
            (listeners[event] ??= []).push(handler);
        },
        removeListener(event: string, handler: Listener) {
            listeners[event] = (listeners[event] ?? []).filter((h) => h !== handler);
        },
        /** Fire a synthetic wallet event from the test. */
        emit(event: string, ...args: unknown[]) {
            (listeners[event] ?? []).forEach((h) => h(...args));
        },
        _listeners: listeners,
    };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Import useWallet fresh (bypassing the module cache) so IS_TEST_MODE is
 * evaluated with the currently-stubbed environment variables.
 */
async function importUseWallet() {
    vi.resetModules();
    const mod = await import('./useWallet');
    return mod.useWallet;
}

/**
 * Mount useWallet with a synthetic provider on window.freighter.
 * Returns the provider alongside the renderHook result.
 */
async function mountWithProvider() {
    const provider = makeProvider();
    (window as any).freighter = provider;

    const useWallet = await importUseWallet();

    let result!: ReturnType<typeof renderHook<ReturnType<typeof useWallet>, unknown>>;
    await act(async () => {
        result = renderHook(() => useWallet());
    });

    return { provider, ...result };
}

// ── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();

    // Run as a real (non-test) browser session so the event-listener effect fires.
    vi.stubEnv('VITE_TEST_MODE', '');
    vi.stubEnv('VITE_STELLAR_NETWORK', 'testnet');

    // Default: wallet is installed, connected, on the correct network.
    mockIsWalletInstalled.mockResolvedValue(true);
    mockIsWalletConnected.mockResolvedValue(true);
    mockGetAccountAddress.mockResolvedValue('GACCOUNT_ORIGINAL');
    mockGetNetwork.mockResolvedValue('testnet');
    mockGetWalletCapabilities.mockReturnValue(DEFAULT_CAPABILITIES);
    mockSignTransaction.mockResolvedValue({ success: true, signedTransaction: 'signed-xdr' });
    mockDisconnectWallet.mockResolvedValue(undefined);
    mockSetNetwork.mockResolvedValue(undefined);
});

afterEach(() => {
    delete (window as any).freighter;
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
});

// ─────────────────────────────────────────────────────────────────────────────
// P1549-1  Account switch mid-session
// ─────────────────────────────────────────────────────────────────────────────

describe('P1549-1: Account switch mid-session', () => {
    it('updates address when accountsChanged fires with a new account', async () => {
        const { provider, result } = await mountWithProvider();

        // Confirm initial state settled on the original address.
        expect(result.current.address).toBe('GACCOUNT_ORIGINAL');
        expect(result.current.isConnected).toBe(true);

        // Extension switches the active account.
        mockGetAccountAddress.mockResolvedValue('GACCOUNT_NEW');

        await act(async () => {
            provider.emit('accountsChanged', ['GACCOUNT_NEW']);
        });

        expect(result.current.address).toBe('GACCOUNT_NEW');
        expect(result.current.isConnected).toBe(true);
    });

    it('calls walletService.getAccountAddress again after accountsChanged', async () => {
        const { provider } = await mountWithProvider();

        const callsBefore = mockGetAccountAddress.mock.calls.length;
        mockGetAccountAddress.mockResolvedValue('GACCOUNT_NEW');

        await act(async () => {
            provider.emit('accountsChanged', ['GACCOUNT_NEW']);
        });

        expect(mockGetAccountAddress.mock.calls.length).toBeGreaterThan(callsBefore);
    });

    it('re-evaluates isWrongNetwork for the new account', async () => {
        const { provider, result } = await mountWithProvider();

        // New account's network is the wrong one.
        mockGetAccountAddress.mockResolvedValue('GACCOUNT_NEW');
        mockGetNetwork.mockResolvedValue('public');

        await act(async () => {
            provider.emit('accountsChanged', ['GACCOUNT_NEW']);
        });

        expect(result.current.address).toBe('GACCOUNT_NEW');
        expect(result.current.isWrongNetwork).toBe(true);
        expect(result.current.network).toBe('public');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// P1549-2  Network switch mid-session
// ─────────────────────────────────────────────────────────────────────────────

describe('P1549-2: Network switch mid-session', () => {
    it('sets isWrongNetwork=true when networkChanged fires with a wrong network', async () => {
        const { provider, result } = await mountWithProvider();

        expect(result.current.isWrongNetwork).toBe(false);

        mockGetNetwork.mockResolvedValue('public');
        await act(async () => {
            provider.emit('networkChanged');
        });

        expect(result.current.isWrongNetwork).toBe(true);
        expect(result.current.network).toBe('public');
    });

    it('sets isWrongNetwork=false when network switches back to the required one', async () => {
        // Start on the wrong network.
        mockGetNetwork.mockResolvedValue('public');
        const { provider, result } = await mountWithProvider();

        mockGetNetwork.mockResolvedValue('testnet');
        await act(async () => {
            provider.emit('networkChanged');
        });

        expect(result.current.isWrongNetwork).toBe(false);
        expect(result.current.network).toBe('testnet');
    });

    it('also responds to chainChanged event', async () => {
        const { provider, result } = await mountWithProvider();

        mockGetNetwork.mockResolvedValue('public');
        await act(async () => {
            provider.emit('chainChanged');
        });

        expect(result.current.isWrongNetwork).toBe(true);
    });

    it('calls getNetwork after a network event', async () => {
        const { provider } = await mountWithProvider();

        const callsBefore = mockGetNetwork.mock.calls.length;
        await act(async () => {
            provider.emit('networkChanged');
        });

        expect(mockGetNetwork.mock.calls.length).toBeGreaterThan(callsBefore);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// P1549-3  Direct disconnect from the wallet extension
// ─────────────────────────────────────────────────────────────────────────────

describe('P1549-3: Direct disconnect from wallet extension', () => {
    it('clears address and sets isConnected=false when accountsChanged fires with []', async () => {
        const { provider, result } = await mountWithProvider();

        expect(result.current.isConnected).toBe(true);
        expect(result.current.address).toBe('GACCOUNT_ORIGINAL');

        await act(async () => {
            provider.emit('accountsChanged', []);
        });

        expect(result.current.isConnected).toBe(false);
        expect(result.current.address).toBeNull();
    });

    it('clears network and isWrongNetwork on direct disconnect', async () => {
        mockGetNetwork.mockResolvedValue('public');
        const { provider, result } = await mountWithProvider();

        await act(async () => {
            provider.emit('accountsChanged', []);
        });

        expect(result.current.network).toBeNull();
        expect(result.current.isWrongNetwork).toBe(false);
    });

    it('does not call walletService.getAccountAddress on a direct disconnect', async () => {
        const { provider } = await mountWithProvider();

        const callsBefore = mockGetAccountAddress.mock.calls.length;
        await act(async () => {
            provider.emit('accountsChanged', []);
        });

        // The direct-disconnect path must not trigger an address lookup.
        expect(mockGetAccountAddress.mock.calls.length).toBe(callsBefore);
    });

    it('removes all event listeners when the hook unmounts', async () => {
        const { provider, unmount } = await mountWithProvider();

        expect(provider._listeners['accountsChanged']?.length).toBeGreaterThan(0);

        unmount();

        expect(provider._listeners['accountsChanged']?.length ?? 0).toBe(0);
        expect(provider._listeners['networkChanged']?.length ?? 0).toBe(0);
        expect(provider._listeners['chainChanged']?.length ?? 0).toBe(0);
    });

    it('mounts without error when no provider is present on window', async () => {
        delete (window as any).freighter;

        const useWallet = await importUseWallet();
        await act(async () => {
            renderHook(() => useWallet());
        });

        // Reaching here without throwing is sufficient.
        expect(true).toBe(true);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// P1549-4  Signing attempt after an account change
// ─────────────────────────────────────────────────────────────────────────────

describe('P1549-4: Signing attempt after account change', () => {
    it('refuses signing when the live address differs from the state address', async () => {
        const { result } = await mountWithProvider();
        expect(result.current.address).toBe('GACCOUNT_ORIGINAL');

        // The extension switched account without firing the event yet.
        mockGetAccountAddress.mockResolvedValue('GACCOUNT_SWITCHED');

        let caughtError: Error | null = null;
        await act(async () => {
            try {
                await result.current.signTx({ xdr: 'some-transaction' });
            } catch (e) {
                caughtError = e as Error;
            }
        });

        expect(caughtError).not.toBeNull();
        expect(caughtError!.message).toMatch(/wallet account changed/i);
        // The transaction must NOT have been forwarded to walletService.
        expect(mockSignTransaction).not.toHaveBeenCalled();
    });

    it('triggers a state refresh when a live address mismatch is detected', async () => {
        const { result } = await mountWithProvider();

        mockGetAccountAddress.mockResolvedValue('GACCOUNT_SWITCHED');
        const callsBefore = mockIsWalletConnected.mock.calls.length;

        await act(async () => {
            try {
                await result.current.signTx({ xdr: 'some-transaction' });
            } catch {
                // expected — we only care that refresh ran
            }
        });

        // refresh() calls isWalletConnected; an increase confirms it was called.
        expect(mockIsWalletConnected.mock.calls.length).toBeGreaterThan(callsBefore);
    });

    it('proceeds with signing when the live address matches the state address', async () => {
        const { result } = await mountWithProvider();

        // Live address still matches the state address.
        mockGetAccountAddress.mockResolvedValue('GACCOUNT_ORIGINAL');

        let returnValue: unknown;
        await act(async () => {
            returnValue = await result.current.signTx({ xdr: 'some-transaction' });
        });

        expect(mockSignTransaction).toHaveBeenCalledTimes(1);
        expect((returnValue as any).success).toBe(true);
    });

    it('refuses signing when the wallet is on the wrong network regardless of address', async () => {
        mockGetNetwork.mockResolvedValue('public');
        const { provider, result } = await mountWithProvider();

        // Confirm network mismatch is recognised.
        await act(async () => {
            provider.emit('networkChanged');
        });
        expect(result.current.isWrongNetwork).toBe(true);

        // Address would match — but wrong network still blocks.
        mockGetAccountAddress.mockResolvedValue('GACCOUNT_ORIGINAL');

        let caughtError: Error | null = null;
        await act(async () => {
            try {
                await result.current.signTx({ xdr: 'some-transaction' });
            } catch (e) {
                caughtError = e as Error;
            }
        });

        expect(caughtError).not.toBeNull();
        expect(caughtError!.message).toMatch(/switch to/i);
        expect(mockSignTransaction).not.toHaveBeenCalled();
    });

    it('refuses signing when the wallet is disconnected', async () => {
        const { provider, result } = await mountWithProvider();

        // Direct disconnect via extension event.
        await act(async () => {
            provider.emit('accountsChanged', []);
        });
        expect(result.current.isConnected).toBe(false);

        let caughtError: Error | null = null;
        await act(async () => {
            try {
                await result.current.signTx({ xdr: 'some-transaction' });
            } catch (e) {
                caughtError = e as Error;
            }
        });

        expect(caughtError).not.toBeNull();
        expect(caughtError!.message).toMatch(/wallet not connected/i);
        expect(mockSignTransaction).not.toHaveBeenCalled();
    });
});
