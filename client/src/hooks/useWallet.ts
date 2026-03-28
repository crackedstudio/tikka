/**
 * useWallet Hook
 * 
 * Updated for Issue #120: Improved network switching detection 
 * and state synchronization with StellarWalletsKit.
 */

import { useState, useEffect, useCallback } from "react";
import {
    connectWallet,
    disconnectWallet,
    getAccountAddress,
    getNetwork,
    isWalletConnected,
    isWalletInstalled,
    setNetwork,
    signTransaction,
} from "../services/walletService";

export interface WalletState {
    address: string | null;
    isConnected: boolean;
    isConnecting: boolean;
    isDisconnecting: boolean;
    error: string | null;
    isWalletAvailable: boolean;
    network: string | null; // e.g., "testnet" or "public"
    isWrongNetwork: boolean;
}

export interface UseWalletReturn extends WalletState {
    connect: () => Promise<void>;
    disconnect: () => Promise<void>;
    refresh: () => Promise<void>;
    signTx: (transaction: any) => Promise<any>;
    switchNetwork: () => Promise<void>;
}

export function useWallet(): UseWalletReturn {
    const [state, setState] = useState<WalletState>({
        address: null,
        isConnected: false,
        isConnecting: false,
        isDisconnecting: false,
        error: null,
        isWalletAvailable: false,
        network: null,
        isWrongNetwork: false,
    });

    // The network the app expects from .env (e.g., "testnet")
    const APP_REQUIRED_NETWORK = import.meta.env.VITE_STELLAR_NETWORK || "testnet";

    /**
     * Refresh wallet state and validate network
     */
    const refresh = useCallback(async () => {
        try {
            const available = await isWalletInstalled();
            const connected = await isWalletConnected();
            const address = connected ? await getAccountAddress() : null;
            const network = connected ? await getNetwork() : null;

            // Check if user is on the wrong network
            // Note: We compare simplified names like "testnet" vs "testnet"
            const isWrongNetwork = 
                connected && 
                network !== null &&
                network.toLowerCase() !== APP_REQUIRED_NETWORK.toLowerCase();

            setState((prev) => ({
                ...prev,
                isWalletAvailable: available,
                isConnected: connected,
                address,
                network,
                isWrongNetwork,
                error: null,
            }));
        } catch (error) {
            console.error("Wallet refresh failed:", error);
        }
    }, [APP_REQUIRED_NETWORK]);

    const connect = useCallback(async () => {
        setState((prev) => ({ ...prev, isConnecting: true, error: null }));

        try {
            const result = await connectWallet();
            if (result.success) {
                await refresh();
            } else {
                setState((prev) => ({
                    ...prev,
                    isConnecting: false,
                    error: result.error || "Connection failed",
                }));
            }
        } catch (error) {
            setState((prev) => ({
                ...prev,
                isConnecting: false,
                error: error instanceof Error ? error.message : "Connect error",
            }));
        }
    }, [refresh]);

    const disconnect = useCallback(async () => {
        setState((prev) => ({ ...prev, isDisconnecting: true }));
        try {
            await disconnectWallet();
            setState((prev) => ({
                ...prev,
                address: null,
                isConnected: false,
                isDisconnecting: false,
                network: null,
                isWrongNetwork: false,
            }));
        } catch (error) {
            setState((prev) => ({ ...prev, isDisconnecting: false }));
        }
    }, []);

    const switchNetwork = useCallback(async () => {
        try {
            // In most Stellar wallets, this just triggers a warning or prompt
            await setNetwork(APP_REQUIRED_NETWORK);
            await refresh();
        } catch (error) {
            setState((prev) => ({
                ...prev,
                error: "Please switch network manually in your wallet extension."
            }));
        }
    }, [refresh, APP_REQUIRED_NETWORK]);

    const signTx = useCallback(async (transaction: any) => {
        if (!state.isConnected) throw new Error("Wallet not connected");
        if (state.isWrongNetwork) throw new Error(`Please switch to ${APP_REQUIRED_NETWORK}`);
        
        return await signTransaction(transaction);
    }, [state.isConnected, state.isWrongNetwork, APP_REQUIRED_NETWORK]);

    useEffect(() => {
        refresh();
        // Poll every 5 seconds to detect manual network/account changes in the extension
        const interval = setInterval(refresh, 5000);
        return () => clearInterval(interval);
    }, [refresh]);

    return {
        ...state,
        connect,
        disconnect,
        refresh,
        signTx,
        switchNetwork,
    };
}