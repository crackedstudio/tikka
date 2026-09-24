import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { IndexerBackfillService } from './indexer-backfill.service';

export interface BackfillJobConfig {
  fromLedger: number;
  toLedger: number;
}

export interface BackfillJobStatus {
  jobId: string;
  status: 'running' | 'completed' | 'failed';
  processedLedgers: number;
  config: BackfillJobConfig;
  createdAt: string;
  completedAt?: string;
  error?: string;
}

@Injectable()
export class BackfillJobService {
  private readonly logger = new Logger(BackfillJobService.name);
  private readonly jobs = new Map<string, BackfillJobStatus>();
  private readonly maxRange: number;

  constructor(
    private readonly config: ConfigService,
    private readonly indexerBackfillService: IndexerBackfillService,
  ) {
    this.maxRange = this.config.get<number>('BACKFILL_MAX_RANGE', 10000);
  }

  startBackfill(config: BackfillJobConfig): string {
    this.validateConfig(config);

    const jobId = randomUUID();
    const job: BackfillJobStatus = {
      jobId,
      status: 'running',
      processedLedgers: 0,
      config,
      createdAt: new Date().toISOString(),
    };

    this.jobs.set(jobId, job);

    void this.runBackfill(jobId).catch((err) => {
      this.logger.error(`Backfill job ${jobId} failed`, err instanceof Error ? err.stack : undefined);
      const existingJob = this.jobs.get(jobId);
      if (!existingJob) {
        return;
      }

      existingJob.status = 'failed';
      existingJob.error = err instanceof Error ? err.message : String(err);
      existingJob.completedAt = new Date().toISOString();
    });

    return jobId;
  }

  getJobStatus(jobId: string): BackfillJobStatus | null {
    return this.jobs.get(jobId) ?? null;
  }

  private validateConfig(config: BackfillJobConfig): void {
    if (!Number.isInteger(config.fromLedger) || config.fromLedger <= 0) {
      throw new Error(`fromLedger must be a positive integer, got: ${config.fromLedger}`);
    }

    if (!Number.isInteger(config.toLedger) || config.toLedger <= 0) {
      throw new Error(`toLedger must be a positive integer, got: ${config.toLedger}`);
    }

    if (config.fromLedger >= config.toLedger) {
      throw new Error(
        `fromLedger (${config.fromLedger}) must be less than toLedger (${config.toLedger})`,
      );
    }

    const range = config.toLedger - config.fromLedger + 1;
    if (range > this.maxRange) {
      throw new Error(
        `Range of ${range} ledgers exceeds BACKFILL_MAX_RANGE (${this.maxRange})`,
      );
    }
  }

  private async runBackfill(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Backfill job ${jobId} not found`);
    }

    const summary = await this.indexerBackfillService.backfill(
      job.config.fromLedger,
      job.config.toLedger,
    );

    job.status = 'completed';
    job.processedLedgers = summary.processedCount;
    job.completedAt = new Date().toISOString();
  }
}
