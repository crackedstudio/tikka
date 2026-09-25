import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * GLOBAL PAGINATION LIMITS
 * Do not override these values in any derived DTO.
 * Limits are enforced to:
 * 1. Prevent resource exhaustion (DoS protection)
 * 2. Maintain pagination stability under concurrent writes
 * 3. Ensure predictable query performance
 */
const INDEXER_MAX_LIMIT = 100;
const INDEXER_DEFAULT_LIMIT = 20;

export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(INDEXER_MAX_LIMIT)
  limit?: number = INDEXER_DEFAULT_LIMIT;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}

export class RaffleListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(['open', 'drawing', 'finalized', 'cancelled'])
  status?: string;

  @IsOptional()
  @IsString()
  creator?: string;

  @IsOptional()
  @IsString()
  asset?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  cursor?: string;
}

export class LeaderboardQueryDto extends PaginationQueryDto {
  /**
   * IMPORTANT: Do NOT override @Max() to allow higher limits.
   * Even though this is a read-only endpoint, maintaining a consistent max limit
   * across all pagination prevents accidental resource exhaustion.
   * 
   * If you need higher per-endpoint defaults, create internal pagination parameters
   * for pre-computed leaderboards, but do NOT expose higher limits to clients.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(INDEXER_MAX_LIMIT)
  override limit?: number = 50;

  @IsOptional()
  @IsEnum(['wins', 'volume', 'tickets'])
  by?: string = 'wins';

  @IsOptional()
  @IsString()
  cursor?: string;
}

export class TransparencyQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  raffle_id?: number;

  @IsOptional()
  @IsString()
  tx_hash?: string;
}

export class ParticipantQueryDto extends PaginationQueryDto {}
