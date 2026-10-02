import { logger } from '../utils/logger';
/**
 * useWallet Hook
 *
 * Updated for Issue #120: Improved network switching detection
 * and state synchronization with StellarWalletsKit.
 *
 * Updated for Issue #1549: Subscribe to wallet accountsChanged / chainChanged
 * push events so mid-session account or network changes are handled immediately
 * rather than being caught only by the 5-second poll.  The signing guard also
 * re-reads the live wallet address at call-time to guarantee we never sign under
 * a stale identity.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
    connectWallet,
    disconnectWallet,
    getAccountAddress,
    getNetwork,
    isWalletConnected,
    isWalletInstalled,
    setNetwork,
    promptNetworkSwitch,
    signTransaction,
    getWalletCapabilities,
    normalizeNetworkName,
    attemptAutoReconnect,
    type WalletCapabilities,
    type WalletSignResult,
} from "../services/walletService";
import { useAuthStore } from "../store/useAuthStore";

export interface WalletState {
    address: string | null;
    isConnected: boolean;
    isConnecting: boolean;
    isDisconnecting: boolean;
    error: string | null;
    isWalletAvailable: boolean;
    network: string | null; // e.g., "testnet" or "public"
    isWrongNetwork: boolean;
    capabilities: WalletCapabilities;
}

export interface UseWalletReturn extends WalletState {
    connect: () => Promise<void>;
    disconnect: () => Promise<void>;
    refresh: () => Promise<void>;
    signTx: (transaction: unknown) => Promise<WalletSignResult>;
    switchNetwork: () => Promise<void>;
}

export function useWallet(): UseWalletReturn {
    const [state, setState] = useState<WalletState>({
        address: null,
        isConnected: IS_TEST_MODE,
        isConnecting: false,
        isDisconnecting: false,
        error: null,
        isWalletAvailable: IS_TEST_MODE,
        network: IS_TEST_MODE ? "testnet" : null,
        isWrongNetwork: false,
        capabilities: getWalletCapabilities(),
    });

    // The network the app expects from .env (e.g., "testnet")
    const APP_REQUIRED_NETWORK = import.meta.env.VITE_STELLAR_NETWORK || "testnet";

    // Keep a ref to the latest state so the signing guard can read it without
    // closing over a stale closure value.
    const stateRef = useRef(state);
    stateRef.current = state;

    /**
     * Refresh wallet state and validate network.
     * Called on mount, by the 5-second poll, and by wallet event handlers.
     */
    const refresh = useCallback(async () => {
        try {
            const available = await isWalletInstalled();
            const connected = await isWalletConnected();
            const address = connected ? await getAccountAddress() : null;
            const network = connected ? await getNetwork() : null;
            const capabilities = getWalletCapabilities();

            // Normalised network mismatch check
            const isWrongNetwork =
                connected &&
                network !== null &&
                network.toLowerCase() !== APP_REQUIRED_NETWORK.toLowerCase();

            store.setWalletState({
                isWalletAvailable: available,
                isConnected: connected,
                address,
                network,
                isWrongNetwork,
                capabilities,
                error: null,
            });
        } catch (error) {
            logger.error("Wallet refresh failed:", error);
        }
    }, [APP_REQUIRED_NETWORK, store.setWalletState]);

    // ── Wallet push-event subscriptions (Issue #1549) ──────────────────────────
    //
    // Most Stellar wallets inject a provider on window.freighter (or a generic
    // window.stellar / window.ethereum-style interface).  The StellarWalletsKit
    // does not expose native event emitters at the kit level, so we attach
    // directly to the underlying injected provider when available.
    //
    // We subscribe to:
    //  • accountsChanged — fired by the extension when the user switches account
    //    or disconnects inside the wallet UI.
    //  • networkChanged / chainChanged — fired when the user changes network
    //    inside the wallet extension.

    useEffect(() => {
        if (IS_TEST_MODE) return;

        // Resolve the injected provider.  Different wallets use different keys;
        // fall back gracefully if none is present.
        const provider =
            (window as any).freighter ??
            (window as any).stellar ??
            (window as any).xBull ??
            (window as any).rabet ??
            (window as any).lobstr ??
            null;

        if (!provider || typeof provider.on !== "function") {
            // No provider or provider doesn't emit events — polling is the only
            // mechanism available; nothing else to register here.
            return;
        }

        /**
         * Handles the `accountsChanged` event emitted by the wallet extension.
         *
         * @param accounts - Array of available addresses. An empty array means
         *   the user disconnected from the extension directly.
         */
        const handleAccountsChanged = async (accounts: string[]) => {
            if (accounts.length === 0) {
                // Direct disconnect from the wallet extension UI.
                setState((prev) => ({
                    ...prev,
                    address: null,
                    isConnected: false,
                    network: null,
                    isWrongNetwork: false,
                    capabilities: getWalletCapabilities(),
                    error: null,
                }));
            } else {
                // Account switched mid-session — do a full refresh so all
                // derived state (network, capabilities, isWrongNetwork) is
                // recalculated against the new address.
                await refresh();
            }
        };

        /**
         * Handles `networkChanged` / `chainChanged` events.
         * Re-evaluates `isWrongNetwork` with the fresh network value.
         */
        const handleNetworkChanged = async () => {
            await refresh();
        };

        provider.on("accountsChanged", handleAccountsChanged);
        // Wallets may use either name; register both defensively.
        provider.on("networkChanged", handleNetworkChanged);
        provider.on("chainChanged", handleNetworkChanged);

        return () => {
            if (typeof provider.removeListener === "function") {
                provider.removeListener("accountsChanged", handleAccountsChanged);
                provider.removeListener("networkChanged", handleNetworkChanged);
                provider.removeListener("chainChanged", handleNetworkChanged);
            } else if (typeof provider.off === "function") {
                provider.off("accountsChanged", handleAccountsChanged);
                provider.off("networkChanged", handleNetworkChanged);
                provider.off("chainChanged", handleNetworkChanged);
            }
        };
    }, [refresh]);

    // ── 5-second polling (retained as a fallback) ──────────────────────────────
    useEffect(() => {
        refresh();
        const interval = setInterval(refresh, 5000);
        return () => clearInterval(interval);
    }, [refresh]);

    // ── Standard wallet actions ────────────────────────────────────────────────

    const connect = useCallback(async () => {
        store.setWalletState({ isConnecting: true, error: null });

        try {
            const result = await connectWallet();
            if (result.success) {
                await refresh();
            } else {
                store.setWalletState({
                    isConnecting: false,
                    error: result.error || "Connection failed",
                });
            }
        } catch (error) {
            store.setWalletState({
                isConnecting: false,
                error: error instanceof Error ? error.message : "Connect error",
            });
        }
    }, [refresh, store.setWalletState]);

    const disconnect = useCallback(async () => {
        store.setWalletState({ isDisconnecting: true });
        try {
            await disconnectWallet();
            store.setWalletState({
                address: null,
                isConnected: false,
                isDisconnecting: false,
                network: null,
                isWrongNetwork: false,
                capabilities: getWalletCapabilities(),
            }));
        } catch {
            setState((prev) => ({ ...prev, isDisconnecting: false }));
        }
    }, [store.setWalletState]);

    const switchNetwork = useCallback(async () => {
        try {
            await setNetwork(APP_REQUIRED_NETWORK);
            await refresh();
        } catch {
            setState((prev) => ({
                ...prev,
                error: "Please switch network manually in your wallet extension.",
            }));
        }
    }, [refresh, APP_REQUIRED_NETWORK, store.setWalletState]);

    /**
     * Sign a transaction with a live-identity guard (Issue #1549).
     *
     * Before delegating to walletService.signTransaction we re-read the address
     * from the wallet extension at call-time and compare it to the address held
     * in React state.  If they differ — e.g. the user switched accounts in the
     * extension between the last poll and this call — we refuse the signing
     * attempt instead of submitting under a stale identity.
     */
    const signTx = useCallback(
        async (transaction: any) => {
            const current = stateRef.current;

            if (!current.isConnected) throw new Error("Wallet not connected");
            if (current.isWrongNetwork)
                throw new Error(`Please switch to ${APP_REQUIRED_NETWORK}`);
            if (!current.capabilities.canSignTransaction)
                throw new Error(current.capabilities.unsupportedActionCopy);

            // Live-identity check: re-read address from the wallet extension.
            // Skip in test mode where getAccountAddress returns a fixed stub.
            if (!IS_TEST_MODE) {
                const liveAddress = await getAccountAddress();
                if (liveAddress !== current.address) {
                    // The identity changed since the last state sync.  Trigger a
                    // refresh so the UI reflects the new account, then refuse.
                    await refresh();
                    throw new Error(
                        "Wallet account changed. Please review your connected account and try again."
                    );
                }
            }

            return await signTransaction(transaction);
        },
        // refresh and APP_REQUIRED_NETWORK are stable; stateRef is a ref so it
        // is intentionally excluded from the deps array.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [refresh, APP_REQUIRED_NETWORK]
    );

    return {
        address: store.address,
        isConnected: store.isConnected,
        isConnecting: store.isConnecting,
        isDisconnecting: store.isDisconnecting,
        error: store.error,
        isWalletAvailable: store.isWalletAvailable,
        network: store.network,
        isWrongNetwork: store.isWrongNetwork,
        capabilities: store.capabilities,
        connect,
        disconnect,
        refresh,
        signTx,
        switchNetwork,
    };
}
