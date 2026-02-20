import { Injectable, NotFoundException } from '@nestjs/common';
import {
  MetadataService,
  RaffleMetadata,
  UpsertMetadataPayload,
} from '../../../services/metadata.service';
import {
  IndexerService,
  IndexerRaffleData,
  IndexerListRafflesFilters,
  IndexerListRafflesResponse,
} from '../../../services/indexer.service';

/** Merged raffle detail: contract data + off-chain metadata */
export interface RaffleDetailResponse {
  id: number;
  /** From indexer (contract state) */
  creator?: string;
  status?: string;
  ticket_price?: string;
  asset?: string;
  max_tickets?: number;
  tickets_sold?: number;
  end_time?: string;
  winner?: string | null;
  prize_amount?: string | null;
  created_ledger?: number;
  finalized_ledger?: number | null;
  metadata_cid?: string | null;
  created_at?: string;
  /** From Supabase (off-chain metadata) */
  title?: string;
  description?: string;
  image_url?: string | null;
  category?: string | null;
}

@Injectable()
export class RafflesService {
  constructor(
    private readonly metadataService: MetadataService,
    private readonly indexerService: IndexerService,
  ) {}

  /**
   * List raffles with optional filters (status, category, creator, asset).
   */
  async list(filters: IndexerListRafflesFilters = {}): Promise<IndexerListRafflesResponse> {
    return this.indexerService.listRaffles(filters);
  }

  /**
   * Create or update raffle metadata (title, description, image_url, category, metadata_cid).
   */
  async upsertMetadata(raffleId: number, payload: UpsertMetadataPayload) {
    return this.metadataService.upsertMetadata(raffleId, payload);
  }

  /**
   * Get raffle detail by id. Merges contract data from indexer with off-chain metadata from Supabase.
   */
  async getById(id: number): Promise<RaffleDetailResponse> {
    const [indexerData, metadata] = await Promise.all([
      this.indexerService.getRaffle(id),
      this.metadataService.getMetadata(id),
    ]);

    if (!indexerData && !metadata) {
      throw new NotFoundException(`Raffle ${id} not found`);
    }

    return this.mergeRaffleDetail(id, indexerData ?? null, metadata ?? null);
  }

  private mergeRaffleDetail(
    id: number,
    contract: IndexerRaffleData | null,
    metadata: RaffleMetadata | null,
  ): RaffleDetailResponse {
    const response: RaffleDetailResponse = { id };

    if (contract) {
      response.creator = contract.creator;
      response.status = contract.status;
      response.ticket_price = contract.ticket_price;
      response.asset = contract.asset;
      response.max_tickets = contract.max_tickets;
      response.tickets_sold = contract.tickets_sold;
      response.end_time = contract.end_time;
      response.winner = contract.winner;
      response.prize_amount = contract.prize_amount;
      response.created_ledger = contract.created_ledger;
      response.finalized_ledger = contract.finalized_ledger;
      response.metadata_cid = contract.metadata_cid;
      response.created_at = contract.created_at;
    }

    if (metadata) {
      response.title = metadata.title;
      response.description = metadata.description;
      response.image_url = metadata.image_url;
      response.category = metadata.category;
      // Prefer metadata_cid from metadata if contract doesn't have it
      if (!response.metadata_cid && metadata.metadata_cid) {
        response.metadata_cid = metadata.metadata_cid;
      }
    }

    return response;
  }
}
