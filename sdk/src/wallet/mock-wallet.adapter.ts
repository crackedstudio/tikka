import {
  WalletAdapter,
  WalletAdapterOptions,
  WalletName,
  SignTransactionResult,
} from './wallet.interface';

export interface MockWalletOptions extends WalletAdapterOptions {
  delayMs?: number;
  publicKey?: string;
  failGetPublicKey?: boolean;
  failSignTransaction?: boolean;
  failSignMessage?: boolean;
}

export class MockWalletAdapter extends WalletAdapter {
  readonly name = WalletName.Mock;

  private readonly mockOptions: MockWalletOptions;

  constructor(options: MockWalletOptions = {}) {
    super(options);
    this.mockOptions = options;
  }

  isAvailable(): boolean {
    return true;
  }

  async getPublicKey(): Promise<string> {
    await this.wait();
    if (this.mockOptions.failGetPublicKey) {
      throw new Error('MockWalletAdapter: getPublicKey failure');
    }
    return this.mockOptions.publicKey ?? 'GDJMOCKWALLET1234567890ABCDEFMOCKPUBLICKEY';
  }

  async signTransaction(xdr: string): Promise<SignTransactionResult> {
    await this.wait();
    if (this.mockOptions.failSignTransaction) {
      throw new Error('MockWalletAdapter: signTransaction failure');
    }
    return { signedXdr: `mock-signed:${xdr}` };
  }

  override async signMessage(message: string): Promise<string> {
    await this.wait();
    if (this.mockOptions.failSignMessage) {
      throw new Error('MockWalletAdapter: signMessage failure');
    }
    return `mock-signature:${message}`;
  }

  private async wait() {
    if (!this.mockOptions.delayMs) return;
    await new Promise((resolve) => setTimeout(resolve, this.mockOptions.delayMs));
  }
}

