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
    return hasGlobalProperty('document');
  }

  /**
   * Albedo needs the popup/DOM APIs the intent library uses, so the only
   * unavailable case is a non-browser runtime (Node, SSR, React Native).
   * Reported as a value instead of a load-time or call-time throw.
   */
  checkAvailability(): WalletAvailability {
    if (this.isAvailable()) {
      return {
        available: true,
        code: WalletAvailabilityCode.Available,
        message: 'Albedo is available in this browser environment',
      };
    }

    return {
      available: false,
      code: WalletAvailabilityCode.UnsupportedEnvironment,
      message: 'Albedo is a web-based wallet and requires a browser environment (document is not defined)',
    };
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
    opts?: { networkPassphrase?: string; accountToSign?: string },
  ): Promise<SignTransactionResult> {
    const networkPassphrase = opts?.networkPassphrase ?? this.options.networkPassphrase;

    if (!networkPassphrase) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.InvalidParams,
        'Network passphrase is required for Albedo transaction signing',
      );
    }

    try {
      const albedo = await this.getAlbedoLib();
      const intentParams: any = {
        xdr,
        network: networkPassphrase,
      };

      // Optionally specify which account should sign
      if (opts?.accountToSign) {
        intentParams.pubkey = opts.accountToSign;
      }

      const result = await albedo.intent('tx', intentParams);
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

  /**
   * Signs an arbitrary message using Albedo's sign_message intent.
   * Useful for authentication flows (e.g., SIWS - Sign In With Stellar).
   *
   * @param message - Text message to sign
   * @returns HEX-encoded signature
   */
  async signMessage(message: string): Promise<string> {
    try {
      const albedo = await this.getAlbedoLib();
      const result = await albedo.intent('sign_message', { message });
      return result.message_signature;
    } catch (err: any) {
      if (this.isUserRejection(err)) {
        throw new TikkaSdkError(TikkaSdkErrorCode.UserRejected, 'User rejected message signing', err);
      }
      throw new TikkaSdkError(
        TikkaSdkErrorCode.Unknown,
        `Albedo signMessage failed: ${err?.message ?? err}`,
        err,
      );
    }
  }

  /**
   * Returns the network passphrase configured for this adapter.
   * Albedo doesn't expose the user's selected network, so we return
   * the configured network from adapter options.
   */
  async getNetwork(): Promise<string | undefined> {
    return this.options.networkPassphrase;
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

  private async getAlbedoLib(): Promise<any> {
    try {
      const module = await import('@albedo-link/intent');
      return module.default || module;
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