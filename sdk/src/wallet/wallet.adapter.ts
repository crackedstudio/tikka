/**
 * Re-exports all wallet-related types and adapters.
 * 
 * Backward-compatible: older code importing from `wallet.ts` still works.
 */
export {
  WalletAdapter,
  WalletAdapterOptions,
  WalletName,
  SignTransactionResult,
} from './wallet.interface';