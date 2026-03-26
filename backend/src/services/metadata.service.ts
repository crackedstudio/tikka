import { Inject, Injectable } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from './supabase.provider';

/** Raffle metadata stored off-chain in Supabase (title, description, image, category, metadata_cid) */
export interface RaffleMetadata {
  raffle_id: number;
  title: string;
  description: string;
  image_url: string | null;
  category: string | null;
  metadata_cid: string | null;
  created_at: string;
  updated_at: string;
}

/** Payload for creating or updating raffle metadata */
export interface UpsertMetadataPayload {
  title?: string;
  description?: string;
  image_url?: string | null;
  category?: string | null;
  metadata_cid?: string | null;
}

const TABLE = 'raffle_metadata';

@Injectable()
export class MetadataService {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly client: SupabaseClient,
  ) {}

  /**
   * Get metadata by raffle_id. Returns null if not found.
   */
  async getMetadata(raffleId: number): Promise<RaffleMetadata | null> {
    const { data, error } = await this.client
      .from(TABLE)
      .select('*')
      .eq('raffle_id', raffleId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch metadata for raffle ${raffleId}: ${error.message}`);
    }
    return data as RaffleMetadata | null;
  }

  /**
   * Create or update raffle metadata. Upserts by raffle_id.
   */
  async upsertMetadata(
    raffleId: number,
    payload: UpsertMetadataPayload,
  ): Promise<RaffleMetadata> {
    const row = {
      raffle_id: raffleId,
      ...payload,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await this.client
      .from(TABLE)
      .upsert(row, {
        onConflict: 'raffle_id',
        ignoreDuplicates: false,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to upsert metadata for raffle ${raffleId}: ${error.message}`);
    }
    return data as RaffleMetadata;
  }
}
