import { Inject, Injectable } from '@nestjs/common';
import { rpc, Transaction } from '@stellar/stellar-sdk';
import { SdkNetworkConfig, SDK_NETWORK_CONFIG } from './network.config';

@Injectable()
export class RpcService {
  private readonly server: rpc.Server;

  constructor(@Inject(SDK_NETWORK_CONFIG) config: SdkNetworkConfig) {
    this.server = new rpc.Server(config.rpcUrl, { allowHttp: true });
  }

  async getAccount(address: string) {
    return this.server.getAccount(address);
  }

  async simulateTransaction(tx: Transaction) {
    return this.server.simulateTransaction(tx);
  }

  async sendTransaction(tx: Transaction) {
    return this.server.sendTransaction(tx);
  }

  async getTransaction(hash: string) {
    return this.server.getTransaction(hash);
  }
}
