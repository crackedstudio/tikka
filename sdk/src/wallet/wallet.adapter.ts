/**
 * Backward-compatible re-export.
 * The canonical definitions now live in wallet.interface.ts.
 */
export {
  WalletAdapter,
  WalletAdapterOptions,
  WalletName,
  SignTransactionResult,
} from './wallet.interface';export enum WalletName {
  Freighter = 'freighter',
  XBull = 'xbull',
  Albedo = 'albedo',
  Lobstr = 'lobstr', // ✅ add this
}