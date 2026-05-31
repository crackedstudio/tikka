import { Injectable, Logger } from "@nestjs/common";
import { DomainEvent } from "./event.types";
import { DlqReason } from "../database/entities/dead-letter-event.entity";

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
  event: DomainEvent;
  rawEvent: unknown;
  failedAt: string;
}

@Injectable()
export class DeadLetterQueueService {
  private readonly logger = new Logger(DeadLetterQueueService.name);
  private readonly records: DeadLetterEvent[] = [];

  async enqueue(record: DeadLetterEvent): Promise<void> {
    this.records.push(record);
    this.logger.error(
      `DLQ event handler=${record.handlerName} eventId=${record.eventId} outcome=failed durationMs=${record.durationMs} error=${record.errorMessage}`,
      record.errorStack,
    );
  }

  getRecords(): DeadLetterEvent[] {
    return [...this.records];
  }

  clear(): void {
    this.records.length = 0;
  }
}
