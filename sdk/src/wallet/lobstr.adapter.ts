import {
  WalletAdapter,
  WalletAdapterOptions,
  WalletAvailability,
  WalletAvailabilityCode,
  WalletName,
  SignTransactionResult,
  WalletCapabilities,
} from './wallet.interface';
import { TikkaSdkError, TikkaSdkErrorCode } from '../utils/errors';
import { hasGlobalProperty } from '../utils/environment';

/**
 * The subset of `@lobstrco/signer-extension-api` this adapter uses.
 *
 * Declared locally because the package is imported lazily — see
 * {@link LobstrAdapter.loadLobstrApi}. A static import dragged a browser-only
 * package (it talks to the extension over `window.postMessage`) into the
 * module graph of every barrel that re-exports the wallet layer, so merely
 * importing `@tikka/sdk` in Node or during SSR loaded browser code.
 */
interface LobstrSignerApi {
  isConnected(): Promise<boolean>;
  getPublicKey(): Promise<string>;
  signTransaction(xdr: string): Promise<string>;
}

/**
 * LOBSTR Wallet Adapter
 */
export class LobstrAdapter extends WalletAdapter {
  readonly name = WalletName.LOBSTR;

  /** Internal connection state, toggled by connect()/disconnect(). */
  private connected = false;

  /** Cached lazy import of the browser-only signer package. */
  private signerApi: Promise<LobstrSignerApi> | null = null;

  constructor(options: WalletAdapterOptions = {}) {
    super(options);
  }

  /**
   * isAvailable returning true makes it discoverable when executing in a browser environment.
   */
  isAvailable(): boolean {
    return hasGlobalProperty('window');
  }

  /**
   * LOBSTR is extension-based: it needs the `window.postMessage` channel the
   * extension injects. Reported as a value so an SSR pass or a Node script can
   * pick a fallback adapter instead of catching a throw.
   */
  checkAvailability(): WalletAvailability {
    if (this.isAvailable()) {
      return {
        available: true,
        code: WalletAvailabilityCode.Available,
        message: 'LOBSTR is available in this browser environment',
      };
    }

    return {
      available: false,
      code: WalletAvailabilityCode.UnsupportedEnvironment,
      message: 'LOBSTR is only available in a browser environment (window is not defined)',
    };
  }

  /**Establishes a connection to the LOBSTR extension and flips the internal*/
  async connect(): Promise<void> {
    if (!this.isAvailable()) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.WalletNotConnected,
        'LOBSTR is only available in a browser environment',
      );
    }

    let extensionConnected = false;
    try {
      const api = await this.loadLobstrApi();
      extensionConnected = await api.isConnected();
    } catch (error: any) {
      // A package that cannot be loaded is already a typed error and is
      // surfaced as-is; anything else is a failed extension probe.
      if (error instanceof TikkaSdkError) {
        throw error;
      }
      throw new TikkaSdkError(
        TikkaSdkErrorCode.WalletNotConnected,
        `LOBSTR connect failed: ${error?.message ?? error}`,
        error,
      );
    }

    if (!extensionConnected) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.WalletNotConnected,
        'LOBSTR extension is not installed or connected',
      );
    }

    this.connected = true;
  }

  /**
   * Resets the internal connection flag. After this, wallet-dependent methods
   * throw WalletNotConnected until connect() is called again.
   */
  async disconnect(): Promise<void> {
    this.connected = false;
  }

  /**Reports whether the adapter currently considers itself connected.*/
  isWalletConnected(): boolean {
    return this.connected;
  }

  async getPublicKey(): Promise<string> {
    await this.assertConnected();

    try {
      const api = await this.loadLobstrApi();
      const pubKey = await api.getPublicKey();
      if (!pubKey) {
        throw new Error('Empty public key returned from LOBSTR');
      }
      return pubKey;
    } catch (error: any) {
      throw this.mapError(error, 'getPublicKey', 'User rejected public key request');
    }
  }

  async signTransaction(
    xdr: string,
    _opts?: { networkPassphrase?: string; accountToSign?: string },
  ): Promise<SignTransactionResult> {
    await this.assertConnected();

    try {
      const api = await this.loadLobstrApi();
      const signedXdr = await api.signTransaction(xdr);
      if (!signedXdr) {
        throw new Error('Failed to sign transaction or signature was empty');
      }
      return { signedXdr };
    } catch (error: any) {
      throw this.mapError(error, 'signTransaction', 'User rejected transaction signing');
    }
  }

  getCapabilities(): WalletCapabilities {
    return {
      supportsGetPublicKey: true,
      supportsSignTransaction: true,
      supportsSignMessage: false,
      supportsGetNetwork: false,
    };
  }

  /**
   * Loads `@lobstrco/signer-extension-api` on first use and caches the promise.
   *
   * Keeping the import inside a method is what makes this module (and every
   * barrel above it) safe to evaluate in Node: the browser-only package is
   * never resolved until a wallet call actually needs it.
   */
  private loadLobstrApi(): Promise<LobstrSignerApi> {
    const cached = this.signerApi;
    if (cached) {
      return cached;
    }

    const pending = import('@lobstrco/signer-extension-api').then(
      (module) => module as unknown as LobstrSignerApi,
      (error: unknown) => {
        // Do not cache a failed load: the next call may run after the
        // bundler/host has changed, and a retry is cheap.
        this.signerApi = null;
        throw new TikkaSdkError(
          TikkaSdkErrorCode.WalletNotInstalled,
          '@lobstrco/signer-extension-api is not installed. Install it or use another wallet.',
          error,
        );
      },
    );

    this.signerApi = pending;
    return pending;
  }

  /**Guard run at the top of every wallet-dependent method. Throws a typed*/
  private async assertConnected(): Promise<void> {
    if (!this.connected) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.WalletNotConnected,
        'LOBSTR wallet is not connected. Call connect() before using wallet methods.',
      );
    }

    // Re-verify against live extension state to avoid acting on a stale flag
    const api = await this.loadLobstrApi();
    let stillConnected = false;
    try {
      stillConnected = await api.isConnected();
    } catch {
      stillConnected = false;
    }

    if (!stillConnected) {
      this.connected = false;
      throw new TikkaSdkError(
        TikkaSdkErrorCode.WalletNotConnected,
        'LOBSTR wallet connection was lost. Call connect() again.',
      );
    }
  }

  /* Maps a raw error thrown by a LOBSTR operation into a typed TikkaSdkError.*/
  private mapError(error: any, op: string, rejectionMessage: string): TikkaSdkError {
    if (error instanceof TikkaSdkError) {
      return error;
    }
    if (this.isUserRejection(error)) {
      return new TikkaSdkError(
        TikkaSdkErrorCode.UserRejected,
        rejectionMessage,
        error,
      );
    }
    return new TikkaSdkError(
      TikkaSdkErrorCode.Unknown,
      `LOBSTR ${op} failed: ${error?.message ?? error}`,
      error,
    );
  }

  private isUserRejection(err: any): boolean {
    const msg = String(err?.message ?? err).toLowerCase();
    return msg.includes('cancel') || msg.includes('reject') || msg.includes('denied');
  }
}
