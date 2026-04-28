import { Logger } from '@nestjs/common';
import { captureIngestionError } from '../sentry/sentry';

export interface TicketEvent {
  ledger?: number;
  contractVersion?: string;
  eventType?: string;
  [key: string]: unknown;
}

export class TicketProcessor {
  private readonly logger = new Logger(TicketProcessor.name);

  /**
   * Process a ticket-related blockchain event.
   * Logs and captures errors to Sentry without throwing secondary exceptions.
   */
  async processEvent(event: TicketEvent): Promise<void> {
    try {
      this.logger.log(
        `Processing event: type=${event.eventType ?? 'unknown'}, ledger=${event.ledger ?? 'unknown'}`,
      );

      // TODO: implement ticket event processing logic here
    } catch (error: unknown) {
      this.logger.error(
        `Failed to process event: ${error instanceof Error ? error.message : String(error)}`,
      );
      captureIngestionError(error, {
        ledger: event.ledger,
        contractVersion: event.contractVersion,
        eventType: event.eventType,
        eventPayload: event,
      });
    }
  }
}
