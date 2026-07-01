/**
 * WalletAdapter — abstract interface for Stellar wallet integrations.
 *
 * Implementations: FreighterAdapter, XBullAdapter, AlbedoAdapter, LOBSTRAdapter
 */

export enum WalletName {
  Freighter = 'freighter',
  XBull = 'xbull',
  Albedo = 'albedo',
  LOBSTR = 'lobstr',
  Rabet = 'rabet',
  Mock = 'mock',
}

export interface WalletAdapterOptions {
  /** Stellar network passphrase (e.g. Networks.TESTNET) */
  networkPassphrase?: string;
}

export interface SignTransactionResult {
  /** Signed XDR envelope */
  signedXdr: string;
}

/**
 * Describes which operations a wallet adapter supports.
 * Used to enable adaptive UI behavior based on wallet capabilities.
 */
export interface WalletCapabilities {
  /**
   * Whether the adapter supports retrieving the user's public key.
   * @default true
   */
  supportsGetPublicKey: boolean;

  /**
   * Whether the adapter supports signing Soroban transactions.
   * @default true
   */
  supportsSignTransaction: boolean;

  /**
   * Whether the adapter supports signing arbitrary messages (SIWS, etc).
   * @default false
   */
  supportsSignMessage: boolean;

  /**
   * Whether the adapter can retrieve the currently selected network.
   * @default false
   */
  supportsGetNetwork: boolean;
}

/**
 * Common interface every wallet adapter must implement.
 */
export abstract class WalletAdapter {
  abstract readonly name: WalletName;

  constructor(protected readonly options: WalletAdapterOptions = {}) {}

  /**
   * Returns true if the wallet is available in the current environment
   * (e.g. extension installed, or web-based wallet always available).
   */
  abstract isAvailable(): boolean;

  /**
   * Establishes connection to the wallet (optional).
   * Some wallets require explicit connection, others connect implicitly on first use.
   */
  async connect?(): Promise<void>;

  /**
   * Retrieves the user's public key from the wallet.
   * May prompt the user for permission.
   */
  abstract getPublicKey(): Promise<string>;

  /**
   * Signs a Soroban transaction XDR and returns the signed envelope.
   *
   * @param xdr  Base64-encoded transaction envelope XDR
   * @param opts Optional overrides (network passphrase, account to sign for)
   */
  abstract signTransaction(
    xdr: string,
    opts?: { networkPassphrase?: string; accountToSign?: string },
  ): Promise<SignTransactionResult>;

  /**
   * Signs an arbitrary message (used for SIWS auth flows).
   * Not all wallets support this — adapter may throw.
   */
  async signMessage(_message: string): Promise<string> {
    throw new Error(`${this.name} does not support signMessage`);
  }

  /**
   * Returns the currently selected network from the wallet.
   * Not all wallets expose this.
   */
  async getNetwork(): Promise<string | undefined> {
    return undefined;
  }

  /**
   * Returns the capabilities supported by this wallet adapter.
   * Allows UI to adapt dynamically based on wallet features.
   */
  abstract getCapabilities(): WalletCapabilities;

  /**
   * Disconnects the wallet and clears any cached state.
   * Optional - adapters can override if they need cleanup.
   */
  disconnect?(): void;
}
