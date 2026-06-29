import { RpcService } from '../../network/rpc.service';
import { NetworkConfig } from '../../network/network.config';
import { ContractFn } from '../../contract/bindings';
import { getRaffleContractId } from '../../contract/constants';
import { ContractResponse } from '../../contract/response';
import { RaffleData } from './raffle.types';
import { RaffleStatus } from '../../contract/bindings';
import {
  Contract,
  TransactionBuilder,
  BASE_FEE,
  scValToNative,
  nativeToScVal,
  rpc,
} from '@stellar/stellar-sdk';
import { TikkaSdkError, TikkaSdkErrorCode } from '../../utils/errors';

const ANON_KEY = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

/**
 * Read-only raffle queries — no wallet or signing dependencies required.
 * Suitable for public dashboards and SSR pages.
 */
export class ReadOnlyRaffleService {
  private readonly contractId: string;

  constructor(
    private readonly rpcService: RpcService,
    private readonly networkConfig: NetworkConfig,
  ) {
    this.contractId = getRaffleContractId(networkConfig.network);
  }

  /** Fetch on-chain data for a single raffle by ID. Alias for `get`. */
  async getById(raffleId: number): Promise<ContractResponse<RaffleData>> {
    const raw = await this.simulate<any>(ContractFn.GET_RAFFLE_DATA, [raffleId]);
    return { status: 'SUCCESS', value: this.mapRaffle(raffleId, raw) };
  }

  /** Return IDs of all raffles (any state). Alias for `listAll`. */
  async getAll(): Promise<ContractResponse<number[]>> {
    const ids = await this.simulate<number[]>(ContractFn.GET_ALL_RAFFLE_IDS, []);
    return { status: 'SUCCESS', value: ids };
  }

  private async simulate<T>(method: string, params: any[]): Promise<T> {
    const server = this.rpcService.getServer();
    const contract = new Contract(this.contractId);

    // Use a dummy account for read-only simulation
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
      .addOperation(contract.call(method, ...params.map((p) => nativeToScVal(p))))
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

  private mapRaffle(raffleId: number, raw: any): RaffleData {
    return {
      raffleId,
      creator: raw.creator ?? '',
      status: raw.status ?? RaffleStatus.Open,
      ticketPrice: String(raw.ticket_price ?? '0'),
      maxTickets: Number(raw.max_tickets ?? 0),
      ticketsSold: Number(raw.tickets_sold ?? 0),
      endTime: Number(raw.end_time ?? 0) * 1000,
      asset: raw.asset ?? 'XLM',
      assetIssuer: raw.asset_issuer || undefined,
      allowMultiple: Boolean(raw.allow_multiple),
      metadataCid: raw.metadata_cid ?? '',
      winner: raw.winner,
      winningTicketId: raw.winning_ticket_id,
      prizeAmount: raw.prize_amount != null ? String(raw.prize_amount) : undefined,
    };
  }
}
