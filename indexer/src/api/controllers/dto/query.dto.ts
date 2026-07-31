import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  limit?: number = 20;

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
}

export class LeaderboardQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
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
