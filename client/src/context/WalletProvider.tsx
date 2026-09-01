import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

interface WalletContextValue {
  address: string | null;
  isConnected: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletContextValue | undefined>(undefined);

let walletKitPromise: Promise<any> | null = null;

function getWalletKit() {
  if (!walletKitPromise) {
    walletKitPromise = import("@creit.tech/stellar-wallets-kit").then(({ WalletKit }) => {
      const network = import.meta.env.VITE_STELLAR_NETWORK ?? "testnet";
      const networkPassphrase =
        network === "mainnet"
          ? "Public Global Stellar Network ; September 2015"
          : "Test SDF Network ; September 2015";
      return new WalletKit({
        network,
        networkPassphrase,
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
    await walletKit.openModal();
    const publicKey = await walletKit.getPublicKey();
    setAddress(publicKey);
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
