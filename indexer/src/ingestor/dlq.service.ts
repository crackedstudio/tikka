import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeadLetterEventEntity } from '../database/entities/dead-letter-event.entity';
import { DomainEvent } from './event.types';
import { IngestionDispatcherService } from './ingestion-dispatcher.service';

export const MAX_RETRIES = 5;

/** Base delay in ms for exponential back-off: delay = BASE_DELAY_MS * 2^retryCount */
const BASE_DELAY_MS = 1_000;

@Injectable()
export class DlqService {
  private readonly logger = new Logger(DlqService.name);

  constructor(
    @InjectRepository(DeadLetterEventEntity)
    private readonly repo: Repository<DeadLetterEventEntity>,
    private readonly dispatcher: IngestionDispatcherService,
  ) {}

  async insert(
    event: DomainEvent,
    rawEvent: Record<string, unknown>,
    error: unknown,
  ): Promise<void> {
    const ledger = Number(rawEvent['ledger'] ?? 0);
    const contractId = (rawEvent['contractId'] as string | undefined) ?? null;
    const errorMessage = error instanceof Error ? error.message : String(error);

    await this.repo.save(
      this.repo.create({
        ledger,
        contractId,
        eventType: event.type,
        rawPayload: rawEvent,
        errorMessage,
        retryCount: 0,
      }),
    );

    this.logger.warn(
      `DLQ: stored failed event ${event.type} at ledger ${ledger}: ${errorMessage}`,
    );
  }

  async count(): Promise<number> {
    return this.repo.count();
  }

  /**
   * Retry all DLQ entries that have not yet exceeded MAX_RETRIES.
   * Uses exponential back-off: delay = BASE_DELAY_MS * 2^retryCount.
   * Successful entries are deleted; failed entries have retryCount incremented.
   */
  async replayAll(): Promise<{ replayed: number; failed: number }> {
    const entries = await this.repo.find({
      where: { retryCount: undefined as any },
      order: { createdAt: 'ASC' },
    });

    const eligible = entries.filter((e) => e.retryCount < MAX_RETRIES);
    let replayed = 0;
    let failed = 0;

    for (const entry of eligible) {
      const delay = BASE_DELAY_MS * Math.pow(2, entry.retryCount);
      await sleep(delay);

      try {
        const event = { ...entry.rawPayload, type: entry.eventType } as DomainEvent;
        const qr = await this.dispatcher.dispatch(event, entry.rawPayload);
        if (qr) {
          await qr.commitTransaction();
          qr.release();
        }
        await this.repo.delete(entry.id);
        replayed++;
        this.logger.log(`DLQ: replayed ${entry.eventType} (id=${entry.id})`);
      } catch (err) {
        entry.retryCount += 1;
        entry.errorMessage = err instanceof Error ? err.message : String(err);
        await this.repo.save(entry);
        failed++;
        this.logger.warn(
          `DLQ: retry ${entry.retryCount}/${MAX_RETRIES} failed for ${entry.eventType} (id=${entry.id})`,
        );
      }
    }

    return { replayed, failed };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
