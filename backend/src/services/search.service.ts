import { Injectable } from '@nestjs/common';
import { MetadataService, RaffleMetadata } from './metadata.service';
import { IndexerService, IndexerRaffleData } from './indexer.service';

export interface SearchResult {
  id: number;
  /** Relevance score — higher is more relevant. @computed */
  score: number;
  /** Off-chain metadata (Supabase) */
  title: string;
  description: string;
  image_url: string | null;
  category: string | null;
  /** Timestamp of last index refresh */
  lastIndexedAt?: string;
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
  /** Sort order for results */
  sort?: 'relevance' | 'ending_soon' | 'price_asc' | 'most_tickets';
}

@Injectable()
export class SearchService {
  constructor(
    private readonly metadataService: MetadataService,
    private readonly indexerService: IndexerService,
  ) {}

  async search(options: SearchOptions): Promise<SearchResponse> {
   const { query, limit = 20, offset = 0, category, status, sort = 'relevance' } = options;

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
    const filtered = status
      ? merged.filter((r) => r.status?.toLowerCase() === status.toLowerCase())
      : merged;

    // Apply sort
    const raffles = this.sortResults(filtered, sort);

    return { raffles, total: status ? raffles.length : total };
  }

  private async mergeWithIndexer(meta: RaffleMetadata): Promise<SearchResult> {
    const result: SearchResult = {
      id: meta.raffle_id,
      score: 0,
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

    // Compute relevance score
    result.score = this.computeScore(result);

    return result;
  }

  /**
   * Computes a relevance score for a search result.
   * Higher is more relevant. Factors:
   *  - Recency: newer raffles score higher (up to 30 points)
   *  - Tickets remaining: more availability scores higher (up to 40 points)
   *  - Active status: active raffles get a 30-point bonus
   */
  private computeScore(result: SearchResult): number {
    let score = 0;

    // Recency bonus (0–30): raffles created in the last 7 days score full points
    if (result.created_at) {
      const ageMs = Date.now() - new Date(result.created_at).getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      score += Math.max(0, 30 - ageDays * (30 / 7));
    }

    // Tickets remaining bonus (0–40)
    if (result.max_tickets != null && result.tickets_sold != null) {
      const remaining = result.max_tickets - result.tickets_sold;
      const ratio = result.max_tickets > 0 ? remaining / result.max_tickets : 0;
      score += ratio * 40;
    }

    // Active status bonus (30)
    if (result.status?.toLowerCase() === 'active') {
      score += 30;
    }

    return Math.round(score);
  }

  /**
   * Sorts search results by the chosen sort mode.
   */
  private sortResults(
    results: SearchResult[],
    sort: 'relevance' | 'ending_soon' | 'price_asc' | 'most_tickets',
  ): SearchResult[] {
    const copy = [...results];
    switch (sort) {
      case 'ending_soon':
        return copy.sort((a, b) => {
          if (!a.end_time) return 1;
          if (!b.end_time) return -1;
          return new Date(a.end_time).getTime() - new Date(b.end_time).getTime();
        });
      case 'price_asc':
        return copy.sort((a, b) => {
          const pa = parseFloat(a.ticket_price ?? '0');
          const pb = parseFloat(b.ticket_price ?? '0');
          return pa - pb;
        });
      case 'most_tickets':
        return copy.sort((a, b) => {
          const ra = (a.max_tickets ?? 0) - (a.tickets_sold ?? 0);
          const rb = (b.max_tickets ?? 0) - (b.tickets_sold ?? 0);
          return rb - ra;
        });
      case 'relevance':
      default:
        return copy.sort((a, b) => b.score - a.score);
    }
  }
}
