import { isConnected, getPublicKey, signTransaction } from '@lobstrco/signer-extension-api';
import { WalletAdapter, WalletAdapterOptions } from './wallet.adapter';
import { TikkaSdkError, TikkaSdkErrorCode } from '../utils/errors';

/**
 * LOBSTR Wallet Adapter
 * Supports both browser extension and mobile web-views (where LOBSTR injects their API).
 */
export class LobstrAdapter implements WalletAdapter {
  constructor(private options: WalletAdapterOptions = {}) {}

  /**
   * isAvailable returning true makes it discoverable when executing in a browser environment.
   */
  isAvailable(): boolean {
    return typeof window !== 'undefined';
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
        TikkaSdkErrorCode.WalletError,
        `LOBSTR getPublicKey failed: ${error.message || error}`,
      );
    }
  }

  async signTransaction(xdr: string, options?: WalletAdapterOptions): Promise<string> {
    try {
      const connected = await isConnected();
      if (!connected) {
        throw new Error('LOBSTR extension is not installed or connected');
      }

      const signedXdr = await signTransaction(xdr);
      if (!signedXdr) {
        throw new Error('Failed to sign transaction or signature was empty');
      }
      return signedXdr;
    } catch (error: any) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.WalletError,
        `LOBSTR signTransaction failed: ${error.message || error}`,
      );
    }
  }
}
