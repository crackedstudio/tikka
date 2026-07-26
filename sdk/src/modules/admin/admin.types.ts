import { TxMemo } from '../../contract/contract.service';

/**
 * Result returned from pausing the raffle contract.
 * @category Admin
 *
 * @example
 * ```ts
 * const result = await adminService.pause();
 * if (result.success) {
 *   console.log(`Pause confirmed at ledger ${result.ledger} - tx: ${result.txHash}`);
 * }
 * ```
 */
export interface PauseResult {
  /** Transaction hash on the Stellar network */
  txHash: string;
  /** Ledger number where the transaction was confirmed */
  ledger: number;
}

/**
 * Result returned from resuming the raffle contract.
 * @category Admin
 *
 * @example
 * ```ts
 * const result = await adminService.unpause();
 * if (result.success) {
 *   console.log(`Resume confirmed at ledger ${result.ledger} - tx: ${result.txHash}`);
 * }
 * ```
 */
export interface UnpauseResult {
  /** Transaction hash on the Stellar network */
  txHash: string;
  /** Ledger number where the transaction was confirmed */
  ledger: number;
}

/**
 * Result returned from initiating admin transfer.
 * The new admin must call {@link AdminService.acceptAdmin} to complete the transfer.
 * @category Admin
 *
 * @example
 * ```ts
 * const result = await adminService.transferAdmin(newAdminAddress);
 * if (result.success) {
 *   console.log(`Transfer initiated at ledger ${result.ledger}`);
 *   console.log('New admin must call acceptAdmin() to complete');
 * }
 * ```
 */
export interface TransferAdminResult {
  /** Transaction hash on the Stellar network */
  txHash: string;
  /** Ledger number where the transaction was confirmed */
  ledger: number;
}

/**
 * Result returned from accepting admin rights.
 * Must be called by the address designated as the new admin.
 * @category Admin
 *
 * @example
 * ```ts
 * const result = await adminService.acceptAdmin();
 * if (result.success) {
 *   console.log(`Admin rights accepted at ledger ${result.ledger}`);
 * }
 * ```
 */
export interface AcceptAdminResult {
  /** Transaction hash on the Stellar network */
  txHash: string;
  /** Ledger number where the transaction was confirmed */
  ledger: number;
}

/**
 * Optional parameters for admin write operations.
 * @category Admin
 *
 * @example
 * ```ts
 * const options: AdminWriteOptions = {
 *   memo: 'pause_during_maintenance'
 * };
 * const result = await adminService.pause(options);
 * ```
 */
export interface AdminWriteOptions {
  /**
   * Optional transaction memo for tracking or external integrations.
   * Supports text (≤28 bytes), numeric id, or 32-byte hash.
   * Useful for on-chain record-keeping and audit trails.
   */
  memo?: TxMemo;
}
