import {
  WalletAdapter,
  WalletAdapterOptions,
  WalletName,
  SignTransactionResult,
} from './wallet.interface';

/**
 * LOBSTR wallet adapter (Stub).
 * 
 * LOBSTR currently doesn't provide a direct browser extension SDK 
 * similar to Freighter or xBull for Soroban. This adapter serves
 * as a placeholder for future integration or deep-linking.
 */
export class LobstrAdapter extends WalletAdapter {
  readonly name = WalletName.LOBSTR;

  constructor(options: WalletAdapterOptions = {}) {
    super(options);
  }

  isAvailable(): boolean {
    // LOBSTR doesn't have a reliable window detection for Soroban yet
    return false;
  }

  async getPublicKey(): Promise<string> {
    throw new Error('LOBSTR adapter is not yet implemented for Soroban');
  }

  async signTransaction(
    _xdr: string,
    _opts?: { networkPassphrase?: string; accountToSign?: string },
  ): Promise<SignTransactionResult> {
    throw new Error('LOBSTR adapter is not yet implemented for Soroban');
  }
}
