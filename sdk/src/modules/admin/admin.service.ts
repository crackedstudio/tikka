import { Injectable } from '@nestjs/common';
import { ContractService } from '../../contract/contract.service';
import { ContractFn } from '../../contract/bindings';
import { assertNonEmpty } from '../../utils/validation';
import { AdminWriteOptions } from './admin.types';
import { AdminTxResponse, TxResponse } from '../../contract/response';

/**
 * @category Admin
 * @remarks
 * Service for managing Tikka raffle contract administration.
 * Provides methods for pausing/unpausing the contract, transferring admin rights,
 * and querying admin status.
 *
 * @example
 * ```ts
 * const adminService = app.get(AdminService);
 *
 * // Pause the contract (admin only)
 * const pauseResult = await adminService.pause({
 *   memo: 'Maintenance window - pausing raffles'
 * });
 * if (pauseResult.success) {
 *   console.log('Contract paused at ledger:', pauseResult.ledger);
 * }
 *
 * // Check if contract is paused
 * const isPausedResult = await adminService.isPaused();
 * console.log('Contract paused:', isPausedResult.value);
 *
 * // Transfer admin to new address
 * const transferResult = await adminService.transferAdmin(newAdminAddress, {
 *   memo: 'Admin transfer'
 * });
 *
 * // Accept admin rights (must be called by new admin)
 * const acceptResult = await adminService.acceptAdmin();
 * ```
 */
@Injectable()
export class AdminService {
  constructor(private readonly contract: ContractService) {}

  /**
   * Pauses the raffle contract, preventing new raffle creation and ticket purchases.
   * Only callable by the current admin.
   *
   * @param options - Optional configuration for the transaction
   * @returns Promise containing the transaction result with hash and ledger info
   * @throws Will reject if not called by admin
   *
   * @example
   * ```ts
   * const result = await adminService.pause({
   *   memo: 'Emergency pause'
   * });
   * if (result.success) {
   *   console.log('Paused at block:', result.ledger);
   * }
   * ```
   */
  async pause(options: AdminWriteOptions = {}): Promise<ContractResponse<void>> {
    return this.contract.invoke<void>(ContractFn.PAUSE, [], { memo: options.memo });
  }

  /**
   * Resumes the raffle contract after being paused.
   * Only callable by the current admin.
   *
   * @param options - Optional configuration for the transaction
   * @returns Promise containing the transaction result with hash and ledger info
   * @throws Will reject if not called by admin
   *
   * @example
   * ```ts
   * const result = await adminService.unpause({
   *   memo: 'Resume operations'
   * });
   * ```
   */
  async unpause(options: AdminWriteOptions = {}): Promise<ContractResponse<void>> {
    return this.contract.invoke<void>(ContractFn.UNPAUSE, [], { memo: options.memo });
  }

  /**
   * Checks if the raffle contract is currently paused.
   * Read-only operation — no signing required.
   *
   * @returns Promise with boolean indicating pause status
   *
   * @example
   * ```ts
   * const result = await adminService.isPaused();
   * if (result.success) {
   *   console.log('Contract is paused:', result.value);
   * }
   * ```
   */
  async isPaused(): Promise<ContractResponse<boolean>> {
    return this.contract.simulateReadOnly<boolean>(ContractFn.IS_PAUSED, []);
  }

  /**
   * Retrieves the current admin address of the contract.
   * Read-only operation — no signing required.
   *
   * @returns Promise with the Stellar public key of the current admin
   *
   * @example
   * ```ts
   * const result = await adminService.getAdmin();
   * if (result.success) {
   *   console.log('Current admin:', result.value);
   * }
   * ```
   */
  async getAdmin(): Promise<ContractResponse<string>> {
    return this.contract.simulateReadOnly<string>(ContractFn.GET_ADMIN, []);
  }

  /**
   * Initiates a transfer of admin rights to a new address.
   * The new admin must call {@link acceptAdmin} to complete the transfer.
   * Only callable by the current admin.
   *
   * @param newAdmin - Stellar public key of the new admin
   * @param options - Optional configuration for the transaction
   * @returns Promise containing the transaction result
   * @throws Will reject if `newAdmin` is invalid or if not called by admin
   *
   * @example
   * ```ts
   * const newAdminAddress = 'GBIQ...'; // New admin's public key
   * const result = await adminService.transferAdmin(newAdminAddress, {
   *   memo: 'Admin transition'
   * });
   * ```
   */
  async transferAdmin(newAdmin: string, options: AdminWriteOptions = {}): Promise<ContractResponse<void>> {
    assertNonEmpty(newAdmin, 'newAdmin');
    return this.contract.invoke<void>(
      ContractFn.TRANSFER_ADMIN,
      [newAdmin],
      { memo: options.memo },
    );
  }

  /**
   * Accepts pending admin rights.
   * Must be called by the address that was designated as the new admin
   * via {@link transferAdmin}.
   *
   * @param options - Optional configuration for the transaction
   * @returns Promise containing the transaction result
   * @throws Will reject if there are no pending admin rights or if called by wrong address
   *
   * @example
   * ```ts
   * // After current admin calls transferAdmin(newAddress, ...)
   * // The new admin account calls:
   * const result = await adminService.acceptAdmin();
   * if (result.success) {
   *   console.log('Admin rights accepted at block:', result.ledger);
   * }
   * ```
   */
  async acceptAdmin(options: AdminWriteOptions = {}): Promise<ContractResponse<void>> {
    return this.contract.invoke<void>(ContractFn.ACCEPT_ADMIN, [], { memo: options.memo });
  }
}
