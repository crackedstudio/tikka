import { Injectable } from '@nestjs/common';
import { RpcService } from '../network/rpc.service';

@Injectable()
export class ContractService {
  constructor(private readonly rpcService: RpcService) {}

  /**
   * Simulates a read-only contract invocation
   * @param method Contract method name
   * @param params Method parameters
   * @returns Decoded contract response
   */
  async simulateReadOnly<T>(method: string, params: any[]): Promise<T> {
    // In a real implementation, this would build a Soroban transaction
    // and call 'simulateTransaction' on the RPC.
    // For now, we delegate to the customizable rpcService.
    return this.rpcService.request<T>('simulateTransaction', [method, ...params]);
  }
}
