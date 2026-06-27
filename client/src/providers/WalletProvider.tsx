import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useWallet, type UseWalletReturn } from "../hooks/useWallet";
import { normalizeNetworkName } from "../services/walletService";

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
  const requiredNetwork = normalizeNetworkName(import.meta.env.VITE_STELLAR_NETWORK || "testnet");

  /**
   * Detect network mismatch immediately after connection.
   * Returns false (no mismatch) when the wallet is disconnected or the
   * network is not yet known — avoids a false-positive flash on mount.
   */
  const networkMismatch = useMemo(() => {
    if (!wallet.isConnected || !wallet.network) return false;
    return wallet.network.toLowerCase() !== requiredNetwork.toLowerCase();
  }, [wallet.isConnected, wallet.network, requiredNetwork]);

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
