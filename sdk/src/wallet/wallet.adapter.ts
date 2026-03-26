export enum WalletName {
  XBull = 'xbull',
  Albedo = 'albedo',
  Lobstr = 'lobstr'
}

export interface WalletAdapterOptions {
  networkPassphrase?: string;
  network?: string;
  [key: string]: any;
}

export interface WalletAdapter {
  isAvailable(): boolean | Promise<boolean>;
  getPublicKey(): Promise<string>;
  signTransaction(xdr: string, options?: WalletAdapterOptions): Promise<string>;
}
