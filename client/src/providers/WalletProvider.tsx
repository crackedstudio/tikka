import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useWallet, type UseWalletReturn } from "../hooks/useWallet";
import { useAuthStore } from "../store/useAuthStore";

interface WalletContextType extends UseWalletReturn {
  /** true when the connected wallet's network does not match VITE_STELLAR_NETWORK. */
  networkMismatch: boolean;
  /** The network name the app requires (e.g. "testnet" or "public"). */
  requiredNetwork: string;
  /** @deprecated Use networkMismatch. Kept for backwards-compat with existing consumers. */
  isCorrectNetwork: boolean;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

interface WalletProviderProps {
  children: ReactNode;
}

export function WalletProvider({ children }: WalletProviderProps) {
  const wallet = useWallet();
  const store = useAuthStore();
  const requiredNetwork = import.meta.env.VITE_STELLAR_NETWORK || "testnet";

  /**
   * Detect network mismatch immediately after connection.
   */
  const networkMismatch = useMemo(() => {
    if (!store.isConnected || !store.network) return false;
    return store.network.toLowerCase() !== requiredNetwork.toLowerCase();
  }, [store.isConnected, store.network, requiredNetwork]);

  const value: WalletContextType = {
    ...wallet,
    networkMismatch,
    requiredNetwork,
    isCorrectNetwork: !networkMismatch,
  };

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWalletContext(): WalletContextType {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error("useWalletContext must be used within a WalletProvider");
  }
  return context;
}
