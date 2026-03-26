export enum WalletName {
  XBull = 'xbull',
  Albedo = 'albedo',
}

export interface WalletAdapterOptions {
  networkPassphrase?: string;
}

export abstract class WalletAdapter {
  constructor(protected readonly options: WalletAdapterOptions = {}) {}
  abstract isAvailable(): boolean;
}
