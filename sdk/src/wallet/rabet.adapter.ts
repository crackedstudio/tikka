import {
  WalletAdapter,
  WalletAdapterOptions,
  WalletName,
  SignTransactionResult,
} from './wallet.interface';
import { TikkaSdkError, TikkaSdkErrorCode } from '../utils/errors';

/**
 * Rabet wallet adapter.
 *
 * Rabet is a lightweight browser extension wallet for Stellar.
 * Uses the global `window.rabet` object to interact with the extension.
 *
 * @see https://rabet.io
 * @see https://docs.rabet.io/api
 */
export class RabetAdapter extends WalletAdapter {
  readonly name = WalletName.Rabet;

  constructor(options: WalletAdapterOptions = {}) {
    super(options);
  }

  /* ------------------------------------------------------------------ */
  /*  Availability                                                       */
  /* ------------------------------------------------------------------ */

  isAvailable(): boolean {
    return this.hasRabetGlobal();
  }

  /* ------------------------------------------------------------------ */
  /*  Public key                                                         */
  /* ------------------------------------------------------------------ */

  async getPublicKey(): Promise<string> {
    this.assertInstalled();
    try {
      const rabet = this.getRabetApi();
      const result = await rabet.connect();
      
      if (result.error) {
        throw new Error(result.error);
      }
      
      return result.publicKey;
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
        `Rabet getPublicKey failed: ${err?.message ?? err}`,
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

    if (!networkPassphrase) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.InvalidParams,
        'Network passphrase is required for Rabet transaction signing',
      );
    }

    try {
      const rabet = this.getRabetApi();
      const result = await rabet.sign(xdr, networkPassphrase);
      
      if (result.error) {
        throw new Error(result.error);
      }
      
      return { signedXdr: result.xdr };
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
        `Rabet signTransaction failed: ${err?.message ?? err}`,
        err,
      );
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Get network                                                        */
  /* ------------------------------------------------------------------ */

  override async getNetwork(): Promise<string | undefined> {
    // Rabet doesn't expose a direct method to get the current network
    // Return the configured network from adapter options
    return this.options.networkPassphrase;
  }

  /* ------------------------------------------------------------------ */
  /*  Private helpers                                                    */
  /* ------------------------------------------------------------------ */

  private hasRabetGlobal(): boolean {
    return (
      typeof globalThis !== 'undefined' &&
      typeof (globalThis as any).rabet !== 'undefined'
    );
  }

  private assertInstalled(): void {
    if (!this.isAvailable()) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.WalletNotInstalled,
        'Rabet wallet extension is not installed. Get it at https://rabet.io',
      );
    }
  }

  private getRabetApi(): any {
    const g = globalThis as any;
    if (!g.rabet) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.WalletNotInstalled,
        'window.rabet is not available',
      );
    }
    return g.rabet;
  }

  private isUserRejection(err: any): boolean {
    const msg = String(err?.message ?? err).toLowerCase();
    return (
      msg.includes('user declined') ||
      msg.includes('user rejected') ||
      msg.includes('rejected') ||
      msg.includes('cancelled') ||
      msg.includes('denied')
    );
  }
}
