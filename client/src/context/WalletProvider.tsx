import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { allowAllModules, FREIGHTER_ID, StellarWalletsKit } from "@creit.tech/stellar-wallets-kit";

interface WalletContextValue {
  address: string | null;
  isConnected: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletContextValue | undefined>(undefined);

let walletKitPromise: Promise<StellarWalletsKit> | null = null;

function getWalletKit() {
  if (!walletKitPromise) {
    walletKitPromise = import("@creit.tech/stellar-wallets-kit").then(({ StellarWalletsKit: WalletKit }) => {
      const network = import.meta.env.VITE_STELLAR_NETWORK ?? "testnet";
      return new WalletKit({
        modules: allowAllModules(),
        selectedWalletId: FREIGHTER_ID,
        network,
      });
    });
  }
  return walletKitPromise;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const connect = useCallback(async () => {
    const walletKit = await getWalletKit();
    const { address } = await walletKit.getAddress();
    setAddress(address);
    setIsConnected(true);
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    setIsConnected(false);
  }, []);

  const value = useMemo(
    () => ({ address, isConnected, connect, disconnect }),
    [address, isConnected, connect, disconnect]
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}
