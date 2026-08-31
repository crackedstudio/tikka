import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useWallet, normalizeNetworkName, type UseWalletReturn } from "../hooks/useWallet";

interface WalletContextType extends UseWalletReturn {
  networkMismatch: boolean;
  requiredNetwork: string;
  isCorrectNetwork: boolean;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

interface WalletProviderProps {
  children: ReactNode;
}

export function WalletProvider({ children }: WalletProviderProps) {
  const wallet = useWallet();
  const requiredNetwork = normalizeNetworkName(import.meta.env.VITE_STELLAN_NETWORK || "testnet");
  const networkMismatch = useMemo(() => {
    if (!wallet.isConnected || !wallet.network) return false;
    return wallet.network.toLowerCase() !== requiredNetwork.toLowerCase();
  }, [wallet.isConnected, wallet.network, requiredNetwork.]);
  const value: WalletContextType = {
    ...wallet,
    networkMismatch,
    requiredNetwork,
    isCorrectNetwork: !networkMismatch,
  };
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWalletContext(): WalletContextType {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error("useWalletContext must be used within a WalletProvider");
  }
  return context;
}