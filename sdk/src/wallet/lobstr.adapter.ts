import { isConnected, getPublicKey, signTransaction } from '@lobstrco/signer-extension-api';
import {
  WalletAdapter,
  WalletAdapterOptions,
  WalletName,
  SignTransactionResult,
} from './wallet.interface';
import { TikkaSdkError, TikkaSdkErrorCode } from '../utils/errors';

/**
 * LOBSTR Wallet Adapter
 * Supports both browser extension and mobile web-views (where LOBSTR injects their API).
 */
export class LobstrAdapter extends WalletAdapter {
  readonly name = WalletName.LOBSTR;

  constructor(options: WalletAdapterOptions = {}) {
    super(options);
  }

  /**
   * isAvailable returning true makes it discoverable when executing in a browser environment.
   */
  isAvailable(): boolean {
    return (
      typeof globalThis !== 'undefined' &&
      typeof (globalThis as any).window !== 'undefined'
    );
  }

  async getPublicKey(): Promise<string> {
    try {
      const connected = await isConnected();
      if (!connected) {
        throw new Error('LOBSTR extension is not installed or connected');
      }

      const pubKey = await getPublicKey();
      if (!pubKey) {
        throw new Error('Empty public key returned from LOBSTR');
      }
      return pubKey;
    } catch (error: any) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.Unknown,
        `LOBSTR getPublicKey failed: ${error.message || error}`,
      );
    }
  }

  async signTransaction(
    xdr: string,
    _opts?: { networkPassphrase?: string; accountToSign?: string },
  ): Promise<SignTransactionResult> {
    try {
      const connected = await isConnected();
      if (!connected) {
        throw new Error('LOBSTR extension is not installed or connected');
      }

      const signedXdr = await signTransaction(xdr);
      if (!signedXdr) {
        throw new Error('Failed to sign transaction or signature was empty');
      }
      return { signedXdr };
    } catch (error: any) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.Unknown,
        `LOBSTR signTransaction failed: ${error.message || error}`,
      );
    }
  }
}
