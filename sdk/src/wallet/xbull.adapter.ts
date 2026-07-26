import {
  WalletAdapter,
  WalletAdapterOptions,
  WalletName,
  SignTransactionResult,
  WalletCapabilities,
} from './wallet.interface';
import { TikkaSdkError, TikkaSdkErrorCode } from '../utils/errors';


interface TrackedListener {
  type: string;
  handler: EventListenerOrEventListenerObject;
}


export class XBullAdapter extends WalletAdapter {
  readonly name = WalletName.XBull;

  /** Internal connection state, toggled by connect()/disconnect(). */
  private connected = false;

  /** Cached address resolved at connect time; cleared on disconnect. */
  private address: string | null = null;

  /** All window listeners registered during connect(), removed on disconnect(). */
  private listeners: TrackedListener[] = [];

  constructor(options: WalletAdapterOptions = {}) {
    super(options);
  }

  isAvailable(): boolean {
    return (
      typeof globalThis !== 'undefined' &&
      typeof (globalThis as any).xbull !== 'undefined'
    );
  }


  async connect(): Promise<void> {
    this.assertInstalled();

    // Re-resolving on an existing connection must not stack listeners.
    if (this.connected) {
      this.removeAllListeners();
    }

    try {
      const sdk = this.getSdk();
      this.address = await sdk.getPublicKey();
      this.connected = true;
    } catch (err: any) {
      this.resetState();
      if (this.isUserRejection(err)) {
        throw new TikkaSdkError(
          TikkaSdkErrorCode.UserRejected,
          'User rejected xBull request',
          err,
        );
      }
      throw new TikkaSdkError(
        TikkaSdkErrorCode.Unknown,
        `xBull connect failed: ${err?.message ?? err}`,
        err,
      );
    }
  }

  
  async disconnect(): Promise<void> {
    this.removeAllListeners();
    this.resetState();
  }

  /** Whether the adapter currently considers itself connected (cached flag). */
  isWalletConnected(): boolean {
    return this.connected;
  }

  async getPublicKey(): Promise<string> {
    this.assertInstalled();
    this.assertConnected();

    if (this.address) {
      return this.address;
    }

    try {
      const sdk = this.getSdk();
      const publicKey: string = await sdk.getPublicKey();
      this.address = publicKey;
      return publicKey;
    } catch (err: any) {
      throw this.mapError(err, 'getPublicKey', 'User rejected xBull request');
    }
  }

  async signTransaction(
    xdr: string,
    opts?: { networkPassphrase?: string; accountToSign?: string },
  ): Promise<SignTransactionResult> {
    this.assertInstalled();
    this.assertConnected();

    const networkPassphrase =
      opts?.networkPassphrase ?? this.options.networkPassphrase;

    try {
      const sdk = this.getSdk();

      const signedXdr: string = await sdk.signTransaction(xdr, {
        networkPassphrase,
        accountToSign: opts?.accountToSign,
      });

      return { signedXdr };
    } catch (err: any) {
      throw this.mapError(err, 'signTransaction', 'User rejected transaction signing');
    }
  }

  /* Capabilities*/

  getCapabilities(): WalletCapabilities {
    return {
      supportsGetPublicKey: true,
      supportsSignTransaction: true,
      supportsSignMessage: false,
      supportsGetNetwork: false,
    };
  }

  /* Helpers  */
  private addTrackedListener(
    type: string,
    handler: EventListenerOrEventListenerObject,
  ): void {
    const target = (globalThis as any).window;
    if (target?.addEventListener) {
      target.addEventListener(type, handler);
      this.listeners.push({ type, handler });
    }
  }

  /** Removes every tracked listener and empties the tracking array. */
  private removeAllListeners(): void {
    const target = (globalThis as any).window;
    for (const { type, handler } of this.listeners) {
      target?.removeEventListener?.(type, handler);
    }
    this.listeners = [];
  }

  /** Clears connection flag and cached address. */
  private resetState(): void {
    this.connected = false;
    this.address = null;
  }

  private getSdk(): any {
    return (globalThis as any).xbull;
  }

  private assertInstalled(): void {
    if (!this.isAvailable()) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.WalletNotInstalled,
        'xBull wallet is not installed. Install it from https://xbull.app',
      );
    }
  }

  private assertConnected(): void {
    if (!this.connected) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.WalletNotConnected,
        'xBull wallet is not connected. Call connect() before using wallet methods.',
      );
    }
  }

  private mapError(err: any, op: string, rejectionMessage: string): TikkaSdkError {
    if (err instanceof TikkaSdkError) {
      return err;
    }
    if (this.isUserRejection(err)) {
      return new TikkaSdkError(
        TikkaSdkErrorCode.UserRejected,
        rejectionMessage,
        err,
      );
    }
    return new TikkaSdkError(
      TikkaSdkErrorCode.Unknown,
      `xBull ${op} failed: ${err?.message ?? err}`,
      err,
    );
  }

  private isUserRejection(err: any): boolean {
    const msg = String(err?.message ?? err).toLowerCase();
    return (
      msg.includes('cancel') ||
      msg.includes('reject') ||
      msg.includes('denied')
    );
  }
}