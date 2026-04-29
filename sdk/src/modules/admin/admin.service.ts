import { Injectable } from '@nestjs/common';
import { ContractService } from '../../contract/contract.service';
import { ContractFn } from '../../contract/bindings';
import { assertNonEmpty } from '../../utils/validation';
import { AdminWriteOptions } from './admin.types';
import { ContractResponse } from '../../contract/response';

@Injectable()
export class AdminService {
  constructor(private readonly contract: ContractService) {}

  async pause(options: AdminWriteOptions = {}): Promise<ContractResponse<void>> {
    return this.contract.invoke<void>(ContractFn.PAUSE, [], { memo: options.memo });
  }

  async unpause(options: AdminWriteOptions = {}): Promise<ContractResponse<void>> {
    return this.contract.invoke<void>(ContractFn.UNPAUSE, [], { memo: options.memo });
  }

  async isPaused(): Promise<ContractResponse<boolean>> {
    return this.contract.simulateReadOnly<boolean>(ContractFn.IS_PAUSED, []);
  }

  async getAdmin(): Promise<ContractResponse<string>> {
    return this.contract.simulateReadOnly<string>(ContractFn.GET_ADMIN, []);
  }

  async transferAdmin(newAdmin: string, options: AdminWriteOptions = {}): Promise<ContractResponse<void>> {
    assertNonEmpty(newAdmin, 'newAdmin');
    return this.contract.invoke<void>(
      ContractFn.TRANSFER_ADMIN,
      [newAdmin],
      { memo: options.memo },
    );
  }

  async acceptAdmin(options: AdminWriteOptions = {}): Promise<ContractResponse<void>> {
    return this.contract.invoke<void>(ContractFn.ACCEPT_ADMIN, [], { memo: options.memo });
  }
}
