import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { EventEmitter } from 'events';

export interface TicketCountUpdatedPayload {
  raffleId: number;
  ticketsSold: number;
  updatedAt: number;
}

const RAFFLE_TICKET_COUNT_CHANNEL = 'raffle:ticket_count_updated';

/**
 * Subscribes to the `raffle:ticket_count_updated` Redis Pub/Sub channel that the
 * indexer publishes to whenever it processes a TicketPurchased event.
 *
 * Uses a dedicated Redis connection and re-emits payloads locally via a plain
 * Node EventEmitter so that any number of SSE connections in this process can
 * listen without each opening its own Redis subscription.
 *
 * When REDIS_URL is not configured, this service no-ops: the SSE endpoint
 * still works, it just never receives push updates, and the client falls
 * back to polling.
 */
@Injectable()
export class RaffleEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RaffleEventsService.name);
  private subscriber: Redis | null = null;
  private readonly emitter = new EventEmitter();

  constructor(private readonly config: ConfigService) {
    this.emitter.setMaxListeners(0);
  }

  onModuleInit(): void {
    const url = this.config.get<string>('REDIS_URL', '')?.trim();
    if (!url) {
      this.logger.warn(
        'REDIS_URL not set; raffle ticket-count push updates disabled (clients will use polling fallback)',
      );
      return;
    }

    try {
      this.subscriber = new Redis(url, {
        maxRetriesPerRequest: null,
        retryStrategy: (times: number) => Math.min(times * 50, 2000),
      });

      this.subscriber.on('error', (err: Error) => {
        this.logger.warn(`Raffle events Redis subscriber error: ${err.message}`);
      });

      this.subscriber.on('connect', () => {
        this.logger.log('Raffle events Redis subscriber connected');
      });

      this.subscriber.subscribe(RAFFLE_TICKET_COUNT_CHANNEL).catch((err: Error) => {
        this.logger.warn(`Failed to subscribe to raffle events channel: ${err.message}`);
      });

      this.subscriber.on('message', (channel: string, message: string) => {
        if (channel !== RAFFLE_TICKET_COUNT_CHANNEL) {
          return;
        }
        try {
          const payload = JSON.parse(message) as TicketCountUpdatedPayload;
          this.emitter.emit(`raffle:${payload.raffleId}`, payload);
        } catch (err) {
          this.logger.warn(
            `Failed to parse raffle ticket-count payload: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      });
    } catch (err) {
      this.logger.warn(
        `Raffle events Redis subscriber failed to initialize: ${err instanceof Error ? err.message : String(err)}`,
      );
      this.subscriber = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.subscriber) {
      try {
        await this.subscriber.quit();
      } catch {
        this.subscriber.disconnect();
      }
      this.subscriber = null;
    }
  }

  /**
   * Registers a listener for ticket-count updates for a specific raffle.
   * Returns an unsubscribe function — callers MUST call it when the
   * client disconnects to avoid leaking listeners.
   */
  onTicketCountUpdated(
    raffleId: number,
    listener: (payload: TicketCountUpdatedPayload) => void,
  ): () => void {
    const eventName = `raffle:${raffleId}`;
    this.emitter.on(eventName, listener);
    return () => this.emitter.off(eventName, listener);
  }

  isEnabled(): boolean {
    return this.subscriber !== null;
  }
}
