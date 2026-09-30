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
import { getGlobalProperty, hasGlobalProperty, isBrowserEnvironment } from '../utils/environment';

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

  /**
   * Rabet is an extension wallet reached through the injected `window.rabet`
   * bridge. Reported as a value so SSR/Node callers can branch on it.
   */
  checkAvailability(): WalletAvailability {
    if (this.isAvailable()) {
      return {
        available: true,
        code: WalletAvailabilityCode.Available,
        message: 'Rabet is available in this browser environment',
      };
    }

    if (!isBrowserEnvironment()) {
      return {
        available: false,
        code: WalletAvailabilityCode.UnsupportedEnvironment,
        message: 'Rabet requires a browser environment (window/document are not defined)',
      };
    }

    return {
      available: false,
      code: WalletAvailabilityCode.ExtensionNotInstalled,
      message: 'Rabet wallet extension is not installed. Get it at https://rabet.io',
    };
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
  /*  Capabilities                                                       */
  /* ------------------------------------------------------------------ */

  getCapabilities(): WalletCapabilities {
    return {
      supportsGetPublicKey: true,
      supportsSignTransaction: true,
      supportsSignMessage: false,
      supportsGetNetwork: true,
    };
  }

  /* ------------------------------------------------------------------ */
  /*  Private helpers                                                    */
  /* ------------------------------------------------------------------ */

  private hasRabetGlobal(): boolean {
    return hasGlobalProperty('rabet');
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
    const rabet = getGlobalProperty<any>('rabet');
    if (!rabet) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.WalletNotInstalled,
        'window.rabet is not available',
      );
    }
    return rabet;
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
