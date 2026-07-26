import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Logger,
  HttpStatus,
} from '@nestjs/common';
import { DlqService } from '../../ingestor/dlq.service';
import { ApiKeyGuard } from '../api-key.guard';
import { DlqReplayRequestDto, DlqReplayResponseDto, DlqStatusResponseDto } from './dto/dlq.dto';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { DeadLetterEventEntity } from '../../database/entities/dead-letter-event.entity';
import { randomUUID } from 'crypto';

interface ReplayJobStatus {
  jobId: string;
  startedAt: Date;
  replayed: number;
  failed: number;
  completedAt?: Date;
}

@Controller('admin/dlq')
@UseGuards(ApiKeyGuard)
export class DlqController {
  private readonly logger = new Logger(DlqController.name);
  private lastReplayJob: ReplayJobStatus | null = null;

  constructor(
    private readonly dlqService: DlqService,
    @InjectRepository(DeadLetterEventEntity)
    private readonly dlqRepo: Repository<DeadLetterEventEntity>,
  ) {}

  /**
   * POST /admin/dlq/replay
   *
   * Triggers async replay of DLQ entries.
   * - If `ids` is provided, replays only those specific entries.
   * - If omitted, replays all eligible entries.
   *
   * Returns 202 Accepted with a job ID for tracking.
   */
  @Post('replay')
  async replay(@Body() body: DlqReplayRequestDto): Promise<DlqReplayResponseDto> {
    const jobId = randomUUID();
    const { ids } = body;

    this.logger.log(
      `DLQ replay triggered: jobId=${jobId} ids=${ids ? `[${ids.join(', ')}]` : 'all'}`,
    );

    // Start async replay
    this.executeReplay(jobId, ids).catch((err) => {
      this.logger.error(`DLQ replay job ${jobId} failed: ${err.message}`, err.stack);
    });

    return {
      jobId,
      message: ids
        ? `Replay started for ${ids.length} specific entries`
        : 'Replay started for all eligible DLQ entries',
    };
  }

  /**
   * GET /admin/dlq/status
   *
   * Returns current DLQ depth and last replay metadata.
   */
  @Get('status')
  async status(): Promise<DlqStatusResponseDto> {
    const depth = await this.dlqService.count();

    return {
      depth,
      lastReplayAt: this.lastReplayJob?.completedAt?.toISOString() ?? null,
      lastReplayCount: this.lastReplayJob?.replayed ?? 0,
    };
  }

  /**
   * Internal method to execute replay asynchronously.
   */
  private async executeReplay(jobId: string, ids?: string[]): Promise<void> {
    const job: ReplayJobStatus = {
      jobId,
      startedAt: new Date(),
      replayed: 0,
      failed: 0,
    };

    try {
      if (ids && ids.length > 0) {
        // Replay specific entries by ID
        const entries = await this.dlqRepo.find({
          where: ids.map(id => ({ id })),
        });
        
        for (const entry of entries) {
          try {
            // Manually replay each entry
            const result = await this.dlqService.replayAll({
              fromLedger: entry.ledger,
              toLedger: entry.ledger,
              forceReplay: true,
            });
            job.replayed += result.replayed;
            job.failed += result.failed;
          } catch (err) {
            this.logger.error(`Failed to replay entry ${entry.id}: ${err.message}`);
            job.failed++;
          }
        }
      } else {
        // Replay all eligible entries
        const result = await this.dlqService.replayAll();
        job.replayed = result.replayed;
        job.failed = result.failed;
      }

      job.completedAt = new Date();
      this.lastReplayJob = job;

      this.logger.log(
        `DLQ replay job ${jobId} completed: replayed=${job.replayed} failed=${job.failed}`,
      );
    } catch (err) {
      job.completedAt = new Date();
      this.lastReplayJob = job;
      throw err;
    }
  }
}
