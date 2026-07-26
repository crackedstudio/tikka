import { Inject, Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from './supabase.provider';
import { MetadataRedisService } from './metadata-redis.service';
import { MetadataCacheMetricsService } from './metadata-cache-metrics.service';

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
  deleted_at: string | null;
}

export interface SearchMetadataResult {
  matches: RaffleMetadata[];
  total: number;
}

export interface SearchMetadataOptions {
  query: string;
  limit?: number;
  offset?: number;
  category?: string;
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

function cacheKeyForRaffle(raffleId: number): string {
  return `tikka:raffle_metadata:${raffleId}`;
}

@Injectable()
export class MetadataService {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly client: SupabaseClient,
    private readonly config: ConfigService,
    private readonly metadataRedis: MetadataRedisService,
    private readonly metadataCacheMetrics: MetadataCacheMetricsService,
  ) {}

  private getCacheTtlSeconds(): number {
    return this.config.get<number>('METADATA_CACHE_TTL_SECONDS', 600);
  }

  private validateMetadata(payload: UpsertMetadataPayload): void {
    const ALLOWED_CATEGORIES = new Set(['art', 'seasonal', 'collectibles']);

    if (payload.title !== undefined) {
      let title = payload.title.trim();
      title = title.replace(/<[^>]*>/g, '');
      if (title.length === 0) {
        throw new BadRequestException('Title cannot be empty');
      }
      if (title.length > 200) {
        throw new BadRequestException('Title must not exceed 200 characters');
      }
      payload.title = title;
    }

    if (payload.description !== undefined) {
      let description = payload.description.trim();
      description = description.replace(/<[^>]*>/g, '');
      if (description.length > 2000) {
        throw new BadRequestException('Description must not exceed 2000 characters');
      }
      payload.description = description;
    }

    if (payload.category !== undefined && payload.category !== null) {
      let category = payload.category.trim();
      category = category.replace(/<[^>]*>/g, '');
      if (category.length === 0) {
        payload.category = null;
      } else if (category.length > 100) {
        throw new BadRequestException('Category must not exceed 100 characters');
      } else if (!ALLOWED_CATEGORIES.has(category.toLowerCase())) {
        throw new BadRequestException('Category is not allowed');
      } else {
        payload.category = category;
      }
    }

    if (payload.metadata_cid !== undefined && payload.metadata_cid !== null) {
      let cid = payload.metadata_cid.trim();
      if (cid.length > 128) {
        throw new BadRequestException('metadata_cid must not exceed 128 characters');
      }
      payload.metadata_cid = cid;
    }
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
      .in('raffle_id', raffleIds)
      .is('deleted_at', null);

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
    const key = cacheKeyForRaffle(raffleId);

    if (this.metadataRedis.isEnabled()) {
      const cached = await this.metadataRedis.get(key);
      if (cached !== null && cached !== '') {
        try {
          const parsed = JSON.parse(cached) as RaffleMetadata;
          if (parsed && typeof parsed.raffle_id === 'number') {
            this.metadataCacheMetrics.recordMetadataCacheHit();
            return parsed;
          }
        } catch {
          await this.metadataRedis.del(key);
        }
      }
    }

    const { data, error } = await this.client
      .from(TABLE)
      .select('*')
      .eq('raffle_id', raffleId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch metadata for raffle ${raffleId}: ${error.message}`);
    }

    const row = data as RaffleMetadata | null;
    if (row && this.metadataRedis.isEnabled()) {
      await this.metadataRedis.setEx(
        key,
        this.getCacheTtlSeconds(),
        JSON.stringify(row),
      );
    }

    return row;
  }

  /**
   * Full-text search over raffle metadata using PostgreSQL tsvector + ts_rank.
   * Delegates to the `search_raffles_ranked` RPC function which:
   *   - Matches via websearch_to_tsquery against the GIN-indexed search_vector column
   *   - Orders results by ts_rank DESC (relevance)
   *   - Optionally filters by category
   */
  async searchMetadata(
    options: SearchMetadataOptions | string,
    limit = 20,
    offset = 0,
  ): Promise<SearchMetadataResult> {
    // Support legacy string signature for backwards compatibility
    const opts: SearchMetadataOptions =
      typeof options === 'string'
        ? { query: options, limit, offset }
        : options;

    const q = opts.query?.trim() ?? '';
    const lim = opts.limit ?? limit;
    const off = opts.offset ?? offset;
    const category = opts.category?.trim() || null;

    // Empty query: return recent records ordered by updated_at
    if (!q) {
      let builder = this.client
        .from(TABLE)
        .select('*', { count: 'exact' })
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
        .range(off, off + lim - 1);

      if (category) {
        builder = builder.eq('category', category);
      }

      const { data, error, count } = await builder;
      if (error) throw new Error(`Fetch failed: ${error.message}`);
      return { matches: (data ?? []) as RaffleMetadata[], total: count ?? 0 };
    }

    // Ranked full-text search via RPC (returns ts_rank-ordered results)
    const { data, error } = await this.client.rpc('search_raffles_ranked', {
      search_query: q,
      p_category: category,
      p_limit: lim,
      p_offset: off,
    });

    if (error) {
      throw new Error(`Search failed: ${error.message}`);
    }

    const rows = (data ?? []) as Array<RaffleMetadata & { rank: number; total_count: string }>;
    const total = rows.length > 0 ? parseInt(rows[0].total_count as unknown as string, 10) : 0;

    return {
      matches: rows.map(({ rank: _rank, total_count: _tc, ...meta }) => meta as RaffleMetadata),
      total,
    };
  }

  /**
   * Create or update raffle metadata. Upserts by raffle_id.
   */
  async upsertMetadata(
    raffleId: number,
    payload: UpsertMetadataPayload,
  ): Promise<RaffleMetadata> {
    // Validate payload before processing
    this.validateMetadata(payload);

    const normalizedImageUrls = payload.image_urls
      ?.map((url) => url?.trim())
      .filter((url): url is string => Boolean(url));

    const existing = await this.getMetadata(raffleId);

    const row = {
      raffle_id: raffleId,
      title: payload.title !== undefined ? payload.title : (existing?.title ?? ''),
      description: payload.description !== undefined ? payload.description : (existing?.description ?? ''),
      image_url: payload.image_url !== undefined ? payload.image_url : (existing?.image_url ?? null),
      image_urls:
        payload.image_urls !== undefined
          ? (normalizedImageUrls && normalizedImageUrls.length > 0 ? normalizedImageUrls : null)
          : (existing?.image_urls ?? null),
      category: payload.category !== undefined ? (payload.category?.trim() || null) : (existing?.category ?? null),
      metadata_cid: payload.metadata_cid !== undefined ? payload.metadata_cid : (existing?.metadata_cid ?? null),
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

    const saved = data as RaffleMetadata;
    await this.metadataRedis.del(cacheKeyForRaffle(raffleId));

    return saved;
  }

  /**
   * Update the metadata_cid field for a raffle metadata record and invalidate its cache.
   */
  async updateMetadataCid(raffleId: number, metadataCid: string): Promise<RaffleMetadata> {
    const { data, error } = await this.client
      .from(TABLE)
      .update({ metadata_cid: metadataCid, updated_at: new Date().toISOString() })
      .eq('raffle_id', raffleId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update metadata CID for raffle ${raffleId}: ${error.message}`);
    }

    const saved = data as RaffleMetadata;
    await this.metadataRedis.del(cacheKeyForRaffle(raffleId));
    return saved;
  }

  /**
   * Soft-delete raffle metadata by setting deleted_at = now().
   * Returns the updated record.
   */
  async softDeleteMetadata(raffleId: number): Promise<RaffleMetadata> {
    const { data, error } = await this.client
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq('raffle_id', raffleId)
      .is('deleted_at', null)
      .select()
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to soft-delete metadata for raffle ${raffleId}: ${error.message}`);
    }

    if (!data) {
      throw new Error(`No active metadata found for raffle ${raffleId}`);
    }

    await this.metadataRedis.del(cacheKeyForRaffle(raffleId));

    return data as RaffleMetadata;
  }

  /**
   * Restore a soft-deleted raffle metadata record by clearing deleted_at.
   * Returns the restored record.
   */
  async restoreMetadata(raffleId: number): Promise<RaffleMetadata> {
    const { data, error } = await this.client
      .from(TABLE)
      .update({ deleted_at: null })
      .eq('raffle_id', raffleId)
      .not('deleted_at', 'is', null)
      .select()
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to restore metadata for raffle ${raffleId}: ${error.message}`);
    }

    if (!data) {
      throw new Error(`No archived metadata found for raffle ${raffleId}`);
    }

    await this.metadataRedis.del(cacheKeyForRaffle(raffleId));

    return data as RaffleMetadata;
  }

  /**
   * Return all soft-deleted raffle metadata records (admin-only).
   */
  async getArchivedMetadata(): Promise<RaffleMetadata[]> {
    const { data, error } = await this.client
      .from(TABLE)
      .select('*')
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch archived metadata: ${error.message}`);
    }

    return (data ?? []) as RaffleMetadata[];
  }
}
