/**
 * WalletAdapter — abstract interface for Stellar wallet integrations.
 *
 * Implementations: FreighterAdapter, XBullAdapter, AlbedoAdapter,
 * LobstrAdapter, RabetAdapter, MockWalletAdapter, plus any custom adapter
 * that extends this class.
 *
 * @see WALLET_ADAPTER.md for the full integrator contract
 *      (methods, expected errors, and signing flow).
 */

export enum WalletName {
  Freighter = 'freighter',
  XBull = 'xbull',
  Albedo = 'albedo',
  LOBSTR = 'lobstr',
  Rabet = 'rabet',
  Mock = 'mock',
  /** Reserved identifier for third-party / in-house adapters */
  Custom = 'custom',
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
 *
 * Keep these flags honest: never advertise a capability whose method
 * will throw or no-op.
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
 *
 * ### Required methods
 * - {@link isAvailable} — environment / extension detection
 * - {@link getPublicKey} — return the active `G…` account
 * - {@link signTransaction} — sign a base64 transaction envelope XDR
 * - {@link getCapabilities} — advertise supported features
 *
 * ### Optional methods
 * - {@link connect} / {@link disconnect} — explicit session lifecycle
 * - {@link signMessage} — SIWS / arbitrary message signing (default throws)
 * - {@link getNetwork} — selected network passphrase (default `undefined`)
 *
 * ### Expected errors
 * Throw {@link TikkaSdkError} with:
 * - `WalletNotInstalled` — bridge / extension missing
 * - `WalletNotConnected` — present but not authorized
 * - `UserRejected` — user cancelled a prompt
 * - `InvalidParams` — bad XDR / network / account
 * - `Unknown` — unexpected failure (attach `cause`)
 *
 * ### Signing flow
 * SDK builds unsigned XDR → `signTransaction(xdr, opts?)` →
 * adapter returns `{ signedXdr }` → SDK submits to Soroban RPC.
 */
export abstract class WalletAdapter {
  /**
   * Stable adapter identifier. Prefer a {@link WalletName} value for
   * built-ins; custom adapters may use any string (or `WalletName.Custom`).
   */
  abstract readonly name: string;

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
   *
   * @throws {TikkaSdkError} `WalletNotInstalled` | `WalletNotConnected` | `UserRejected` | `Unknown`
   */
  abstract getPublicKey(): Promise<string>;

  /**
   * Signs a Soroban transaction XDR and returns the signed envelope.
   *
   * Prefer `opts.networkPassphrase` when provided; otherwise use
   * `this.options.networkPassphrase`. Return the full signed envelope
   * without stripping existing signatures.
   *
   * @param xdr  Base64-encoded transaction envelope XDR
   * @param opts Optional overrides (network passphrase, account to sign for)
   * @throws {TikkaSdkError} `WalletNotInstalled` | `WalletNotConnected` | `UserRejected` | `InvalidParams` | `Unknown`
   */
  abstract signTransaction(
    xdr: string,
    opts?: { networkPassphrase?: string; accountToSign?: string },
  ): Promise<SignTransactionResult>;

  /**
   * Signs an arbitrary message (used for SIWS auth flows).
   * Not all wallets support this — adapter may throw.
   *
   * @throws {Error} when unsupported (default implementation)
   * @throws {TikkaSdkError} `UserRejected` | `Unknown` when supported but failing
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
