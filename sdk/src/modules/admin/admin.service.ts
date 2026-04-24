import { Injectable } from '@nestjs/common';
import { ContractService } from '../../contract/contract.service';
import { ContractFn } from '../../contract/bindings';
import { assertNonEmpty } from '../../utils/validation';
import {
  PauseResult,
  UnpauseResult,
  TransferAdminResult,
  AcceptAdminResult,
  AdminWriteOptions,
} from './admin.types';

@Injectable()
export class AdminService {
  constructor(private readonly contract: ContractService) {}

  async pause(options: AdminWriteOptions = {}): Promise<PauseResult> {
    const { txHash, ledger } = await this.contract.invoke(ContractFn.PAUSE, [], { memo: options.memo });
    return { txHash, ledger };
  }

  async unpause(options: AdminWriteOptions = {}): Promise<UnpauseResult> {
    const { txHash, ledger } = await this.contract.invoke(ContractFn.UNPAUSE, [], { memo: options.memo });
    return { txHash, ledger };
  }

  async isPaused(): Promise<boolean> {
    return this.contract.simulateReadOnly<boolean>(ContractFn.IS_PAUSED, []);
  }

  async getAdmin(): Promise<string> {
    return this.contract.simulateReadOnly<string>(ContractFn.GET_ADMIN, []);
  }

  async transferAdmin(newAdmin: string, options: AdminWriteOptions = {}): Promise<TransferAdminResult> {
    assertNonEmpty(newAdmin, 'newAdmin');
    const { txHash, ledger } = await this.contract.invoke(
      ContractFn.TRANSFER_ADMIN,
      [newAdmin],
      { memo: options.memo },
    );
    return { txHash, ledger };
  }

  async acceptAdmin(options: AdminWriteOptions = {}): Promise<AcceptAdminResult> {
    const { txHash, ledger } = await this.contract.invoke(ContractFn.ACCEPT_ADMIN, [], { memo: options.memo });
    return { txHash, ledger };
  }
}
