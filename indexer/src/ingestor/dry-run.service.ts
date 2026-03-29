import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, QueryRunner } from 'typeorm';

/**
 * DryRunService — wraps DB operations so they always roll back in dry-run mode.
 *
 * Enable via env: DRY_RUN=true
 *
 * In dry-run mode:
 *  - All DB saves are executed inside a transaction that is always rolled back.
 *  - The intended operations are logged at INFO level.
 *  - Cache invalidations are suppressed.
 */
@Injectable()
export class DryRunService {
  private readonly logger = new Logger(DryRunService.name);
  readonly enabled: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
  ) {
    this.enabled = this.configService.get<string>('DRY_RUN', 'false') === 'true';
    if (this.enabled) {
      this.logger.warn('DRY-RUN mode is ENABLED — no DB writes will be committed.');
    }
  }

  /**
   * Runs `work` inside a transaction.
   * In dry-run mode the transaction is always rolled back; otherwise it commits.
   */
  async run(label: string, work: (runner: QueryRunner) => Promise<void>): Promise<void> {
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      await work(runner);
      if (this.enabled) {
        this.logger.log(`[DRY-RUN] Rolling back: ${label}`);
        await runner.rollbackTransaction();
      } else {
        await runner.commitTransaction();
      }
    } catch (err) {
      await runner.rollbackTransaction();
      throw err;
    } finally {
      await runner.release();
    }
  }

  /**
   * Conditionally runs a cache invalidation.
   * Suppressed (and logged) in dry-run mode.
   */
  async invalidate(label: string, fn: () => Promise<void>): Promise<void> {
    if (this.enabled) {
      this.logger.log(`[DRY-RUN] Suppressing cache invalidation: ${label}`);
      return;
    }
    await fn();
  }
}
