import { Injectable } from '@nestjs/common';

/**
 * Placeholder for tikka-indexer HTTP client.
 * Fetches contract state (price, tickets, winner, status) from the indexer.
 * TODO: Implement HTTP client when indexer is available.
 */
export interface IndexerRaffleData {
  id: number;
  creator: string;
  status: string;
  ticket_price: string;
  asset: string;
  max_tickets: number;
  tickets_sold: number;
  end_time: string;
  winner: string | null;
  prize_amount: string | null;
  created_ledger: number;
  finalized_ledger: number | null;
  metadata_cid: string | null;
  created_at: string;
}

@Injectable()
export class IndexerService {
  /**
   * Get raffle contract data by id. Returns null if indexer is unavailable or raffle not found.
   */
  async getRaffle(raffleId: number): Promise<IndexerRaffleData | null> {
    // TODO: GET ${INDEXER_URL}/raffles/${raffleId}
    return null;
  }
}
