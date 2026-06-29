/**
 * useWallet Hook
 * 
 * Thin wrapper over useAuthStore.
 */

import { useEffect, useCallback } from "react";
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
    type WalletCapabilities,
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
    signTx: (transaction: any) => Promise<any>;
    switchNetwork: () => Promise<void>;
}

export function useWallet(): UseWalletReturn {
    const store = useAuthStore();

    // The network the app expects from .env (e.g., "testnet" or "mainnet")
    const APP_REQUIRED_NETWORK = normalizeNetworkName(import.meta.env.VITE_STELLAR_NETWORK || "testnet");

    /**
     * Refresh wallet state and validate network
     */
    const refresh = useCallback(async () => {
        try {
            const available = await isWalletInstalled();
            const connected = await isWalletConnected();
            const address = connected ? await getAccountAddress() : null;
            const network = connected ? await getNetwork() : null;
            const capabilities = getWalletCapabilities();

            // Check if user is on the wrong network
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
            console.error("Wallet refresh failed:", error);
        }
    }, [APP_REQUIRED_NETWORK, store.setWalletState]);

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
            });
        } catch (error) {
            store.setWalletState({ isDisconnecting: false });
        }
    }, [store.setWalletState]);

    const switchNetwork = useCallback(async () => {
        try {
            await setNetwork(APP_REQUIRED_NETWORK);
        } catch (_error) {
            await promptNetworkSwitch(APP_REQUIRED_NETWORK);
            store.setWalletState({
                error: "Please switch network manually in your wallet extension or wallet settings.",
            });
        } finally {
            await refresh();
        }
    }, [refresh, APP_REQUIRED_NETWORK, store.setWalletState]);

    const signTx = useCallback(async (transaction: any) => {
        if (!store.isConnected) throw new Error("Wallet not connected");
        if (store.isWrongNetwork) throw new Error(`Please switch to ${APP_REQUIRED_NETWORK}`);
        
        if (!store.capabilities.canSignTransaction) {
            throw new Error(store.capabilities.unsupportedActionCopy);
        }
        
        return await signTransaction(transaction);
    }, [store.isConnected, store.isWrongNetwork, APP_REQUIRED_NETWORK, store.capabilities]);

    useEffect(() => {
        refresh();
        const interval = setInterval(refresh, 5000);
        return () => clearInterval(interval);
    }, [refresh]);

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