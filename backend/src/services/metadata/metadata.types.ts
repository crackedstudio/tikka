/** Backend Supabase raffle_metadata row; distinct from the public IPFS metadata in @tikka/types. */
export interface RaffleMetadata {
  raffle_id: number;
  title: string;
  description: string;
  image_url: string | null;
  image_urls: string[] | null;
  category: string | null;
  metadata_cid: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
