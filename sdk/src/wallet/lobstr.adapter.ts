import { isConnected, getPublicKey, signTransaction } from '@lobstrco/signer-extension-api';
import {
  WalletAdapter,
  WalletAdapterOptions,
  WalletName,
  SignTransactionResult,
  WalletCapabilities,
} from './wallet.interface';
import { TikkaSdkError, TikkaSdkErrorCode } from '../utils/errors';

/**
 * LOBSTR Wallet Adapter
 */
export class LobstrAdapter extends WalletAdapter {
  readonly name = WalletName.LOBSTR;

  /** Internal connection state, toggled by connect()/disconnect(). */
  private connected = false;

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

  /*Establishes a connection to the LOBSTR extension and flips the internal*/
 async connect(): Promise<void> {
    if (!this.isAvailable()) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.WalletNotConnected,
        'LOBSTR is only available in a browser environment',
      );
    }

    let extensionConnected = false;
    try {
      extensionConnected = await isConnected();
    } catch (error: any) {
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
      const pubKey = await getPublicKey();
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
      const signedXdr = await signTransaction(xdr);
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

  
  /**Guard run at the top of every wallet-dependent method. Throws a typed*/
  private async assertConnected(): Promise<void> {
    if (!this.connected) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.WalletNotConnected,
        'LOBSTR wallet is not connected. Call connect() before using wallet methods.',
      );
    }

    // Re-verify against live extension state to avoid acting on a stale flag
    let stillConnected = false;
    try {
      stillConnected = await isConnected();
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