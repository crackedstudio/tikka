import { Inject, Injectable } from '@nestjs/common';
import { Contract, xdr } from '@stellar/stellar-sdk';
import { SdkNetworkConfig, SDK_NETWORK_CONFIG } from '../network/network.config';
import { TxSigner } from '../wallet/wallet.adapter';
import { TxLifecycleService, TxResult } from './tx-lifecycle.service';

@Injectable()
export class ContractService {
  private readonly contract: Contract;

  constructor(
    private readonly txLifecycle: TxLifecycleService,
    @Inject(SDK_NETWORK_CONFIG) config: SdkNetworkConfig,
  ) {
    if (!config.contractId) {
      throw new Error('contractId is required in SdkNetworkConfig');
    }
    this.contract = new Contract(config.contractId);
  }

  /**
   * Invoke a contract method that mutates state (write operation).
   * Builds the contract call operation and runs the full transaction lifecycle:
   * simulate → assemble → sign → submit → poll.
   *
   * @param method   Contract method name (e.g. 'buy_ticket')
   * @param params   Pre-encoded ScVal parameters
   * @param sourceAddress  Stellar address of the transaction signer
   * @param signer   TxSigner implementation (wallet adapter or keypair)
   */
  async invoke(
    method: string,
    params: xdr.ScVal[],
    sourceAddress: string,
    signer: TxSigner,
  ): Promise<TxResult> {
    const operation = this.contract.call(method, ...params);
    return this.txLifecycle.execute({ sourceAddress, operation, signer });
  }

  /**
   * Simulates a read-only contract invocation.
   * No signing or submission required — uses a dummy source account.
   *
   * @param method  Contract method name (e.g. 'get_user_tickets')
   * @param params  Pre-encoded ScVal parameters
   * @returns       Decoded contract response
   */
  async simulateReadOnly<T>(method: string, params: xdr.ScVal[]): Promise<T> {
    const operation = this.contract.call(method, ...params);
    return this.txLifecycle.simulate<T>(operation);
  }
}
