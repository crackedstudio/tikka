import { Inject, Injectable } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from './supabase.provider';
import { PinningService } from './pinning.service';

/** Raffle metadata stored off-chain in Supabase (title, description, image, category, metadata_cid) */
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
}

export interface SearchMetadataResult {
  matches: RaffleMetadata[];
  total: number;
}

/** Payload for creating or updating raffle metadata */
export interface UpsertMetadataPayload {
  title?: string;
  description?: string;
  image_url?: string | null;
  image_urls?: string[] | null;
  category?: string | null;
  metadata_cid?: string | null;
}

const TABLE = 'raffle_metadata';

@Injectable()
export class MetadataService {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly client: SupabaseClient,
    private readonly pinningService: PinningService,
  ) {}

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
   * Full-text search over raffle metadata (title, description, category).
   * Uses Supabase's ilike for simple prefix/contains matching.
   */
  async searchMetadata(
    query: string,
    limit = 20,
    offset = 0,
  ): Promise<SearchMetadataResult> {
    // If query is empty, fall back to basic listing or return empty
    if (!query.trim()) {
      const { data, error, count } = await this.client
        .from(TABLE)
        .select('*', { count: 'exact' })
        .order('updated_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw new Error(`Fetch failed: ${error.message}`);
      return { matches: (data ?? []) as RaffleMetadata[], total: count ?? 0 };
    }

    // Use PostgreSQL full-text search via the search_vector column and GIN index
    // 'websearch' type allows for intuitive query syntax (e.g., quotes for phrases, - for exclusion)
    const { data, error, count } = await this.client
      .from(TABLE)
      .select('*', { count: 'exact' })
      .textSearch('search_vector', query, {
        config: 'english',
        type: 'websearch',
      })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new Error(`Search failed: ${error.message}`);
    }
    return {
      matches: (data ?? []) as RaffleMetadata[],
      total: count ?? 0,
    };
  }

  /**
   * Create or update raffle metadata. Upserts by raffle_id.
   */
  async upsertMetadata(
    raffleId: number,
    payload: UpsertMetadataPayload,
  ): Promise<RaffleMetadata> {
    const normalizedImageUrls = payload.image_urls
      ?.map((url) => url?.trim())
      .filter((url): url is string => Boolean(url));

    const metadataCid = await this.pinningService.pin({
      raffle_id: raffleId,
      ...payload,
    });

    const row = {
      raffle_id: raffleId,
      ...payload,
      metadata_cid: metadataCid || payload.metadata_cid,
      image_urls:
        normalizedImageUrls && normalizedImageUrls.length > 0
          ? normalizedImageUrls
          : null,
      category: payload.category?.trim() || null,
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
