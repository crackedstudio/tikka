import {
  allowAllModules,
  FREIGHTER_ID,
  StellarWalletsKit,
  WalletNetwork,
} from "@creit.tech/stellar-wallets-kit";

const SELECTED_WALLET_ID = "selectedWalletId";
const TEST_MODE_WALLET_AVAILABLE_KEY = "tikka_test_wallet_available";
const TEST_MODE_WALLET_CONNECTED_KEY = "tikka_test_wallet_connected";
const TEST_MODE_WALLET_TYPE_KEY = "tikka_test_wallet_type";
const IS_TEST_MODE = import.meta.env.VITE_TEST_MODE === "true";

function getTestModeOverride(key: string): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(key);
}

function isTestWalletAvailable(): boolean {
  if (typeof window === "undefined") return true;
  return getTestModeOverride(TEST_MODE_WALLET_AVAILABLE_KEY) !== "false";
}

function isTestWalletConnected(): boolean {
  if (typeof window === "undefined") return true;
  return isTestWalletAvailable() && getTestModeOverride(TEST_MODE_WALLET_CONNECTED_KEY) !== "false";
}

function getTestWalletType(): string {
  if (typeof window === "undefined") return "freighter";
  if (!isTestWalletAvailable()) return "default";
  return getTestModeOverride(TEST_MODE_WALLET_TYPE_KEY) ?? "freighter";
}

// ─── Wallet Capabilities ────────────────────────────────────────────────────────

/**
 * Represents the capabilities of a Stellar wallet.
 * Different wallets support different features; the UI should check these
 * before attempting operations.
 */
export interface WalletCapabilities {
  /** Whether the wallet can sign transactions */
  canSignTransaction: boolean;
  /** Whether the wallet supports programmatic network switching */
  canSwitchNetwork: boolean;
  /** Whether the wallet supports account address lookup */
  canGetAccount: boolean;
  /** Whether the wallet supports mobile/deep-link URLs */
  supportsMobileDeepLink: boolean;
  /** Human-readable name of the wallet for error messages */
  walletName: string;
  /** Actionable copy to show when a capability is unsupported */
  unsupportedActionCopy: string;
}

/**
 * Capability profiles for known wallet types.
 * These are based on common wallet implementations and may need updates.
 */
const WALLET_CAPABILITY_PROFILES: Record<string, WalletCapabilities> = {
  freighter: {
    canSignTransaction: true,
    canSwitchNetwork: false, // Freighter requires manual network switching
    canGetAccount: true,
    supportsMobileDeepLink: false,
    walletName: "Freighter",
    unsupportedActionCopy: "This action is not supported by Freighter. Please switch networks manually in the extension.",
  },
  lobstr: {
    canSignTransaction: true,
    canSwitchNetwork: false, // LOBSTR requires manual network switching
    canGetAccount: true,
    supportsMobileDeepLink: true, // LOBSTR has mobile app support
    walletName: "LOBSTR",
    unsupportedActionCopy: "This action is not supported by LOBSTR. Please use the mobile app or switch networks manually.",
  },
  xbull: {
    canSignTransaction: true,
    canSwitchNetwork: false,
    canGetAccount: true,
    supportsMobileDeepLink: false,
    walletName: "xBull",
    unsupportedActionCopy: "This action is not supported by xBull. Please switch networks manually in the extension.",
  },
  rabet: {
    canSignTransaction: true,
    canSwitchNetwork: false,
    canGetAccount: true,
    supportsMobileDeepLink: false,
    walletName: "Rabet",
    unsupportedActionCopy: "This action is not supported by Rabet. Please switch networks manually in the extension.",
  },
  default: {
    canSignTransaction: false,
    canSwitchNetwork: false,
    canGetAccount: false,
    supportsMobileDeepLink: false,
    walletName: "Unknown Wallet",
    unsupportedActionCopy: "This wallet may not support the required action. Please try a different wallet like Freighter or LOBSTR.",
  },
};

/**
 * Detects the wallet type from the installed wallet or selected wallet ID.
 * Returns a normalized wallet key for capability lookup.
 */
function detectWalletType(): string {
  if (IS_TEST_MODE) {
    return getTestWalletType();
  }

  const selectedWalletId = getSelectedWalletId();
  if (selectedWalletId) {
    // Map wallet IDs to our capability profiles
    if (selectedWalletId.toLowerCase().includes("freighter")) return "freighter";
    if (selectedWalletId.toLowerCase().includes("lobstr")) return "lobstr";
    if (selectedWalletId.toLowerCase().includes("xbull")) return "xbull";
    if (selectedWalletId.toLowerCase().includes("rabet")) return "rabet";
  }

  // Fallback: detect from window object
  if (typeof window !== "undefined") {
    if ((window as any).freighter) return "freighter";
    if ((window as any).lobstr) return "lobstr";
    if ((window as any).xBull) return "xbull";
    if ((window as any).rabet) return "rabet";
  }

  return "default";
}

/**
 * Gets the capabilities of the currently selected or detected wallet.
 * Returns a default profile if no wallet is detected.
 */
export function getWalletCapabilities(): WalletCapabilities {
  const walletType = detectWalletType();
  return WALLET_CAPABILITY_PROFILES[walletType] || WALLET_CAPABILITY_PROFILES.default;
}

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
  if (IS_TEST_MODE) {
    if (typeof window !== "undefined" && !isTestWalletConnected()) {
      return null;
    }
    return "GTESTADDRESS1234567890ABCDEF";
  }

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
  if (IS_TEST_MODE) {
    if (typeof window !== "undefined") {
      if (!isTestWalletAvailable()) {
        return { success: false, error: "No wallet detected" };
      }
      localStorage.setItem(SELECTED_WALLET_ID, "test-wallet");
      localStorage.setItem(TEST_MODE_WALLET_CONNECTED_KEY, "true");
    }
    return { success: true, address: "GTESTADDRESS1234567890ABCDEF" };
  }

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
  if (IS_TEST_MODE) {
    if (typeof window !== "undefined" && !isTestWalletConnected()) {
      return null;
    }
    return 'testnet';
  }

  try {
    if (!getSelectedWalletId()) return null;
    const { network } = await getKit().getNetwork();
    return parsePassphrase(network); // Returns "testnet" or "public"
  } catch (error) {
    console.error("Error getting network:", error);
    return null;
  }
}

export async function signTransaction(transaction: any): Promise<WalletSignResult> {
  const capabilities = getWalletCapabilities();

  // Check if wallet supports signing before attempting
  if (!capabilities.canSignTransaction) {
    return {
      success: false,
      error: `${capabilities.walletName} does not support transaction signing. ${capabilities.unsupportedActionCopy}`,
    };
  }

  if (IS_TEST_MODE) {
    return {
      success: true,
      signedTransaction: 'test-signed-transaction',
    };
  }

  if (!getSelectedWalletId()) throw new WalletUserRejectedError("No wallet connected");

  const result = await getKit().signTransaction(transaction);
  // Map the kit's result to our WalletSignResult interface
  return {
    success: true,
    signedTransaction: result,
  };
}

export async function isWalletConnected(): Promise<boolean> {
  if (IS_TEST_MODE) {
    return true;
  }

  try {
    const address = await getAccountAddress();
    return address !== null;
  } catch {
    return false;
  }
}

export async function isWalletInstalled(): Promise<boolean> {
  if (IS_TEST_MODE) {
    return isTestWalletAvailable();
  }

  // Check if any wallet extension is available
  return typeof window !== "undefined" && (
    !!(window as any).freighter ||
    !!(window as any).xBull ||
    !!(window as any).rabet
  );
}

export async function setNetwork(network: string): Promise<void> {
  console.warn(`Network switch to ${network} requested. Please switch manually in your wallet extension.`);
  // Most Stellar wallets don't support programmatic network switching
  // Users need to switch manually in their wallet extension
}

// Placeholder for future Kit support
export async function promptNetworkSwitch(_targetNetwork: string): Promise<void> {
  console.warn("Manual network switch required in the wallet extension.");
}

// ─── Typed signing result ─────────────────────────────────────────────────────

/** Typed return value of `signTransaction`. */
export interface WalletSignResult {
  success: boolean;
  signedTransaction?: unknown;
  error?: string;
}

/**
 * Thrown (or surfaced as `error` string) by wallet adapters when the user
 * explicitly dismisses the signing prompt.
 *
 * `classifySignError` in `transactionPipeline.ts` maps any error whose message
 * matches this sentinel's keywords to `PipelineError { code: "USER_REJECTED" }`.
 */
export class WalletUserRejectedError extends Error {
  constructor(message = "User rejected the transaction.") {
    super(message);
    this.name = "WalletUserRejectedError";
  }
}