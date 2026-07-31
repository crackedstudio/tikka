import {
  Controller,
  Get,
  Query,
  UseGuards,
  Logger,
  Inject,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { CacheService } from '../../cache/cache.service';
import { ApiKeyGuard } from '../api-key.guard';
import { SUPABASE_CLIENT } from '../supabase.provider';
import {
  TransparencyEntryDto,
  TransparencyLogResponseDto,
} from './dto/transparency.dto';
import { TransparencyQueryDto } from './dto/query.dto';

/**
 * Transparency Controller
 *
 * Public endpoint for retrieving VRF proof audit logs.
 * Provides on-chain verification data for raffle draw results.
 *
 * All responses are cached for 60 seconds to avoid excessive Supabase queries.
 */
@UseGuards(ApiKeyGuard)
@Controller('transparency')
export class TransparencyController {
  private readonly logger = new Logger(TransparencyController.name);

  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
    private readonly cacheService: CacheService,
  ) {}

  /**
   * GET /transparency?limit=20&offset=0&raffle_id=X
   *
   * Returns paginated VRF/PRNG audit log entries.
   * Supports optional raffle_id filter.
   * Cached for 60 seconds.
   *
   * @param limit - Rows per page (max 100, default 20)
   * @param offset - Pagination offset (default 0)
   * @param raffleId - Optional raffle ID filter
   */
  @Get()
  async getTransparencyLog(
    @Query() query: TransparencyQueryDto,
  ): Promise<TransparencyLogResponseDto> {
    const rawLimit = Number(query.limit);
    const rawOffset = Number(query.offset);
    const safeLimit = Math.min(Math.max(Number.isFinite(rawLimit) ? Math.trunc(rawLimit) : 20, 1), 100);
    const safeOffset = Math.min(Math.max(Number.isFinite(rawOffset) ? Math.trunc(rawOffset) : 0, 0), 10000);
    const safeRaffleId = query.raffle_id ?? null;
    const txHash = query.tx_hash;

    // Build cache key
    const cacheKey = `transparency:${safeLimit}:${safeOffset}${safeRaffleId ? `:${safeRaffleId}` : ''}${txHash ? `:${txHash}` : ''}`;

    return this.cacheService.wrap(cacheKey, 60, async () =>
      this.queryTransparencyLog(safeLimit, safeOffset, safeRaffleId, txHash),
    );
  }

  /**
   * Query the VRF audit log from Supabase.
   * Returns paginated entries with total count.
   */
  private async queryTransparencyLog(
    limit: number,
    offset: number,
    raffleId?: number | null,
    txHash?: string,
  ): Promise<TransparencyLogResponseDto> {
    try {
      // Build query
      let query = this.supabase
        .from('vrf_audit_log')
        .select(
          'id, created_at as timestamp, raffle_id, request_id, oracle_id, seed, proof, tx_hash, method',
          { count: 'exact' },
        )
        .order('created_at', { ascending: false });

      // Apply raffle filter if provided
      if (raffleId != null) {
        query = query.eq('raffle_id', raffleId);
      }

      if (txHash) {
        query = query.eq('tx_hash', txHash);
      }

      // Apply pagination
      query = query.range(offset, offset + limit - 1);

      const { data, count, error } = await query;

      if (error) {
        this.logger.error(`Supabase query failed: ${error.message}`);
        throw error;
      }

      // Transform entries to match frontend shape
      const entries: TransparencyEntryDto[] = (data || []).map((row: any) => ({
        id: row.id,
        timestamp: row.timestamp,
        raffle_id: row.raffle_id,
        request_id: row.request_id,
        oracle_id: row.oracle_id,
        seed: row.seed || '',
        proof: row.proof || '',
        tx_hash: row.tx_hash || '',
        method: (row.method || 'VRF') as 'VRF' | 'PRNG',
      }));

      return {
        entries,
        total: count || 0,
      };
    } catch (error) {
      this.logger.error(`Failed to query transparency log: ${error}`);
      // Return empty result on error instead of throwing
      return {
        entries: [],
        total: 0,
      };
    }
  }
}
