import { WalletAdapter, WalletAdapterOptions } from './wallet.adapter';
import { TikkaSdkError, TikkaSdkErrorCode } from '../utils/errors';

export class AlbedoAdapter implements WalletAdapter {
  constructor(private options: WalletAdapterOptions = {}) {}

  isAvailable(): boolean {
    return typeof window !== 'undefined';
  }

  async getPublicKey(): Promise<string> {
    throw new TikkaSdkError(TikkaSdkErrorCode.NotImplemented, "Albedo implementation missing");
  }

  async signTransaction(xdr: string, options?: WalletAdapterOptions): Promise<string> {
    throw new TikkaSdkError(TikkaSdkErrorCode.NotImplemented, "Albedo implementation missing");
  }
}
