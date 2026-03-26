import {
  WalletAdapter,
  WalletAdapterOptions,
  WalletName,
  SignTransactionResult,
} from './wallet.interface';
import { TikkaSdkError, TikkaSdkErrorCode } from '../utils/errors';

/**
 * xBull wallet adapter.
 *
 * Uses the `window.xBullSDK` global injected by the xBull extension / PWA.
 *
 * @see https://xbull.app
 */
export class XBullAdapter extends WalletAdapter {
  readonly name = WalletName.XBull;

  constructor(options: WalletAdapterOptions = {}) {
    super(options);
  }

  isAvailable(): boolean {
    return (
      typeof globalThis !== 'undefined' &&
      typeof (globalThis as any).xBullSDK !== 'undefined'
    );
  }

  async getPublicKey(): Promise<string> {
    this.assertInstalled();
    try {
      const sdk = this.getSdk();
      const publicKey: string = await sdk.getPublicKey();
      return publicKey;
    } catch (err: any) {
      if (this.isUserRejection(err)) {
        throw new TikkaSdkError(TikkaSdkErrorCode.UserRejected, 'User rejected xBull request', err);
      }
      throw new TikkaSdkError(TikkaSdkErrorCode.Unknown, `xBull getPublicKey failed: ${err?.message ?? err}`, err);
    }
  }

  async signTransaction(
    xdr: string,
    opts?: { networkPassphrase?: string; accountToSign?: string },
  ): Promise<SignTransactionResult> {
    this.assertInstalled();
    const networkPassphrase = opts?.networkPassphrase ?? this.options.networkPassphrase;

    try {
      const sdk = this.getSdk();
      const signedXdr: string = await sdk.signXDR(xdr, {
        networkPassphrase,
        publicKey: opts?.accountToSign,
      });
      return { signedXdr };
    } catch (err: any) {
      if (this.isUserRejection(err)) {
        throw new TikkaSdkError(TikkaSdkErrorCode.UserRejected, 'User rejected transaction signing', err);
      }
      throw new TikkaSdkError(TikkaSdkErrorCode.Unknown, `xBull signTransaction failed: ${err?.message ?? err}`, err);
    }
  }

  /* ------------------------------------------------------------------ */

  private getSdk(): any {
    return (globalThis as any).xBullSDK;
  }

  private assertInstalled(): void {
    if (!this.isAvailable()) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.WalletNotInstalled,
        'xBull wallet is not installed. Get it at https://xbull.app',
      );
    }
  }

  private isUserRejection(err: any): boolean {
    const msg = String(err?.message ?? err).toLowerCase();
    return msg.includes('cancel') || msg.includes('reject') || msg.includes('denied');
  }
}