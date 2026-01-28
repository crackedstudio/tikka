/**
 * useWallet Hook
 * 
 * React hook for managing wallet connection state and operations
 */

import { useState, useEffect, useCallback } from "react";
import {
    connectWallet,
    disconnectWallet,
    getAccountAddress,
    isWalletConnected,
    isWalletInstalled,
    signTransaction,
} from "../services/walletService";

export interface WalletState {
    address: string | null;
    isConnected: boolean;
    isConnecting: boolean;
    isDisconnecting: boolean;
    error: string | null;
    isWalletAvailable: boolean;
}

export interface UseWalletReturn extends WalletState {
    connect: () => Promise<void>;
    disconnect: () => Promise<void>;
    refresh: () => Promise<void>;
    signTx: (transaction: any) => Promise<any>;
}

/**
 * Custom hook for wallet management
 */
export function useWallet(): UseWalletReturn {
    const [state, setState] = useState<WalletState>({
        address: null,
        isConnected: false,
        isConnecting: false,
        isDisconnecting: false,
        error: null,
        isWalletAvailable: false,
    });

    /**
     * Check wallet availability and connection status
     */
    const refresh = useCallback(async () => {
        try {
            const available = await isWalletInstalled();
            const connected = await isWalletConnected();
            const address = connected ? await getAccountAddress() : null;

            setState((prev) => ({
                ...prev,
                isWalletAvailable: available,
                isConnected: connected,
                address,
                error: null,
            }));
        } catch (error) {
            setState((prev) => ({
                ...prev,
                error: error instanceof Error ? error.message : "Unknown error",
            }));
        }
    }, []);

    /**
     * Connect to wallet
     */
    const connect = useCallback(async () => {
        setState((prev) => ({
            ...prev,
            isConnecting: true,
            error: null,
        }));

        try {
            const result = await connectWallet();
            
            if (result.success && result.address) {
                setState((prev) => ({
                    ...prev,
                    address: result.address || null,
                    isConnected: true,
                    isConnecting: false,
                    error: null,
                }));
            } else {
                setState((prev) => ({
                    ...prev,
                    isConnecting: false,
                    error: result.error || "Failed to connect wallet",
                }));
            }
        } catch (error) {
            setState((prev) => ({
                ...prev,
                isConnecting: false,
                error: error instanceof Error ? error.message : "Failed to connect wallet",
            }));
        }
    }, []);

    /**
     * Disconnect wallet
     */
    const disconnect = useCallback(async () => {
        setState((prev) => ({
            ...prev,
            isDisconnecting: true,
            error: null,
        }));

        try {
            await disconnectWallet();
            setState({
                address: null,
                isConnected: false,
                isConnecting: false,
                isDisconnecting: false,
                error: null,
                isWalletAvailable: state.isWalletAvailable,
            });
        } catch (error) {
            setState((prev) => ({
                ...prev,
                isDisconnecting: false,
                error: error instanceof Error ? error.message : "Failed to disconnect wallet",
            }));
        }
    }, [state.isWalletAvailable]);

    /**
     * Sign a transaction
     */
    const signTx = useCallback(async (transaction: any) => {
        if (!state.isConnected) {
            throw new Error("Wallet not connected");
        }

        try {
            return await signTransaction(transaction);
        } catch (error) {
            setState((prev) => ({
                ...prev,
                error: error instanceof Error ? error.message : "Failed to sign transaction",
            }));
            throw error;
        }
    }, [state.isConnected]);

    // Check wallet status on mount and when needed
    useEffect(() => {
        refresh();
    }, [refresh]);

    return {
        ...state,
        connect,
        disconnect,
        refresh,
        signTx,
    };
}
