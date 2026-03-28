/**
 * WalletProvider
 * * React context provider for wallet state management across the application.
 * Updated to handle Issue #120: Network switching and connection state.
 */

import React, { createContext, useContext, useMemo, type ReactNode } from "react";
import { useWallet, type UseWalletReturn } from "../hooks/useWallet";

// We extend the return type to include the network status check
interface WalletContextType extends UseWalletReturn {
  isCorrectNetwork: boolean;
  requiredNetwork: string;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

interface WalletProviderProps {
  children: ReactNode;
}

/**
 * WalletProvider component that wraps the app and provides wallet context.
 * Now includes validation for the Stellar network (testnet/mainnet).
 */
export function WalletProvider({ children }: WalletProviderProps) {
  const wallet = useWallet();
  
  // Get the required network from environment variables
  const requiredNetwork = import.meta.env.VITE_STELLAR_NETWORK || 'testnet';

  // Check if the current wallet network matches our app configuration
  const isCorrectNetwork = useMemo(() => {
    if (!wallet.isConnected || !wallet.network) return true;
    return wallet.network.toLowerCase() === requiredNetwork.toLowerCase();
  }, [wallet.isConnected, wallet.network, requiredNetwork]);

  // Combine the hook data with our network validation logic
  const value = {
    ...wallet,
    isCorrectNetwork,
    requiredNetwork
  };

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
}

/**
 * Hook to access wallet context
 * Must be used within a WalletProvider
 */
export function useWalletContext(): WalletContextType {
  const context = useContext(WalletContext);

  if (context === undefined) {
    throw new Error("useWalletContext must be used within a WalletProvider");
  }

  return context;
}