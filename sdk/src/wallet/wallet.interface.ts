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
}
