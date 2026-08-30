import { Injectable, Logger, Optional } from "@nestjs/common";
import { DataSource } from "typeorm";
import { RaffleProcessor } from "../processors/raffle.processor";
import { TicketProcessor } from "../processors/ticket.processor";
import { AdminProcessor } from "../processors/admin.processor";
import { DomainEvent } from "./event.types";
import { DeadLetterQueueService } from "./dead-letter-queue.service";
import { PipelineStateMachine } from "./pipeline-state";
import { TracingService } from "../tracing/tracing.service";
import { CursorAdvance } from "./cursor-advance";
import { DuplicateDetector } from "./duplicate-detector";
import {
  DispatchOutcomeClassifier,
  HandlerExecutionResult,
  HandlerOutcome,
} from "./dispatch-outcome";

export { HandlerExecutionResult, HandlerOutcome } from "./dispatch-outcome";

export interface DispatchItem {
  event: DomainEvent;
  raw: Record<string, unknown>;
}

@Injectable()
export class IngestionDispatcherService {
  private readonly logger = new Logger(IngestionDispatcherService.name);
  private readonly cursorAdvance: CursorAdvance;
  private readonly duplicateDetector = new DuplicateDetector();
  private readonly outcomes: DispatchOutcomeClassifier;

  constructor(
    dataSource: DataSource,
    raffleProcessor: RaffleProcessor,
    ticketProcessor: TicketProcessor,
    adminProcessor: AdminProcessor,
    @Optional() deadLetterQueue?: DeadLetterQueueService,
    @Optional() pipeline?: PipelineStateMachine,
    // Keep last so unit tests that construct with positional DLQ args stay valid.
    @Optional() private readonly tracing?: TracingService,
  ) {
    this.cursorAdvance = new CursorAdvance(
      dataSource,
      raffleProcessor,
      ticketProcessor,
      adminProcessor,
      this.logger,
    );
    this.outcomes = new DispatchOutcomeClassifier(
      this.logger,
      deadLetterQueue,
      pipeline,
    );
  }

  async dispatch(
    event: DomainEvent,
    raw: Record<string, unknown>,
  ): Promise<HandlerExecutionResult> {
    return this.executeIsolated({ event, raw });
  }

  async dispatchMany(
    items: Array<{ event: DomainEvent; rawEvent: Record<string, unknown> }>,
  ): Promise<HandlerExecutionResult[]> {
    return this.dispatchBatch(
      items.map((item) => ({ event: item.event, raw: item.rawEvent })),
    );
  }

  async dispatchBatch(items: DispatchItem[]): Promise<HandlerExecutionResult[]> {
    const results: HandlerExecutionResult[] = [];

    for (const item of items) {
      results.push(await this.executeIsolated(item));
    }

    return results;
  }

  private async executeIsolated(
    item: DispatchItem,
  ): Promise<HandlerExecutionResult> {
    const identity = this.duplicateDetector.inspect(item.event, item.raw);
    const startedAt = Date.now();

    const run = () =>
      this.outcomes.run(
        {
          ...identity,
          event: item.event,
          raw: item.raw,
          startedAt,
          successOutcome: identity.needsDatabase ? "succeeded" : "skipped",
        },
        () => this.applyEventTraced(item.event, item.raw, identity.eventId),
      );

    if (!this.tracing?.withSpan) {
      return run();
    }

    return this.tracing.withSpan(
      "indexer.event.process",
      {
        "event.type": item.event.type,
        "event.id": identity.eventId,
        "event.schema_version": identity.schemaVersion,
        "handler.name": identity.handlerName,
        ...(Number.isFinite(identity.ledger)
          ? { "stellar.ledger": identity.ledger }
          : {}),
      },
      async (span) => {
        const result = await run();
        span.setAttribute("handler.outcome", result.outcome);
        span.setAttribute("handler.duration_ms", result.durationMs);
        return result;
      },
    );
  }

  private async applyEventTraced(
    event: DomainEvent,
    raw: Record<string, unknown>,
    eventId: string,
  ): Promise<void> {
    const apply = () => this.cursorAdvance.apply(event, raw);
    if (!this.tracing?.withSpan) {
      return apply();
    }

    return this.tracing.withSpan(
      "indexer.event.handler",
      {
        "event.type": event.type,
        "event.id": eventId,
        "db.system": "postgresql",
      },
      async () =>
        this.tracing!.withSpan(
          "indexer.event.db",
          {
            "event.type": event.type,
            "event.id": eventId,
            "db.operation": "apply_event",
          },
          apply,
        ),
    );
  }
}