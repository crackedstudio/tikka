import {
  WalletAdapter,
  WalletAdapterOptions,
  WalletName,
  SignTransactionResult,
} from './wallet.interface';
import { TikkaSdkError, TikkaSdkErrorCode } from '../utils/errors';

/**
 * Albedo wallet adapter.
 *
 * Albedo is a web-based wallet (popup) — no browser extension needed.
 * It dynamically loads the Albedo intent library.
 *
 * @see https://albedo.link
 */
export class AlbedoAdapter extends WalletAdapter {
  readonly name = WalletName.Albedo;

  constructor(options: WalletAdapterOptions = {}) {
    super(options);
  }

  /** Albedo is web-based — always available in a browser environment. */
  isAvailable(): boolean {
    return typeof globalThis !== 'undefined' && typeof (globalThis as any).document !== 'undefined';
  }

  async getPublicKey(): Promise<string> {
    try {
      const albedo = await this.getAlbedoLib();
      const result = await albedo.intent('public_key', {});
      return result.pubkey;
    } catch (err: any) {
      if (this.isUserRejection(err)) {
        throw new TikkaSdkError(TikkaSdkErrorCode.UserRejected, 'User rejected Albedo request', err);
      }
      throw new TikkaSdkError(
        TikkaSdkErrorCode.Unknown,
        `Albedo getPublicKey failed: ${err?.message ?? err}`,
        err,
      );
    }
  }

  async signTransaction(
    xdr: string,
    opts?: { networkPassphrase?: string },
  ): Promise<SignTransactionResult> {
    const networkPassphrase = opts?.networkPassphrase ?? this.options.networkPassphrase;

    try {
      const albedo = await this.getAlbedoLib();
      const result = await albedo.intent('tx', {
        xdr,
        network: networkPassphrase,
      });
      return { signedXdr: result.signed_envelope_xdr };
    } catch (err: any) {
      if (this.isUserRejection(err)) {
        throw new TikkaSdkError(TikkaSdkErrorCode.UserRejected, 'User rejected transaction signing', err);
      }
      throw new TikkaSdkError(
        TikkaSdkErrorCode.Unknown,
        `Albedo signTransaction failed: ${err?.message ?? err}`,
        err,
      );
    }
  }

  /* ------------------------------------------------------------------ */

  private async getAlbedoLib(): Promise<any> {
    try {
      return await import('@albedo-link/intent');
    } catch {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.WalletNotInstalled,
        '@albedo-link/intent package is not installed. Install it or use another wallet.',
      );
    }
  }

  private isUserRejection(err: any): boolean {
    const msg = String(err?.message ?? err).toLowerCase();
    return msg.includes('cancel') || msg.includes('rejected') || msg.includes('denied');
  }
}