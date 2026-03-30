import { Injectable } from '@nestjs/common';
import { MetadataService, RaffleMetadata } from './metadata.service';
import { IndexerService, IndexerRaffleData } from './indexer.service';

export interface SearchResult {
  id: number;
  /** Off-chain metadata (Supabase) */
  title: string;
  description: string;
  image_url: string | null;
  category: string | null;
  /** On-chain data (Indexer) — present when the raffle exists on-chain */
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
}

export interface SearchResponse {
  raffles: SearchResult[];
  total: number;
}

@Injectable()
export class SearchService {
  constructor(
    private readonly metadataService: MetadataService,
    private readonly indexerService: IndexerService,
  ) {}

  async search(
    query: string,
    limit = 20,
    offset = 0,
  ): Promise<SearchResponse> {
    const { matches, total } = await this.metadataService.searchMetadata(
      query,
      limit,
      offset,
    );

    if (matches.length === 0) {
      return { raffles: [], total };
    }

    // Fetch on-chain data for all matched raffles in parallel
    const raffles = await Promise.all(
      matches.map(async (meta) => this.mergeWithIndexer(meta)),
    );

    return { raffles, total };
  }

  private async mergeWithIndexer(meta: RaffleMetadata): Promise<SearchResult> {
    const result: SearchResult = {
      id: meta.raffle_id,
      title: meta.title,
      description: meta.description,
      image_url: meta.image_url,
      category: meta.category,
    };

    let contract: IndexerRaffleData | null = null;
    try {
      contract = await this.indexerService.getRaffle(meta.raffle_id);
    } catch {
      // If indexer is unavailable, return metadata-only result
    }

    if (contract) {
      result.creator = contract.creator;
      result.status = contract.status;
      result.ticket_price = contract.ticket_price;
      result.asset = contract.asset;
      result.max_tickets = contract.max_tickets;
      result.tickets_sold = contract.tickets_sold;
      result.end_time = contract.end_time;
      result.winner = contract.winner;
      result.prize_amount = contract.prize_amount;
      result.created_ledger = contract.created_ledger;
      result.finalized_ledger = contract.finalized_ledger;
      result.metadata_cid = contract.metadata_cid;
      result.created_at = contract.created_at;
    }

    return result;
  }
}
