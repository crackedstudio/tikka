import { RpcService } from '../../network/rpc.service';
import { NetworkConfig } from '../../network/network.config';
import { ContractFn, mapContractStatus } from '../../contract/bindings';
import { getRaffleContractId } from '../../contract/constants';
import { ContractResponse } from '../../contract/response';
import { RaffleData } from './raffle.types';
import {
  Account,
  Contract,
  TransactionBuilder,
  BASE_FEE,
  scValToNative,
  nativeToScVal,
  rpc,
} from '@stellar/stellar-sdk';
import {
  RaffleNotFoundError,
  TikkaSdkError,
  TikkaSdkErrorCode,
  toTypedContractError,
} from '../../utils/errors';

const ANON_KEY = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

/** Human-readable description of an unexpected value's shape, for error messages. */
function describeShape(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/** Distinguishable "no such raffle" result — never an exception, never a bare `null`. */
function notFoundResult(): ContractResponse<RaffleData> {
  return {
    success: false,
    status: 'ERROR',
    error: TikkaSdkErrorCode.RaffleNotFound,
  };
}

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

  /**
   * Fetch on-chain data for a single raffle by ID. Alias for `get`.
   *
   * A raffle that does not exist is reported as a distinguishable result —
   * `{ success: false, status: 'ERROR', error: 'RAFFLE_NOT_FOUND' }` — rather
   * than an exception or a bare `null` that callers have to guess at. Both
   * shapes the contract can use are covered: the `RaffleNotFound` panic code
   * (contract error #1) and an empty (`None`/void) return value.
   *
   * Every other failure — RPC outage, an unknown contract error, a malformed
   * response — still raises a typed `TikkaSdkError`.
   */
  async getById(raffleId: number): Promise<ContractResponse<RaffleData>> {
    try {
      const raw = await this.simulate<unknown>(ContractFn.GET_RAFFLE_DATA, [raffleId]);
      if (raw === null || raw === undefined) return notFoundResult();
      return { success: true, status: 'SUCCESS', value: this.mapRaffle(raffleId, raw) };
    } catch (error: unknown) {
      if (error instanceof RaffleNotFoundError) return notFoundResult();
      throw error;
    }
  }

  /** Return IDs of all raffles (any state). Alias for `listAll`. */
  async getAll(): Promise<ContractResponse<number[]>> {
    const ids = await this.simulate<number[]>(ContractFn.GET_ALL_RAFFLE_IDS, []);
    return { success: true, status: 'SUCCESS', value: ids };
  }

  private async simulate<T>(method: string, params: any[]): Promise<T> {
    const server = this.rpcService.getServer();
    const contract = new Contract(this.contractId);

    // Use a dummy account for read-only simulation. The anonymous key is
    // intentionally unfunded, so `getAccount` usually fails; fall back to a
    // real `Account` (not a duck-typed object) because `TransactionBuilder`
    // bumps the sequence number when it builds.
    let account: Account;
    try {
      account = await server.getAccount(ANON_KEY);
    } catch {
      account = new Account(ANON_KEY, '0');
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
      const errorText = String((simResp as any).error ?? '');
      const message = `Read-only simulation of ${method} failed: ${errorText}`;
      // Surface recognised Soroban panic codes as typed errors (e.g. contract
      // error #1 -> RaffleNotFoundError) instead of a generic failure.
      throw (
        toTypedContractError(message, errorText) ??
        new TikkaSdkError(TikkaSdkErrorCode.SimulationFailed, message, errorText)
      );
    }

    const result = (simResp as rpc.Api.SimulateTransactionSuccessResponse).result?.retval;
    if (result === undefined) {
      throw new TikkaSdkError(TikkaSdkErrorCode.SimulationFailed, `No return value from ${method}`);
    }
    return scValToNative(result) as T;
  }

  /**
   * Maps the raw `get_raffle_data` struct onto `RaffleData`, field by field.
   *
   * The raw struct is snake_case and comes off the chain, so anything that is
   * not a struct is rejected with a typed `InvalidResponse` instead of being
   * dereferenced into a raw `TypeError`.
   */
  private mapRaffle(raffleId: number, raw: unknown): RaffleData {
    if (typeof raw !== 'object' || Array.isArray(raw)) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.InvalidResponse,
        `Malformed contract response for raffle ${raffleId}: expected a struct, received ${describeShape(raw)}`,
      );
    }

    const data = raw as Record<string, any>;

    return {
      raffleId,
      creator: data.creator ?? '',
      status: mapContractStatus(Number(data.status ?? 0)),
      ticketPrice: String(data.ticket_price ?? '0'),
      maxTickets: Number(data.max_tickets ?? 0),
      ticketsSold: Number(data.tickets_sold ?? 0),
      endTime: Number(data.end_time ?? 0) * 1000,
      asset: data.asset ?? 'XLM',
      assetIssuer: data.asset_issuer || undefined,
      allowMultiple: Boolean(data.allow_multiple),
      metadataCid: data.metadata_cid ?? '',
      winner: data.winner,
      winningTicketId: data.winning_ticket_id,
      prizeAmount: data.prize_amount != null ? String(data.prize_amount) : undefined,
    };
  }
}
