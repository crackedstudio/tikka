import { RpcService } from '../../network/rpc.service';
import { NetworkConfig } from '../../network/network.config';
import { ContractFn } from '../../contract/bindings';
import { getRaffleContractId } from '../../contract/constants';
import { ContractResponse } from '../../contract/response';
import { UserParticipation } from './user.types';
import {
  Contract,
  TransactionBuilder,
  BASE_FEE,
  scValToNative,
  nativeToScVal,
  rpc,
  Address,
} from '@stellar/stellar-sdk';
import { TikkaSdkError, TikkaSdkErrorCode } from '../../utils/errors';
import { assertValidPublicKey } from '../../utils/validation';

const ANON_KEY = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

/**
 * Read-only user queries — no wallet or signing dependencies required.
 * Suitable for public dashboards and SSR pages.
 */
export class ReadOnlyUserService {
  private readonly contractId: string;

  constructor(
    private readonly rpcService: RpcService,
    private readonly networkConfig: NetworkConfig,
  ) {
    this.contractId = getRaffleContractId(networkConfig.network);
  }

  /**
   * Fetch on-chain participation profile for a user address.
   * Alias for `getParticipation`.
   */
  async getProfile(address: string): Promise<ContractResponse<UserParticipation>> {
    assertValidPublicKey(address);
    const raw = await this.simulate<{
      total_raffles_entered: number;
      total_tickets_bought: number;
      total_raffles_won: number;
      raffle_ids: number[];
    }>(ContractFn.GET_USER_PARTICIPATION, [new Address(address)]);

    return {
      success: true,
      value: {
        address,
        totalRafflesEntered: raw.total_raffles_entered,
        totalTicketsBought: raw.total_tickets_bought,
        totalRafflesWon: raw.total_raffles_won,
        raffleIds: raw.raffle_ids,
      },
    };
  }

  /**
   * Fetch the list of raffle IDs a user has participated in.
   * Alias for participation raffle IDs, suitable for building history views.
   */
  async getHistory(address: string): Promise<ContractResponse<number[]>> {
    assertValidPublicKey(address);
    const profile = await this.getProfile(address);
    if (!profile.success) return profile as ContractResponse<number[]>;
    return { success: true, value: profile.value!.raffleIds };
  }

  private async simulate<T>(method: string, params: any[]): Promise<T> {
    const server = this.rpcService.getServer();
    const contract = new Contract(this.contractId);

    let account: any;
    try {
      account = await server.getAccount(ANON_KEY);
    } catch {
      account = { accountId: () => ANON_KEY, sequenceNumber: () => '0' } as any;
    }

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.networkConfig.networkPassphrase,
    })
      .addOperation(
        contract.call(
          method,
          ...params.map((p) => (p instanceof Object && 'toScVal' in p ? p.toScVal() : nativeToScVal(p))),
        ),
      )
      .setTimeout(30)
      .build();

    const simResp = await this.rpcService.simulateTransaction(tx);

    if (rpc.Api.isSimulationError(simResp)) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.SimulationFailed,
        `Read-only simulation of ${method} failed: ${(simResp as any).error}`,
      );
    }

    const result = (simResp as rpc.Api.SimulateTransactionSuccessResponse).result?.retval;
    if (result === undefined) {
      throw new TikkaSdkError(TikkaSdkErrorCode.SimulationFailed, `No return value from ${method}`);
    }
    return scValToNative(result) as T;
  }
}
