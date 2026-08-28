import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BackfillLock, BackfillLockError } from './backfill-lock';
import { HorizonClientService } from './horizon-client.service';
import { IndexerService } from './indexer.service';
import { BackfillSummary } from './indexer-backfill.types';

@Injectable()
export class IndexerBackfillService {
  private readonly logger = new Logger(IndexerBackfillService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly lock: BackfillLock,
    private readonly horizonClient: HorizonClientService,
    private readonly indexer: IndexerService,
  ) {}

  private validate(startLedger: number, endLedger: number): void {
    if (!Number.isInteger(startLedger) || startLedger <= 0) {
      throw new Error(
        `startLedger must be a positive integer, got: ${startLedger}`,
      );
    }

    if (!Number.isInteger(endLedger) || endLedger <= 0) {
      throw new Error(
        `endLedger must be a positive integer, got: ${endLedger}`,
      );
    }

    if (startLedger > endLedger) {
      throw new Error(
        `startLedger (${startLedger}) must be <= endLedger (${endLedger})`,
      );
    }

    const maxRange = this.config.get<number>('BACKFILL_MAX_RANGE', 10000);
    const range = endLedger - startLedger + 1;
    if (range > maxRange) {
      throw new Error(
        `Range of ${range} ledgers exceeds BACKFILL_MAX_RANGE (${maxRange})`,
      );
    }
  }

  async backfill(
    startLedger: number,
    endLedger: number,
  ): Promise<BackfillSummary> {
    this.validate(startLedger, endLedger);

    if (!this.lock.tryAcquire()) {
      throw new BackfillLockError();
    }

    try {
      return await this.runBackfill(startLedger, endLedger);
    } finally {
      this.lock.release();
    }
  }

  private async runBackfill(
    startLedger: number,
    endLedger: number,
  ): Promise<BackfillSummary> {
    const totalLedgers = endLedger - startLedger + 1;
    const retryCount = this.config.get<number>('BACKFILL_RETRY_COUNT', 3);
    const retryDelayMs = this.config.get<number>('BACKFILL_RETRY_DELAY_MS', 1000);

    const missingLedgers: number[] = [];
    let processedCount = 0;
    const runStart = Date.now();

    // Info: start log
    this.logger.log(
      `Backfill started: startLedger=${startLedger} endLedger=${endLedger} totalLedgers=${totalLedgers}`,
    );

    for (let seq = startLedger; seq <= endLedger; seq++) {
      const ledgerStart = Date.now();
      let ledgerData: Awaited<ReturnType<HorizonClientService['fetchLedger']>> = null;
      let lastError: Error | null = null;
      let attempts = 0;

      // Fetch with retry on transient errors
      while (attempts <= retryCount) {
        try {
          ledgerData = await this.horizonClient.fetchLedger(seq);
          lastError = null;
          break; // success or 404 (null)
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          attempts++;
          if (attempts <= retryCount) {
            await this.delay(retryDelayMs);
          }
        }
      }

      if (lastError !== null) {
        // Exhausted retries — transient error
        const reason = `transient error after ${attempts} attempt(s): ${lastError.message}`;
        this.logger.warn(`Missing ledger seq=${seq}: ${reason}`);
        missingLedgers.push(seq);
      } else if (ledgerData === null) {
        // 404 — not in Horizon archive
        const reason = 'not found in Horizon archive (404)';
        this.logger.warn(`Missing ledger seq=${seq}: ${reason}`);
        missingLedgers.push(seq);
      } else {
        // Submit to indexer pipeline
        await this.indexer.submitLedger(ledgerData);
        processedCount++;
        const elapsed = Date.now() - ledgerStart;
        this.logger.debug(`Processed ledger seq=${seq} elapsedMs=${elapsed}`);
      }

      // Progress log every 100 ledgers
      const processed = seq - startLedger + 1;
      if (processed % 100 === 0) {
        const pct = Math.round((processed / totalLedgers) * 100);
        this.logger.log(
          `Backfill progress: seq=${seq} processed=${processed}/${totalLedgers} (${pct}%)`,
        );
      }
    }

    const elapsedMs = Date.now() - runStart;
    const skippedCount = missingLedgers.length;

    // Info: completion log
    this.logger.log(
      `Backfill complete: processedCount=${processedCount} skippedCount=${skippedCount} elapsedMs=${elapsedMs}`,
    );

    return {
      startLedger,
      endLedger,
      totalLedgers,
      processedCount,
      skippedCount,
      missingLedgers,
      elapsedMs,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
