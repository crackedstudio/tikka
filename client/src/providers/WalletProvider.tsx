/**
 * WalletProvider
 * 
 * React context provider for wallet state management across the application
 */

import React, { createContext, useContext, ReactNode } from "react";
import { useWallet, type UseWalletReturn } from "../hooks/useWallet";

const WalletContext = createContext<UseWalletReturn | undefined>(undefined);

interface WalletProviderProps {
    children: ReactNode;
}

/**
 * WalletProvider component that wraps the app and provides wallet context
 */
export function WalletProvider({ children }: WalletProviderProps) {
    const wallet = useWallet();

    return (
        <WalletContext.Provider value={wallet}>
            {children}
        </WalletContext.Provider>
    );
}

/**
 * Hook to access wallet context
 * Must be used within a WalletProvider
 */
export function useWalletContext(): UseWalletReturn {
    const context = useContext(WalletContext);
    
    if (context === undefined) {
        throw new Error("useWalletContext must be used within a WalletProvider");
    }
    
    return context;
}
