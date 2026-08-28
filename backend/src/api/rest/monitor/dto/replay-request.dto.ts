import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class ReplayJobConfigDto {
  @ApiProperty({ description: 'First ledger sequence to replay (inclusive)' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  fromLedger!: number;

  @ApiProperty({ description: 'Last ledger sequence to replay (inclusive)' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  toLedger!: number;

  @ApiPropertyOptional({ description: 'Optional contract ID filter' })
  @IsOptional()
  @IsString()
  contractId?: string;

  @ApiPropertyOptional({ description: 'Simulate replay without submitting to indexer' })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  @ApiPropertyOptional({ description: 'Require confirmed ledgers only' })
  @IsOptional()
  @IsBoolean()
  confirmed?: boolean;
}
