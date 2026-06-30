import { Injectable, Logger, Optional } from "@nestjs/common";
import { DomainEvent } from "./event.types";
import { DlqReason } from "../database/entities/dead-letter-event.entity";
import { MetricsService } from "../metrics/metrics.service";


export interface DeadLetterEvent {
  handlerName: string;
  eventId: string;
  eventType: string;
  ledger: number | null;
  txHash: string | null;
  /** Schema version of the failed event, for forward-compatible triage. */
  schemaVersion: number;
  /** Why the event failed (parser/handler/db/schema) — drives replay policy. */
  reason: DlqReason;
  errorMessage: string;
  errorStack?: string;
  durationMs: number;
  attemptCount: number;
  event: DomainEvent;
  rawEvent: unknown;
  failedAt: string;
}

@Injectable()
export class DeadLetterQueueService {
  private readonly logger = new Logger(DeadLetterQueueService.name);
  private readonly records: DeadLetterEvent[] = [];

  constructor(@Optional() private readonly metrics?: MetricsService) { }

  async enqueue(record: DeadLetterEvent): Promise<void> {
    this.records.push(record);

    this.metrics?.incrementDlqEventsTotal(record.reason, record.eventType);

    // Update gauge for this contract address based on current in-memory queue.
    // (DLQ depth metric is for observability; in-memory DLQ should remain consistent.)
    const contractAddress = (record.rawEvent as any)?.contractId ?? 'unknown';
    const depth = this.records.filter(
      (r) => ((r.rawEvent as any)?.contractId ?? 'unknown') === contractAddress,
    ).length;
    this.metrics?.setDlqDepth(contractAddress, depth);

    this.logger.error(
      `DLQ event handler=${record.handlerName} eventId=${record.eventId} outcome=failed durationMs=${record.durationMs} error=${record.errorMessage}`,
      record.errorStack,
    );
  }


  getRecords(): DeadLetterEvent[] {
    return [...this.records];
  }

  clear(): void {
    if (this.metrics) {
      // Clear all gauges we touched (best-effort). For in-memory DLQ we can only
      // recompute depth for the current records (which becomes empty after clear).
      const touchedContracts = new Set(
        this.records.map((r) => ((r.rawEvent as any)?.contractId ?? 'unknown')),
      );
      this.records.length = 0;
      for (const contractAddress of touchedContracts) {
        this.metrics.setDlqDepth(contractAddress, 0);
      }
    } else {
      this.records.length = 0;
    }
  }

}
