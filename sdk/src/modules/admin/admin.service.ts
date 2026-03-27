import { Injectable } from '@nestjs/common';
import { ContractService } from '../../contract/contract.service';
import { ContractFn } from '../../contract/bindings';
import { assertNonEmpty } from '../../utils/validation';
import {
  PauseResult,
  UnpauseResult,
  TransferAdminResult,
  AcceptAdminResult,
} from './admin.types';

@Injectable()
export class AdminService {
  constructor(private readonly contract: ContractService) {}

  async pause(): Promise<PauseResult> {
    const { txHash, ledger } = await this.contract.invoke(ContractFn.PAUSE, []);
    return { txHash, ledger };
  }

  async unpause(): Promise<UnpauseResult> {
    const { txHash, ledger } = await this.contract.invoke(ContractFn.UNPAUSE, []);
    return { txHash, ledger };
  }

  async isPaused(): Promise<boolean> {
    return this.contract.simulateReadOnly<boolean>(ContractFn.IS_PAUSED, []);
  }

  async getAdmin(): Promise<string> {
    return this.contract.simulateReadOnly<string>(ContractFn.GET_ADMIN, []);
  }

  async transferAdmin(newAdmin: string): Promise<TransferAdminResult> {
    assertNonEmpty(newAdmin, 'newAdmin');
    const { txHash, ledger } = await this.contract.invoke(
      ContractFn.TRANSFER_ADMIN,
      [newAdmin],
    );
    return { txHash, ledger };
  }

  async acceptAdmin(): Promise<AcceptAdminResult> {
    const { txHash, ledger } = await this.contract.invoke(ContractFn.ACCEPT_ADMIN, []);
    return { txHash, ledger };
  }
}
