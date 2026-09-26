// ============================================
// USER API TYPES
// ============================================

/** User profile from GET /users/:address */
export interface ApiUserProfile {
  address: string;
  total_tickets_bought: number;
  total_raffles_entered: number;
  total_raffles_won: number;
  total_prize_xlm: string;
  first_seen_ledger: number;
  updated_at: string;
  creator_stats?: {
    raffles_created: number;
    total_tickets_sold: number;
    total_xlm_raised: string;
    participant_win_rate: number;
  };
}

/** Single history item from GET /users/:address/history */
export interface ApiUserHistoryItem {
  raffle_id: number;
  status: string;
  tickets_bought: number;
  purchased_at_ledger: number;
  purchase_tx_hash: string;
  prize_amount: string | null;
  is_winner: boolean;
}

/** Response from GET /users/:address/history */
export interface ApiUserHistoryResponse {
  items: ApiUserHistoryItem[];
  total: number;
}
