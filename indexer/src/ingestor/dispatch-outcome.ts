import { Logger } from "@nestjs/common";
import { DlqReason } from "../database/entities/dead-letter-event.entity";
import { DomainEvent } from "./event.types";
import { DeadLetterQueueService } from "./dead-letter-queue.service";
import { PipelineStateMachine, PipelineTransition } from "./pipeline-state";
import {
  isSupportedSchemaVersion,
  UnsupportedSchemaVersionError,
} from "./handlers/schema-version";

export type HandlerOutcome = "succeeded" | "failed" | "skipped";

export interface HandlerExecutionResult {
  handlerName: string;
  eventId: string;
  eventType: string;
  outcome: HandlerOutcome;
  durationMs: number;
  error?: Error;
}

export interface DispatchAttemptContext {
  handlerName: string;
  eventId: string;
  event: DomainEvent;
  raw: Record<string, unknown>;
  ledger: number;
  txHash: string;
  schemaVersion: number;
  startedAt: number;
  successOutcome: Exclude<HandlerOutcome, "failed">;
}

export class DispatchOutcomeClassifier {
  constructor(
    private readonly logger: Logger,
    private readonly deadLetterQueue?: DeadLetterQueueService,
    private readonly pipeline?: PipelineStateMachine,
  ) {}

  async run(
    context: DispatchAttemptContext,
    apply: () => Promise<void>,
  ): Promise<HandlerExecutionResult> {
    const unsupported = await this.rejectUnsupportedSchema(context);
    if (unsupported) return unsupported;

    const maxAttempts = parseInt(process.env.MAX_DISPATCH_RETRIES ?? "3", 10);
    const baseDelayMs = parseInt(process.env.BASE_RETRY_DELAY_MS ?? "500", 10);
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await apply();
        return this.logResult({
          handlerName: context.handlerName,
          eventId: context.eventId,
          eventType: context.event.type,
          outcome: context.successOutcome,
          durationMs: Date.now() - context.startedAt,
        });
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.logger.warn(
          `Dispatch attempt ${attempt}/${maxAttempts} failed for ${context.event.type} ${context.eventId}: ${lastError.message}`,
        );

        if (attempt < maxAttempts) {
          await this.delay(baseDelayMs * Math.pow(2, attempt - 1));
        }
      }
    }

    const result = this.logResult({
      handlerName: context.handlerName,
      eventId: context.eventId,
      eventType: context.event.type,
      outcome: "failed",
      durationMs: Date.now() - context.startedAt,
      error: lastError,
    });

    await this.deadLetter(context, {
      reason: DlqReason.HANDLER_ERROR,
      error: lastError!,
      durationMs: result.durationMs,
      attemptCount: maxAttempts,
    });

    return result;
  }

  private async rejectUnsupportedSchema(
    context: DispatchAttemptContext,
  ): Promise<HandlerExecutionResult | null> {
    if (isSupportedSchemaVersion(context.schemaVersion)) return null;

    const error = new UnsupportedSchemaVersionError(
      context.schemaVersion,
      context.event.type,
    );
    const result = this.logResult({
      handlerName: context.handlerName,
      eventId: context.eventId,
      eventType: context.event.type,
      outcome: "failed",
      durationMs: Date.now() - context.startedAt,
      error,
    });

    await this.deadLetter(context, {
      reason: DlqReason.SCHEMA_UNSUPPORTED,
      error,
      durationMs: result.durationMs,
      attemptCount: 1,
    });

    return result;
  }

  private async deadLetter(
    context: DispatchAttemptContext,
    failure: {
      reason: DlqReason;
      error: Error;
      durationMs: number;
      attemptCount: number;
    },
  ): Promise<void> {
    this.pipeline?.apply(PipelineTransition.HANDLER_FAILURE);

    await this.deadLetterQueue?.enqueue({
      handlerName: context.handlerName,
      eventId: context.eventId,
      eventType: context.event.type,
      ledger: Number.isFinite(context.ledger) ? context.ledger : null,
      txHash: context.txHash || null,
      schemaVersion: context.schemaVersion,
      reason: failure.reason,
      errorMessage: failure.error.message,
      errorStack: failure.error.stack,
      durationMs: failure.durationMs,
      attemptCount: failure.attemptCount,
      event: context.event,
      rawEvent: context.raw,
      failedAt: new Date().toISOString(),
    });

    this.pipeline?.apply(PipelineTransition.DLQ_ENQUEUED);
  }

  private logResult(result: HandlerExecutionResult): HandlerExecutionResult {
    const line = `handler=${result.handlerName} eventId=${result.eventId} outcome=${result.outcome} durationMs=${result.durationMs}`;

    if (result.outcome === "failed") {
      this.logger.error(line, result.error?.stack);
    } else {
      this.logger.log(line);
    }

    return result;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}