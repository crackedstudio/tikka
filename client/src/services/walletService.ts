import {
  allowAllModules,
  FREIGHTER_ID,
  StellarWalletsKit,
  WalletNetwork,
} from "@creit.tech/stellar-wallets-kit";

const SELECTED_WALLET_ID = "selectedWalletId";

/**
 * Helper to convert passphrase to a simple network name
 */
function parsePassphrase(passphrase: string): string {
  if (passphrase.includes("Test")) return "testnet";
  if (passphrase.includes("Public")) return "public";
  return passphrase;
}

/**
 * Get the network passphrase from environment variables
 */
function getNetworkPassphrase(): string {
  const network = import.meta.env.VITE_STELLAR_NETWORK || "testnet";
  const envPassphrase = import.meta.env.VITE_STELLAR_NETWORK_PASSPHRASE;

  if (envPassphrase) return envPassphrase;

  return network === "mainnet" || network === "public"
    ? "Public Global Stellar Network ; September 2015"
    : "Test SDF Network ; September 2015";
}

let kit: StellarWalletsKit | null = null;

export function getKit(): StellarWalletsKit {
  if (!kit) {
    kit = new StellarWalletsKit({
      modules: allowAllModules(),
      network: getNetworkPassphrase() as WalletNetwork,
      selectedWalletId: getSelectedWalletId() ?? FREIGHTER_ID,
    });
  }
  return kit;
}

function getSelectedWalletId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(SELECTED_WALLET_ID);
}

export async function getAccountAddress(): Promise<string | null> {
  try {
    if (!getSelectedWalletId()) return null;
    const { address } = await getKit().getAddress();
    return address;
  } catch (error) {
    console.error("Error getting account address:", error);
    return null;
  }
}

export async function connectWallet(): Promise<{ success: boolean; address?: string; error?: string }> {
  const kitInstance = getKit();
  return new Promise((resolve) => {
    kitInstance.openModal({
      onWalletSelected: async (option: any) => {
        try {
          await setWallet(option.id);
          const address = await getAccountAddress();
          resolve(address ? { success: true, address } : { success: false, error: "No address found" });
        } catch (error: any) {
          resolve({ success: false, error: error.message });
        }
      },
    });
  });
}

async function setWallet(walletId: string): Promise<void> {
  if (typeof window !== "undefined") localStorage.setItem(SELECTED_WALLET_ID, walletId);
  getKit().setWallet(walletId);
}

export async function disconnectWallet(): Promise<void> {
  if (typeof window !== "undefined") localStorage.removeItem(SELECTED_WALLET_ID);
  getKit().disconnect();
}

/**
 * Updated for Issue #120: Gets the current network name
 */
export async function getNetwork(): Promise<string | null> {
  try {
    if (!getSelectedWalletId()) return null;
    const { network } = await getKit().getNetwork();
    return parsePassphrase(network); // Returns "testnet" or "public"
  } catch (error) {
    console.error("Error getting network:", error);
    return null;
  }
}

export async function signTransaction(transaction: any): Promise<any> {
  if (!getSelectedWalletId()) throw new Error("No wallet connected");
  return await getKit().signTransaction(transaction);
}

// Placeholder for future Kit support
export async function promptNetworkSwitch(_targetNetwork: string): Promise<void> {
  console.warn("Manual network switch required in the wallet extension.");
}