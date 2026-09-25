import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReplayJobConfigDto {
  @ApiProperty({ description: 'First ledger included in the replay' })
  fromLedger: number;

  @ApiProperty({ description: 'Last ledger included in the replay' })
  toLedger: number;

  @ApiPropertyOptional({ description: 'Optional contract ID to limit the replay' })
  contractId?: string;

  @ApiPropertyOptional({ description: 'Whether the replay is dry-run only' })
  dryRun?: boolean;

  @ApiPropertyOptional({ description: 'Explicit confirmation for mutating replay runs' })
  confirmed?: boolean;
}

export class ReplayJobProgressDto {
  @ApiProperty({ description: 'Number of ledgers processed so far' })
  processedCount: number;

  @ApiProperty({ description: 'Number of ledgers skipped so far' })
  skippedCount: number;

  @ApiProperty({ description: 'Total ledgers in the replay range' })
  totalLedgers: number;

  @ApiPropertyOptional({ description: 'Currently processed ledger number' })
  currentLedger?: number;
}

export class ReplayPlannedActionDto {
  @ApiProperty({ description: 'Ledger number for this action' })
  ledger: number;

  @ApiProperty({ enum: ['submit', 'skip'], description: 'Planned action outcome' })
  action: 'submit' | 'skip';

  @ApiPropertyOptional({ description: 'Reason for the action' })
  reason?: string;
}

export class ReplayJobResultDto {
  @ApiProperty({ description: 'Elapsed execution time in milliseconds' })
  elapsedMs: number;

  @ApiProperty({ type: [Number], description: 'Ledger numbers that were not replayed' })
  missingLedgers: number[];

  @ApiPropertyOptional({ type: [ReplayPlannedActionDto], description: 'Planned actions taken during the replay' })
  plannedActions?: ReplayPlannedActionDto[];

  @ApiPropertyOptional({ description: 'Total ledgers in the replay range' })
  totalLedgers?: number;

  @ApiPropertyOptional({ description: 'First ledger included in the replay' })
  fromLedger?: number;

  @ApiPropertyOptional({ description: 'Last ledger included in the replay' })
  toLedger?: number;

  @ApiPropertyOptional({ description: 'Number of ledgers processed' })
  processedCount?: number;

  @ApiPropertyOptional({ description: 'Number of ledgers skipped' })
  skippedCount?: number;
}

export class ReplayJobStartResponseDto {
  @ApiProperty({ description: 'Generated job identifier' })
  jobId: string;

  @ApiProperty({ description: 'Human-readable job status message' })
  message: string;
}

export class ReplayJobStatusDto {
  @ApiProperty({ description: 'Generated job identifier' })
  jobId: string;

  @ApiProperty({ enum: ['pending', 'running', 'completed', 'failed'], description: 'Replay job state' })
  status: 'pending' | 'running' | 'completed' | 'failed';

  @ApiProperty({ type: ReplayJobConfigDto })
  config: ReplayJobConfigDto;

  @ApiProperty({ type: ReplayJobProgressDto })
  progress: ReplayJobProgressDto;

  @ApiPropertyOptional({ type: ReplayJobResultDto })
  result?: ReplayJobResultDto;

  @ApiPropertyOptional({ description: 'Failure reason if the replay failed' })
  error?: string;

  @ApiProperty({ description: 'ISO timestamp when the job was created' })
  createdAt: string;

  @ApiPropertyOptional({ description: 'ISO timestamp when the job started' })
  startedAt?: string;

  @ApiPropertyOptional({ description: 'ISO timestamp when the job completed' })
  completedAt?: string;
}