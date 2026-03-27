import { TxMemo } from '../../contract/contract.service';

export interface PauseResult {
  txHash: string;
  ledger: number;
}

export interface UnpauseResult {
  txHash: string;
  ledger: number;
}

export interface TransferAdminResult {
  txHash: string;
  ledger: number;
}

export interface AcceptAdminResult {
  txHash: string;
  ledger: number;
}

/** Optional params shared by admin write operations. */
export interface AdminWriteOptions {
  /**
   * Optional transaction memo for tracking or external integrations.
   * Supports text (≤28 bytes), numeric id, or 32-byte hash.
   */
  memo?: TxMemo;
}
