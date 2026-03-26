import { WalletAdapter, WalletAdapterOptions } from './wallet.adapter';
import { TikkaSdkError, TikkaSdkErrorCode } from '../utils/errors';

export class XBullAdapter implements WalletAdapter {
  constructor(private options: WalletAdapterOptions = {}) {}

  isAvailable(): boolean {
    return typeof window !== 'undefined' && 'xBullSDK' in window;
  }

  async getPublicKey(): Promise<string> {
    throw new TikkaSdkError(TikkaSdkErrorCode.NotImplemented, "xBull implementation missing");
  }

  async signTransaction(xdr: string, options?: WalletAdapterOptions): Promise<string> {
    throw new TikkaSdkError(TikkaSdkErrorCode.NotImplemented, "xBull implementation missing");
  }
}
