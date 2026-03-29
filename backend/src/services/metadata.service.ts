import { Injectable } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env.config';

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
  private readonly client: SupabaseClient;

  constructor() {
    const { url, serviceRoleKey } = env.supabase;
    if (!url || !serviceRoleKey) {
      throw new Error(
        'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment',
      );
    }
    this.client = createClient(url, serviceRoleKey);
  }

  /**
   * Get metadata for multiple raffle IDs in a single query.
   * Returns a map of raffle_id → RaffleMetadata for found records only.
   */
  async getBatchMetadata(raffleIds: number[]): Promise<Map<number, RaffleMetadata>> {
    if (raffleIds.length === 0) return new Map();

    const { data, error } = await this.client
      .from(TABLE)
      .select('*')
      .in('raffle_id', raffleIds);

    if (error) {
      throw new Error(`Failed to fetch batch metadata: ${error.message}`);
    }

    const result = new Map<number, RaffleMetadata>();
    for (const row of (data as RaffleMetadata[])) {
      result.set(row.raffle_id, row);
    }
    return result;
  }

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
