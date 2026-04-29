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

export interface SearchOptions {
  query: string;
  limit?: number;
  offset?: number;
  category?: string;
  /** Filter by on-chain raffle status (e.g. "active", "ended", "cancelled") */
  status?: string;
}

@Injectable()
export class SearchService {
  constructor(
    private readonly metadataService: MetadataService,
    private readonly indexerService: IndexerService,
  ) {}

  async search(options: SearchOptions): Promise<SearchResponse> {
    const { query, limit = 20, offset = 0, category, status } = options;

    const { matches, total } = await this.metadataService.searchMetadata({
      query,
      limit,
      offset,
      category,
    });

    if (matches.length === 0) {
      return { raffles: [], total };
    }

    // Merge with on-chain data in parallel
    const merged = await Promise.all(
      matches.map((meta) => this.mergeWithIndexer(meta)),
    );

    // Apply status filter post-merge (status lives on-chain in the indexer)
    const raffles = status
      ? merged.filter((r) => r.status?.toLowerCase() === status.toLowerCase())
      : merged;

    return { raffles, total: status ? raffles.length : total };
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
