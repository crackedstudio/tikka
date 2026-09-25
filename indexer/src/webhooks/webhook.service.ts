import { Injectable, Logger, Optional } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { randomUUID } from "crypto";
import { WebhookEntity } from "../database/entities/webhook.entity";
import { WebhookDeliveryEntity } from "../database/entities/webhook-delivery.entity";
import { WebhookDeadLetterEntity } from "../database/entities/webhook-dead-letter.entity";
import { TracingService } from "../tracing/tracing.service";
import { getRequestIdHeaders } from "../common/request-context";
import {
  DELIVERY_TIMEOUT_MS,
  MAX_DELIVERY_ATTEMPTS,
  backoffDelayMs,
  classifyDeliveryFailure,
  type DeliveryFailure,
} from "./webhook-delivery-policy";
import {
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_SIGNATURE_SECRET_ENV,
  buildWebhookHeaders,
  resolveWebhookSignatureSecret,
} from "./webhook-signature";

export interface WebhookPayload {
  eventType: string;
  data: Record<string, any>;
}

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    @InjectRepository(WebhookEntity)
    private readonly webhookRepo: Repository<WebhookEntity>,
    @InjectRepository(WebhookDeliveryEntity)
    private readonly deliveryRepo: Repository<WebhookDeliveryEntity>,
    @InjectRepository(WebhookDeadLetterEntity)
    private readonly deadLetterRepo: Repository<WebhookDeadLetterEntity>,
    @Optional() private readonly tracing?: TracingService,
  ) {}

  /** Alias used by some processor tests / callers. */
  async dispatchEvent(eventType: string, payload: Record<string, any>) {
    return this.dispatch(eventType, payload);
  }

  async dispatch(eventType: string, payload: Record<string, any>) {
    const run = async () => {
      const webhooks = await this.webhookRepo.find({
        where: {
          isActive: true,
        },
      });

      const targetWebhooks = webhooks.filter((w) =>
        w.supportedEvents.includes(eventType),
      );

      if (targetWebhooks.length === 0) {
        return;
      }

      this.logger.log(
        `Fanning out event ${eventType} to ${targetWebhooks.length} webhooks`,
      );

      const webhookPayload: WebhookPayload = { eventType, data: payload };

      await Promise.all(
        targetWebhooks.map((webhook) =>
          this.deliverWithRetry(webhook.url, webhookPayload),
        ),
      );
    };

    if (!this.tracing?.withSpan) {
      return run();
    }

    return this.tracing.withSpan(
      "indexer.event.webhook",
      {
        "event.type": eventType,
        ...(payload?.raffleId != null
          ? { "raffle.id": Number(payload.raffleId) }
          : {}),
      },
      async () => run(),
    );
  }

  /**
   * Deliver one payload to one subscriber, retrying per the delivery policy.
   *
   * Never throws: a delivery failure is a recorded outcome, not an error for
   * the dispatching pipeline to handle — one subscriber being down must not
   * take down the event that fanned out to it.
   */
  private async deliverWithRetry(
    url: string,
    payload: WebhookPayload,
    maxAttempts = MAX_DELIVERY_ATTEMPTS,
  ): Promise<void> {
    const deliver = async () => {
      // One id per logical delivery, reused across every attempt. A subscriber
      // may have processed an attempt whose response we never saw, so the
      // retry has to be recognisable as the same delivery — that is what makes
      // at-least-once safe to consume. A fresh id per attempt would leave the
      // subscriber unable to tell a retry from a new event.
      const deliveryId = randomUUID();

      // Serialize once and sign these exact bytes: the consumer verifies the
      // raw body, so signing a second serialization would not match.
      const rawBody = JSON.stringify(payload);

      const secret = resolveWebhookSignatureSecret();
      if (!secret) {
        this.logger.warn(
          `${WEBHOOK_SIGNATURE_SECRET_ENV} is not set — delivering to ${url} unsigned. ` +
            `Any consumer that verifies ${WEBHOOK_SIGNATURE_HEADER} will reject it.`,
        );
      }

      const headers = {
        ...buildWebhookHeaders({ secret, rawBody, deliveryId }),
        ...getRequestIdHeaders(),
      };

      let attempt = 0;
      let success = false;
      let failure: DeliveryFailure | null = null;

      while (attempt < maxAttempts && !success) {
        attempt++;
        try {
          const response = await fetch(url, {
            method: "POST",
            headers,
            body: rawBody,
            signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
          });

          if (response.ok) {
            success = true;
            break;
          }

          failure = classifyDeliveryFailure({
            status: response.status,
            statusText: response.statusText,
          });

          // A permanent rejection will not become a success by asking again.
          if (!failure.retryable) break;

          if (attempt < maxAttempts) {
            await this.sleep(backoffDelayMs(attempt));
          }
        } catch (error: any) {
          failure = classifyDeliveryFailure({ error });
          if (attempt < maxAttempts) {
            await this.sleep(backoffDelayMs(attempt));
          }
        }
      }

      await this.recordDelivery(
        url,
        payload,
        success ? null : failure,
        attempt,
      );

      if (!success && failure) {
        this.logger.warn(
          `Failed to deliver webhook to ${url} after ${attempt} attempt(s). Error: ${failure.message}`,
        );
        await this.deadLetter(url, payload, failure, attempt);
      }
    };

    if (!this.tracing?.withSpan) {
      return deliver();
    }

    return this.tracing.withSpan(
      "indexer.event.webhook.deliver",
      {
        "event.type": payload.eventType,
        "http.url": url,
        "http.method": "POST",
      },
      async () => deliver(),
    );
  }

  /**
   * Persist the delivery attempt outcome.
   *
   * Best-effort: the payload has already been sent (or not), and losing the
   * audit row must not turn a successful delivery into a failed dispatch.
   */
  private async recordDelivery(
    url: string,
    payload: WebhookPayload,
    failure: DeliveryFailure | null,
    attempts: number,
  ): Promise<void> {
    try {
      const delivery = this.deliveryRepo.create({
        webhookUrl: url,
        eventType: payload.eventType,
        payload,
        status: failure ? "failed" : "success",
        attempts,
        errorResponse: failure ? failure.message : null,
      });
      await this.deliveryRepo.save(delivery);
    } catch (dbError) {
      this.logger.error(`Failed to record webhook delivery to ${url}:`, dbError);
    }
  }

  /**
   * Record an exhausted delivery for operator replay.
   *
   * `retryable` carries the policy verdict rather than being hardcoded: a
   * subscriber that answered 400 will answer 400 again, so replaying it would
   * only produce a second dead letter, while a 5xx or a timeout is worth
   * retrying once the subscriber recovers.
   */
  private async deadLetter(
    url: string,
    payload: WebhookPayload,
    failure: DeliveryFailure,
    attempts: number,
  ): Promise<void> {
    try {
      const entry = this.deadLetterRepo.create({
        webhookUrl: url,
        eventType: payload.eventType,
        payload,
        errorResponse: failure.message,
        reason: failure.reason,
        retryCount: attempts,
        retryable: failure.retryable,
        status: "pending",
      });
      await this.deadLetterRepo.save(entry);

      this.logger.warn(
        `Webhook DLQ: stored ${payload.eventType} -> ${url} (reason=${failure.reason}, retryable=${failure.retryable})`,
      );
    } catch (dbError) {
      this.logger.error(
        `Failed to record webhook dead letter for ${url}:`,
        dbError,
      );
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async registerWebhook(url: string, events: string[]) {
    const webhook = this.webhookRepo.create({ url, supportedEvents: events });
    await this.webhookRepo.save(webhook);
  }
}
