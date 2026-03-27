import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BatchConfig, BATCH_CONFIG_KEY } from '../config/batch.config';
import { BatchFlushResult, RevealItem } from './batch-reveal.types';

@Injectable()
export class BatchCollector implements OnModuleDestroy {
  private readonly logger = new Logger(BatchCollector.name);

  private readonly batchSize: number;
  private readonly batchWindowMs: number;

  private buffer: RevealItem[] = [];
  private timerHandle: NodeJS.Timeout | null = null;
  private inFlight = false;
  private flushHandler: ((result: BatchFlushResult) => Promise<void>) | null =
    null;

  constructor(private readonly configService: ConfigService) {
    const config = this.configService.get<BatchConfig>(BATCH_CONFIG_KEY)!;
    this.batchSize = config.batchSize;
    this.batchWindowMs = config.batchWindowMs;
  }

  onFlush(handler: (result: BatchFlushResult) => Promise<void>): void {
    this.flushHandler = handler;
  }

  add(item: RevealItem): void {
    this.buffer.push(item);

    // Start the window timer on the first item in an empty buffer
    if (this.buffer.length === 1 && !this.inFlight) {
      this.startTimer();
    }

    // Immediate flush when size limit is reached and no flush is in progress
    if (!this.inFlight && this.buffer.length >= this.batchSize) {
      this.clearTimer();
      void this.flush('SIZE_LIMIT');
    }
  }

  onModuleDestroy(): void {
    this.clearTimer();
  }

  private startTimer(): void {
    this.timerHandle = setTimeout(() => {
      this.timerHandle = null;
      if (!this.inFlight && this.buffer.length > 0) {
        void this.flush('TIMER');
      }
    }, this.batchWindowMs);
  }

  private clearTimer(): void {
    if (this.timerHandle !== null) {
      clearTimeout(this.timerHandle);
      this.timerHandle = null;
    }
  }

  private async flush(triggerReason: 'SIZE_LIMIT' | 'TIMER'): Promise<void> {
    if (this.inFlight || this.buffer.length === 0 || !this.flushHandler) {
      return;
    }

    this.inFlight = true;
    const items = this.buffer.splice(0, this.buffer.length);

    this.logger.debug(
      `Flushing batch: size=${items.length}, trigger=${triggerReason}`,
    );

    try {
      await this.flushHandler({ items, triggerReason });
    } finally {
      this.inFlight = false;

      // If items accumulated while in-flight, start a new timer for them
      if (this.buffer.length > 0) {
        if (this.buffer.length >= this.batchSize) {
          void this.flush('SIZE_LIMIT');
        } else {
          this.startTimer();
        }
      }
    }
  }
}
