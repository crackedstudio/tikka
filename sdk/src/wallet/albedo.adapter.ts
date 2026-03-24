import { WalletAdapter, WalletAdapterOptions } from './wallet.adapter';

/**
 * Albedo wallet adapter stub.
 * Full implementation is a separate issue.
 */
export class AlbedoAdapter implements WalletAdapter {
  readonly name = 'Albedo';

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_options: WalletAdapterOptions = {}) {}

  isAvailable(): boolean {
    return typeof globalThis !== 'undefined';
  }

  async connect(): Promise<{ address: string }> {
    throw new Error('AlbedoAdapter not yet implemented');
  }

  async disconnect(): Promise<void> {
    throw new Error('AlbedoAdapter not yet implemented');
  }

  async getAddress(): Promise<string> {
    throw new Error('AlbedoAdapter not yet implemented');
  }

  async signTransaction(): Promise<string> {
    throw new Error('AlbedoAdapter not yet implemented');
  }
}
