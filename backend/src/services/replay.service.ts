import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { BackfillLock, BackfillLockError } from './backfill-lock';
import { HorizonClientService } from './horizon-client.service';
import { IndexerService } from './indexer.service';

export interface ReplayJobConfig {
  fromLedger: number;
  toLedger: number;
  contractId?: string;
  dryRun?: boolean;
}

export interface ReplayJobStatus {
  jobId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  config: ReplayJobConfig;
  progress: {
    processedCount: number;
    skippedCount: number;
    totalLedgers: number;
    currentLedger?: number;
  };
  result?: {
    elapsedMs: number;
    missingLedgers: number[];
  };
  error?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

@Injectable()
export class ReplayService {
  private readonly logger = new Logger(ReplayService.name);
  private readonly jobs = new Map<string, ReplayJobStatus>();
  private readonly maxRange: number;
  private readonly retryCount: number;
  private readonly retryDelayMs: number;

  constructor(
    private readonly config: ConfigService,
    private readonly lock: BackfillLock,
    private readonly horizonClient: HorizonClientService,
    private readonly indexer: IndexerService,
  ) {
    this.maxRange = this.config.get<number>('BACKFILL_MAX_RANGE', 10000);
    this.retryCount = this.config.get<number>('BACKFILL_RETRY_COUNT', 3);
    this.retryDelayMs = this.config.get<number>('BACKFILL_RETRY_DELAY_MS', 1000);
  }

  /**
   * Start a new replay job
   */
  startReplay(config: ReplayJobConfig): string {
    this.validateConfig(config);

    const jobId = randomUUID();
    const job: ReplayJobStatus = {
      jobId,
      status: 'pending',
      config,
      progress: {
        processedCount: 0,
        skippedCount: 0,
        totalLedgers: config.toLedger - config.fromLedger + 1,
      },
      createdAt: new Date().toISOString(),
    };

    this.jobs.set(jobId, job);

    // Start async replay in background
    this.runReplay(jobId).catch((err) => {
      this.logger.error(`Replay job ${jobId} failed:`, err);
      const job = this.jobs.get(jobId);
      if (job) {
        job.status = 'failed';
        job.error = err instanceof Error ? err.message : String(err);
        job.completedAt = new Date().toISOString();
      }
    });

    return jobId;
  }

  /**
   * Get replay job status
   */
  getJobStatus(jobId: string): ReplayJobStatus | null {
    return this.jobs.get(jobId) || null;
  }

  /**
   * Validate replay configuration
   */
  private validateConfig(config: ReplayJobConfig): void {
    if (!Number.isInteger(config.fromLedger) || config.fromLedger <= 0) {
      throw new Error(
        `fromLedger must be a positive integer, got: ${config.fromLedger}`,
      );
    }

    if (!Number.isInteger(config.toLedger) || config.toLedger <= 0) {
      throw new Error(
        `toLedger must be a positive integer, got: ${config.toLedger}`,
      );
    }

    if (config.fromLedger > config.toLedger) {
      throw new Error(
        `fromLedger (${config.fromLedger}) must be <= toLedger (${config.toLedger})`,
      );
    }

    const range = config.toLedger - config.fromLedger + 1;
    if (range > this.maxRange) {
      throw new Error(
        `Range of ${range} ledgers exceeds BACKFILL_MAX_RANGE (${this.maxRange})`,
      );
    }
  }

  /**
   * Run the replay job
   */
  private async runReplay(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    job.status = 'running';
    job.startedAt = new Date().toISOString();

    // Acquire lock to prevent concurrent indexing
    if (!this.lock.tryAcquire()) {
      throw new BackfillLockError('Could not acquire backfill lock');
    }

    try {
      const { fromLedger, toLedger, dryRun } = job.config;
      const missingLedgers: number[] = [];
      const runStart = Date.now();

      this.logger.log(
        `Replay job ${jobId} started: fromLedger=${fromLedger} toLedger=${toLedger} dryRun=${dryRun}`,
      );

      for (let seq = fromLedger; seq <= toLedger; seq++) {
        job.progress.currentLedger = seq;

        let ledgerData: Awaited<ReturnType<HorizonClientService['fetchLedger']>> = null;
        let lastError: Error | null = null;
        let attempts = 0;

        // Fetch with retry
        while (attempts <= this.retryCount) {
          try {
            ledgerData = await this.horizonClient.fetchLedger(seq);
            lastError = null;
            break;
          } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
            attempts++;
            if (attempts <= this.retryCount) {
              await this.delay(this.retryDelayMs);
            }
          }
        }

        if (lastError !== null) {
          this.logger.warn(
            `Replay job ${jobId}: Missing ledger seq=${seq}: transient error after ${attempts} attempt(s)`,
          );
          missingLedgers.push(seq);
          job.progress.skippedCount++;
        } else if (ledgerData === null) {
          this.logger.warn(
            `Replay job ${jobId}: Missing ledger seq=${seq}: not found in Horizon archive`,
          );
          missingLedgers.push(seq);
          job.progress.skippedCount++;
        } else {
          // Submit to indexer (unless dry-run)
          if (!dryRun) {
            await this.indexer.submitLedger(ledgerData, seq);
          } else {
            this.logger.debug(
              `Replay job ${jobId} (dry-run): Would submit ledger seq=${seq}`,
            );
          }
          job.progress.processedCount++;
        }

        // Progress log every 100 ledgers
        const processed = seq - fromLedger + 1;
        const total = job.progress.totalLedgers;
        if (processed % 100 === 0) {
          const pct = Math.round((processed / total) * 100);
          this.logger.log(
            `Replay job ${jobId} progress: seq=${seq} processed=${processed}/${total} (${pct}%)`,
          );
        }
      }

      const elapsedMs = Date.now() - runStart;

      job.status = 'completed';
      job.completedAt = new Date().toISOString();
      job.result = {
        elapsedMs,
        missingLedgers,
      };

      this.logger.log(
        `Replay job ${jobId} completed: processedCount=${job.progress.processedCount} skippedCount=${job.progress.skippedCount} elapsedMs=${elapsedMs}`,
      );
    } finally {
      this.lock.release();
      delete job.progress.currentLedger;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
