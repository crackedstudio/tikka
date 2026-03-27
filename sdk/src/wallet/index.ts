export {
  WalletAdapter,
  WalletAdapterOptions,
  WalletName,
  SignTransactionResult,
} from './wallet.interface';

export { FreighterAdapter } from './freighter.adapter';
export { XBullAdapter } from './xbull.adapter';
export { AlbedoAdapter } from './albedo.adapter';
export { LobstrAdapter } from './lobstr.adapter';
export { WalletAdapterFactory } from './wallet.factory';

// Include additional adapters from feature branch
export { LobstrAdapter } from './lobstr.adapter';