import { Injectable } from '@nestjs/common';
import { ContractService } from '../../contract/contract.service';
import { ContractFn } from '../../contract/bindings';
import {
  RaffleParams,
  RaffleData,
  CancelRaffleParams,
  AssetDescriptor,
  TriggerDrawParams,
  TriggerDrawResult,
  WinnerResult,
  RaffleStateError,
} from './raffle.types';
import { RaffleStatus } from '../../contract/bindings';
import { ContractResponse } from '../../contract/response';
import { assertPositiveInt } from '../../utils/validation';
import { xlmToStroops, assertSafeAmount } from '../../utils/formatting';
import { nativeToScVal } from '@stellar/stellar-sdk';

/**
 * Normalises the `asset` field from `RaffleParams` into a plain `AssetDescriptor`.
 * Accepts either a legacy string code ("XLM") or a structured descriptor.
 */
function normaliseAsset(asset: string | AssetDescriptor): AssetDescriptor {
  if (typeof asset === 'string') return { code: asset };
  return asset;
}

/**
 * RaffleService — high-level API for raffle lifecycle operations.
 *
 * Write methods (create, cancel) require a WalletAdapter to be set on the
 * ContractService. Read methods (get, listActive, listAll) are free (simulate).
 */
@Injectable()
export class RaffleService {
  constructor(private readonly contract: ContractService) {}

  /* ------------------------------------------------------------------ */
  /*  create                                                             */
  /* ------------------------------------------------------------------ */

  /**
   * Creates a new raffle on-chain.
   *
   * `params.asset` accepts either a plain code string ("XLM") for backwards
   * compatibility, or a structured `{ code, issuer? }` descriptor for non-native
   * SEP-41 tokens such as USDC or yXLM.
   *
   * @returns The on-chain raffle ID, transaction hash, and ledger.
   */
  async create(params: RaffleParams): Promise<RaffleTxResponse<number>> {
    assertNonEmpty(params.ticketPrice, 'ticketPrice');
    assertPositiveInt(params.maxTickets, 'maxTickets');

    const asset = normaliseAsset(params.asset);

    const contractParams = [
      nativeToScVal(
        {
          ticket_price: BigInt(xlmToStroops(params.ticketPrice)),
          max_tickets: params.maxTickets,
          end_time: BigInt(Math.floor(params.endTime / 1000)), // contract expects seconds
          allow_multiple: params.allowMultiple,
          asset: asset.code,
          asset_issuer: asset.issuer ?? '',
          metadata_cid: params.metadataCid ?? '',
        },
        {
          type: {
            ticket_price: ['symbol', 'i128'],
            max_tickets: ['symbol', 'u32'],
            end_time: ['symbol', 'u64'],
            allow_multiple: ['symbol', 'bool'],
            asset: ['symbol', 'string'],
            asset_issuer: ['symbol', 'string'],
            metadata_cid: ['symbol', 'string'],
          } as any,
        },
      ),
    ];

    return await this.contract.invoke<number>(
      ContractFn.CREATE_RAFFLE,
      contractParams,
      { memo: params.memo },
    );
  }

  /* ------------------------------------------------------------------ */
  /*  get                                                                */
  /* ------------------------------------------------------------------ */

  /**
   * Fetches on-chain data for a single raffle (read-only).
   */
  async get(raffleId: number): Promise<RaffleTxResponse<RaffleData>> {
    assertPositiveInt(raffleId, 'raffleId');

    const res = await this.contract.simulateReadOnly<any>(
      ContractFn.GET_RAFFLE_DATA,
      [raffleId],
    );

    if (res.status !== 'SUCCESS') return res as any;
    
    return {
      status: 'SUCCESS',
      value: this.mapRaffleData(raffleId, res.value),
    };
  }

  /* ------------------------------------------------------------------ */
  /*  listActive                                                         */
  /* ------------------------------------------------------------------ */

  /**
   * Returns IDs of all currently active (OPEN) raffles.
   */
  async listActive(): Promise<RaffleTxResponse<number[]>> {
    return this.contract.simulateReadOnly<number[]>(
      ContractFn.GET_ACTIVE_RAFFLE_IDS,
      [],
    );
  }

  /* ------------------------------------------------------------------ */
  /*  listAll                                                            */
  /* ------------------------------------------------------------------ */

  /**
   * Returns IDs of all raffles (any state).
   */
  async listAll(): Promise<RaffleTxResponse<number[]>> {
    return this.contract.simulateReadOnly<number[]>(
      ContractFn.GET_ALL_RAFFLE_IDS,
      [],
    );
  }

  /* ------------------------------------------------------------------ */
  /*  cancel                                                             */
  /* ------------------------------------------------------------------ */

  /**
   * Cancels an OPEN raffle (must be the raffle creator).
   * Throws `RaffleStateError` if the raffle is not in the Open state.
   */
  async cancel(params: CancelRaffleParams): Promise<TxResponse<void>> {
    assertPositiveInt(params.raffleId, 'raffleId');

    const current = await this.get(params.raffleId);
    if (current.success && current.value!.status !== RaffleStatus.Open) {
      throw new RaffleStateError(params.raffleId, current.value!.status, 'open→cancelled');
    }

    return await this.contract.invoke<void>(
      ContractFn.CANCEL_RAFFLE,
      [params.raffleId],
      { memo: params.memo },
    );
  }

  /* ------------------------------------------------------------------ */
  /*  triggerDraw                                                        */
  /* ------------------------------------------------------------------ */

  /**
   * Initiates the randomness request for a raffle that has reached its
   * end time or sold out. Transitions the raffle from `Open` → `Drawing`.
   *
   * Requires the caller to be authorised (oracle or protocol admin).
   * Throws `RaffleStateError` if the raffle is not currently Open.
   */
  async triggerDraw(params: TriggerDrawParams): Promise<ContractResponse<TriggerDrawResult>> {
    assertPositiveInt(params.raffleId, 'raffleId');

    const current = await this.get(params.raffleId);
    if (current.success && current.value!.status !== RaffleStatus.Open) {
      throw new RaffleStateError(params.raffleId, current.value!.status, 'open→drawing');
    }

    return await this.contract.invoke<TriggerDrawResult>(
      ContractFn.TRIGGER_DRAW,
      [params.raffleId],
      { memo: params.memo },
    );
  }

  /* ------------------------------------------------------------------ */
  /*  getWinner                                                          */
  /* ------------------------------------------------------------------ */

  /**
   * Reads the winner of a finalized raffle (read-only).
   * Returns `undefined` fields when the raffle has not yet been finalized.
   *
   * Source of truth: contract RPC (`get_raffle_data`).
   */
  async getWinner(raffleId: number): Promise<ContractResponse<WinnerResult | null>> {
    assertPositiveInt(raffleId, 'raffleId');

    const res = await this.get(raffleId);
    if (!res.success) return res as any;

    const data = res.value!;
    if (data.status !== RaffleStatus.Finalized || !data.winner) {
      return { success: true, value: null };
    }

    return {
      success: true,
      value: {
        raffleId,
        winner: data.winner,
        winningTicketId: data.winningTicketId!,
        prizeAmount: data.prizeAmount ?? '0',
      },
    };
  }

  /* ------------------------------------------------------------------ */
  /*  Private helpers                                                    */
  /* ------------------------------------------------------------------ */

  private mapRaffleData(raffleId: number, raw: any): RaffleData {
    return {
      raffleId,
      creator: raw.creator ?? raw.Creator ?? '',
      status: raw.status ?? raw.Status ?? 0,
      ticketPrice: String(raw.ticket_price ?? raw.ticketPrice ?? '0'),
      maxTickets: Number(raw.max_tickets ?? raw.maxTickets ?? 0),
      ticketsSold: Number(raw.tickets_sold ?? raw.ticketsSold ?? 0),
      endTime: Number(raw.end_time ?? raw.endTime ?? 0) * 1000, // back to ms
      asset: raw.asset ?? 'XLM',
      assetIssuer: raw.asset_issuer || raw.assetIssuer || undefined,
      allowMultiple: Boolean(raw.allow_multiple ?? raw.allowMultiple),
      metadataCid: raw.metadata_cid ?? raw.metadataCid ?? '',
      winner: raw.winner,
      winningTicketId: raw.winning_ticket_id ?? raw.winningTicketId,
      prizeAmount: raw.prize_amount != null ? String(raw.prize_amount) : undefined,
    };
  }
}
