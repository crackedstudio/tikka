import {
  WalletAdapter,
  WalletAdapterOptions,
  WalletName,
  SignTransactionResult,
  WalletCapabilities,
} from './wallet.interface';
import { TikkaSdkError, TikkaSdkErrorCode } from '../utils/errors';

/**
 * Freighter wallet adapter.
 *
 * Uses `@stellar/freighter-api` (or the global `window.freighter`)
 * to request public keys and sign Soroban transactions.
 *
 * @see https://docs.freighter.app/
 */
export class FreighterAdapter extends WalletAdapter {
  readonly name = WalletName.Freighter;
  private connectedPublicKey: string | null = null;

  constructor(options: WalletAdapterOptions = {}) {
    super(options);
    this.attemptAutoReconnect();
  }

  /* ------------------------------------------------------------------ */
  /*  Availability                                                       */
  /* ------------------------------------------------------------------ */

  isAvailable(): boolean {
    return this.hasFreighterGlobal();
  }

  /* ------------------------------------------------------------------ */
  /*  Connection                                                         */
  /* ------------------------------------------------------------------ */

  /**
   * Connects to Freighter. Attempts auto-reconnect first if already connected.
   * This is optional - getPublicKey() will also work without explicit connect().
   */
  async connect(): Promise<void> {
    this.assertInstalled();
    
    // If already auto-reconnected, we're done
    if (this.connectedPublicKey) {
      return;
    }

    // Attempt auto-reconnect
    await this.attemptAutoReconnect();
    
    // If auto-reconnect didn't work, getPublicKey() will prompt the user
    if (!this.connectedPublicKey) {
      // Trigger connection by getting public key
      await this.getPublicKey();
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Public key                                                         */
  /* ------------------------------------------------------------------ */

  async getPublicKey(): Promise<string> {
    this.assertInstalled();
    
    // If already connected, return cached key without prompting
    if (this.connectedPublicKey) {
      return this.connectedPublicKey;
    }
    
    try {
      const freighterApi = await this.getFreighterApi();
      const { address } = await freighterApi.getAddress();
      this.connectedPublicKey = address;
      return address;
    } catch (err: any) {
      if (this.isUserRejection(err)) {
        throw new TikkaSdkError(
          TikkaSdkErrorCode.UserRejected,
          'User rejected public key request',
          err,
        );
      }
      throw new TikkaSdkError(
        TikkaSdkErrorCode.Unknown,
        `Freighter getPublicKey failed: ${err?.message ?? err}`,
        err,
      );
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Sign transaction                                                   */
  /* ------------------------------------------------------------------ */

  async signTransaction(
    xdr: string,
    opts?: { networkPassphrase?: string; accountToSign?: string },
  ): Promise<SignTransactionResult> {
    this.assertInstalled();
    const networkPassphrase =
      opts?.networkPassphrase ?? this.options.networkPassphrase;

    try {
      const freighterApi = await this.getFreighterApi();
      const { signedTxXdr } = await freighterApi.signTransaction(xdr, {
        networkPassphrase,
        accountToSign: opts?.accountToSign,
      });
      return { signedXdr: signedTxXdr };
    } catch (err: any) {
      if (this.isUserRejection(err)) {
        throw new TikkaSdkError(
          TikkaSdkErrorCode.UserRejected,
          'User rejected transaction signing',
          err,
        );
      }
      throw new TikkaSdkError(
        TikkaSdkErrorCode.Unknown,
        `Freighter signTransaction failed: ${err?.message ?? err}`,
        err,
      );
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Sign message (Freighter supports this since v5.3)                  */
  /* ------------------------------------------------------------------ */

  override async signMessage(message: string): Promise<string> {
    this.assertInstalled();
    try {
      const freighterApi = await this.getFreighterApi();
      // Freighter exposes signMessage as signBlob with a text encoder
      if (typeof (freighterApi as any).signMessage === 'function') {
        const { signedMessage } = await (freighterApi as any).signMessage(message);
        return signedMessage;
      }
      throw new Error('signMessage not supported by this Freighter version');
    } catch (err: any) {
      if (this.isUserRejection(err)) {
        throw new TikkaSdkError(
          TikkaSdkErrorCode.UserRejected,
          'User rejected message signing',
          err,
        );
      }
      throw new TikkaSdkError(
        TikkaSdkErrorCode.Unknown,
        `Freighter signMessage failed: ${err?.message ?? err}`,
        err,
      );
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Get network                                                        */
  /* ------------------------------------------------------------------ */

  override async getNetwork(): Promise<string | undefined> {
    try {
      const freighterApi = await this.getFreighterApi();
      const { networkPassphrase } = await freighterApi.getNetworkDetails();
      return networkPassphrase;
    } catch {
      return undefined;
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Capabilities                                                       */
  /* ------------------------------------------------------------------ */

  getCapabilities(): WalletCapabilities {
    return {
      supportsGetPublicKey: true,
      supportsSignTransaction: true,
      supportsSignMessage: true,
      supportsGetNetwork: true,
    };
  }

  /* ------------------------------------------------------------------ */
  /*  Private helpers                                                    */
  /* ------------------------------------------------------------------ */

  private hasFreighterGlobal(): boolean {
    return (
      typeof globalThis !== 'undefined' &&
      typeof (globalThis as any).freighter !== 'undefined'
    );
  }

  private assertInstalled(): void {
    if (!this.isAvailable()) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.WalletNotInstalled,
        'Freighter wallet extension is not installed. Get it at https://freighter.app',
      );
    }
  }

  /**
   * Lazily imports `@stellar/freighter-api` so the SDK doesn't hard-fail
   * when Freighter isn't present (the package reads `window.freighter`).
   */
  private async getFreighterApi() {
    try {
      // Dynamic import — only loaded when actually needed.
      return await import('@stellar/freighter-api');
    } catch {
      // If the npm package isn't installed, fall back to the global
      const g = globalThis as any;
      if (g.freighter) return g.freighter;
      throw new TikkaSdkError(
        TikkaSdkErrorCode.WalletNotInstalled,
        '@stellar/freighter-api is not installed and window.freighter is not available',
      );
    }
  }

  private isUserRejection(err: any): boolean {
    const msg = String(err?.message ?? err).toLowerCase();
    return (
      msg.includes('user declined') ||
      msg.includes('user rejected') ||
      msg.includes('cancelled')
    );
  }

  /**
   * Attempts to auto-reconnect if Freighter is already connected
   * without showing a permission prompt to the user.
   */
  private async attemptAutoReconnect(): Promise<void> {
    try {
      if (!this.isAvailable()) return;

      const freighterApi = await this.getFreighterApi();
      
      // Check if Freighter is already connected
      if (typeof freighterApi.isConnected === 'function') {
        const connected = await freighterApi.isConnected();
        
        if (connected) {
          // Retrieve the public key without showing permission prompt
          const { address } = await freighterApi.getAddress();
          this.connectedPublicKey = address;
          
          // Emit reconnected event if the adapter supports events
          this.emitReconnected();
        }
      }
    } catch (error) {
      // Silent failure - auto-reconnect is best-effort
      // Don't log to avoid console noise on first load
    }
  }

  /**
   * Emits a reconnected event. Can be extended to support
   * an event emitter pattern if needed by the client.
   */
  private emitReconnected(): void {
    // For now, this is a placeholder for future event emitter integration
    // The client can detect reconnection by checking if getPublicKey()
    // returns immediately without user interaction
  }

  /**
   * Disconnects the wallet and clears cached state
   */
  disconnect(): void {
    this.connectedPublicKey = null;
  }
}
