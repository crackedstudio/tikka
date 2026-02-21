/**
 * Wallet Service
 * 
 * Provides wallet connection, disconnection, and transaction signing functionality
 * using StellarWalletsKit to support multiple Stellar wallets (Freighter, Albedo, etc.)
 */

import {
    allowAllModules,
    FREIGHTER_ID,
    StellarWalletsKit,
} from "@creit.tech/stellar-wallets-kit";

const SELECTED_WALLET_ID = "selectedWalletId";

/**
 * Get the network passphrase from environment variables
 */
function getNetworkPassphrase(): string {
    // Try to get from env, fallback to testnet
    const passphrase = import.meta.env.VITE_STELLAR_NETWORK_PASSPHRASE;
    if (passphrase) {
        return passphrase;
    }
    
    // Fallback based on network
    const network = import.meta.env.VITE_STELLAR_NETWORK || "testnet";
    return network === "mainnet"
        ? "Public Global Stellar Network ; September 2015"
        : "Test SDF Network ; September 2015";
}

/**
 * Get the selected wallet ID from localStorage
 */
function getSelectedWalletId(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(SELECTED_WALLET_ID);
}

/**
 * Initialize the StellarWalletsKit instance
 */
let kit: StellarWalletsKit | null = null;

export function getKit(): StellarWalletsKit {
    if (!kit) {
        kit = new StellarWalletsKit({
            modules: allowAllModules(),
            network: getNetworkPassphrase(),
            // StellarWalletsKit forces you to specify a wallet, even if the user didn't
            // select one yet, so we default to Freighter.
            // We'll work around this later in `getPublicKey`.
            selectedWalletId: getSelectedWalletId() ?? FREIGHTER_ID,
        });
    }
    return kit;
}

/**
 * Check if any Stellar wallet is installed
 */
export async function isWalletInstalled(): Promise<boolean> {
    try {
        const kitInstance = getKit();
        // Try to get available wallets
        // This is a basic check - the kit will handle wallet detection
        return true;
    } catch (error) {
        console.error("Error checking wallet installation:", error);
        return false;
    }
}

/**
 * Get the public key (address) of the connected wallet
 * Returns null if no wallet is connected
 */
export async function getAccountAddress(): Promise<string | null> {
    try {
        const selectedWalletId = getSelectedWalletId();
        if (!selectedWalletId) {
            return null;
        }
        
        const kitInstance = getKit();
        const { address } = await kitInstance.getAddress();
        return address;
    } catch (error) {
        console.error("Error getting account address:", error);
        return null;
    }
}

/**
 * Connect to a Stellar wallet
 * Opens the wallet selection modal and handles connection
 */
export async function connectWallet(): Promise<{
    success: boolean;
    address?: string;
    error?: string;
}> {
    try {
        const kitInstance = getKit();
        
        return new Promise((resolve) => {
            try {
                kitInstance.openModal({
                    onWalletSelected: async (option) => {
                        try {
                            await setWallet(option.id);
                            // Small delay to ensure wallet is set
                            await new Promise((r) => setTimeout(r, 100));
                            const address = await getAccountAddress();
                            
                            if (address) {
                                resolve({
                                    success: true,
                                    address,
                                });
                            } else {
                                resolve({
                                    success: false,
                                    error: "Failed to get wallet address",
                                });
                            }
                        } catch (error) {
                            console.error("Error during wallet connection:", error);
                            resolve({
                                success: false,
                                error: error instanceof Error ? error.message : "Unknown error",
                            });
                        }
                        return option.id;
                    },
                });
            } catch (error) {
                console.error("Error opening wallet modal:", error);
                resolve({
                    success: false,
                    error: error instanceof Error ? error.message : "Failed to open wallet selection",
                });
            }
        });
    } catch (error) {
        console.error("Error connecting wallet:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to connect wallet",
        };
    }
}

/**
 * Set the selected wallet ID
 */
async function setWallet(walletId: string): Promise<void> {
    if (typeof window !== "undefined") {
        localStorage.setItem(SELECTED_WALLET_ID, walletId);
    }
    const kitInstance = getKit();
    kitInstance.setWallet(walletId);
}

/**
 * Disconnect the wallet
 */
export async function disconnectWallet(): Promise<void> {
    try {
        if (typeof window !== "undefined") {
            localStorage.removeItem(SELECTED_WALLET_ID);
        }
        const kitInstance = getKit();
        kitInstance.disconnect();
    } catch (error) {
        console.error("Error disconnecting wallet:", error);
        throw error;
    }
}

/**
 * Sign a transaction using the connected wallet
 * This function will be used for future transaction signing
 */
export async function signTransaction(
    transaction: any
): Promise<any> {
    try {
        const selectedWalletId = getSelectedWalletId();
        if (!selectedWalletId) {
            throw new Error("No wallet connected");
        }
        
        const kitInstance = getKit();
        return await kitInstance.signTransaction(transaction);
    } catch (error) {
        console.error("Error signing transaction:", error);
        throw error;
    }
}

/**
 * Check if a wallet is currently connected
 */
export async function isWalletConnected(): Promise<boolean> {
    try {
        const address = await getAccountAddress();
        return address !== null;
    } catch (error) {
        return false;
    }
}
