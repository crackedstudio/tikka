export interface RaffleMetadata {
  title: string;
  description: string;
  image: string; // IPFS URL or Supabase storage URL (primary/legacy)
  images?: string[]; // Multiple images for physical prizes
  prizeName: string;
  prizeValue: string;
  prizeCurrency: string;
  category: string;
  tags: string[];
  createdBy: string; // Wallet address
  createdAt: number; // Timestamp
  updatedAt: number; // Timestamp
}

export interface SupabaseRaffleRecord {
  id: string;
  raffle_id: number; // Contract raffle ID
  metadata: RaffleMetadata;
  created_at: string;
  updated_at: string;
}

/** Raffle list item from GET /raffles (indexer contract data, snake_case) */
export interface ApiRaffleListItem {
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
  participant_count?: number;
}

/** Response from GET /raffles */
export interface ApiRaffleListResponse {
  raffles: ApiRaffleListItem[];
  total?: number;
}

/** Raffle detail from GET /raffles/:id (contract data + off-chain metadata merged) */
export interface ApiRaffleDetail extends ApiRaffleListItem {
  title?: string;
  description?: string;
  image_url?: string | null;
  category?: string | null;
  winnings_withdrawn?: boolean | null;
  winningsWithdrawn?: boolean | null;
  prize_claimed?: boolean | null;
  prizeClaimed?: boolean | null;
}

/** Query filters for GET /raffles */
export interface RaffleListFilters {
  status?: string;
  category?: string;
  creator?: string;
  asset?: string;
  limit?: number;
  offset?: number;
}
