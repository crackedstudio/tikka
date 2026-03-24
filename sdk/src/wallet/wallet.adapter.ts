export interface TxSigner {
  signTransaction(
    xdr: string,
    opts: { networkPassphrase: string },
  ): Promise<string>;
}

export interface WalletAdapter extends TxSigner {
  readonly name: string;
  isAvailable(): boolean;
  connect(): Promise<{ address: string }>;
  disconnect(): Promise<void>;
  getAddress(): Promise<string>;
}

export interface WalletAdapterOptions {
  networkPassphrase?: string;
}

export enum WalletName {
  XBull = 'xbull',
  Albedo = 'albedo',
}
