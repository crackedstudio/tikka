import { OracleLoggerService } from '../logger/oracle-logger';
import { Injectable, Logger } from '@nestjs/common';

export type AlertSeverity = 'warning' | 'critical';

export interface AlertPayload {
  severity: AlertSeverity;
  summary: string;
  details?: string;
  /** Stable key used to de-duplicate and auto-resolve the same alert. */
  dedupKey: string;
  /** Diagnostic context (e.g. oracle_id, raffle_id) included in outbound alert payloads. */
  context?: Record<string, unknown>;
}

type AlertingProvider = 'pagerduty' | 'opsgenie' | 'none';

/**
 * AlertingService
 *
 * Dispatches alerts to PagerDuty (Events API v2) or Opsgenie (Alert API),
 * selected via the ALERTING_PROVIDER env var.  Defaults to "none".
 *
 * Auto-resolve is supported via the same dedupKey used to open the alert.
 */
@Injectable()
export class AlertingService {
  
  private readonly provider: AlertingProvider;

  // PagerDuty
  private readonly pdRoutingKey: string;
  private readonly pdApiUrl = 'https://events.pagerduty.com/v2/enqueue';

  // Opsgenie
  private readonly opsgenieApiKey: string;
  private readonly opsgenieApiUrl = 'https://api.opsgenie.com/v2/alerts';

  // Generic webhook (Slack-compatible)
  private readonly webhookUrl: string;

  constructor(private readonly logger: OracleLoggerService) {
    const raw = (process.env.ALERTING_PROVIDER ?? 'none').toLowerCase();
    if (raw === 'pagerduty' || raw === 'opsgenie') {
      this.provider = raw;
    } else {
      this.provider = 'none';
    }

    this.pdRoutingKey = process.env.PAGERDUTY_ROUTING_KEY ?? '';
    this.opsgenieApiKey = process.env.OPSGENIE_API_KEY ?? '';
    this.webhookUrl = process.env.ALERT_WEBHOOK_URL ?? '';

    if (this.provider !== 'none') {
      this.logger.log(`Alerting provider: ${this.provider}`);
    }
    if (this.webhookUrl) {
      this.logger.log('Alert webhook configured');
    }
  }

  /** Fire (trigger) an alert. Dispatches to the configured provider and/or webhook. */
  async fire(payload: AlertPayload): Promise<void> {
    if (this.provider !== 'none') {
      try {
        if (this.provider === 'pagerduty') {
          await this.pagerdutyTrigger(payload);
        } else {
          await this.opsgenieTrigger(payload);
        }
      } catch (err) {
        this.logger.error(`Failed to fire alert "${payload.dedupKey}": ${(err as Error).message}`);
      }
    }

    if (this.webhookUrl) {
      try {
        await this.webhookTrigger(payload);
      } catch (err) {
        this.logger.error(`Failed to POST alert webhook "${payload.dedupKey}": ${(err as Error).message}`);
      }
    }
  }

  /** Resolve a previously fired alert. Dispatches to the configured provider and/or webhook. */
  async resolve(dedupKey: string): Promise<void> {
    if (this.provider !== 'none') {
      try {
        if (this.provider === 'pagerduty') {
          await this.pagerdutyResolve(dedupKey);
        } else {
          await this.opsgenieResolve(dedupKey);
        }
      } catch (err) {
        this.logger.error(`Failed to resolve alert "${dedupKey}": ${(err as Error).message}`);
      }
    }

    if (this.webhookUrl) {
      try {
        await this.webhookResolve(dedupKey);
      } catch (err) {
        this.logger.error(`Failed to POST alert-resolved webhook "${dedupKey}": ${(err as Error).message}`);
      }
    }
  }

  // ── PagerDuty ──────────────────────────────────────────────────────────────

  private async pagerdutyTrigger(payload: AlertPayload): Promise<void> {
    const body = {
      routing_key: this.pdRoutingKey,
      event_action: 'trigger',
      dedup_key: payload.dedupKey,
      payload: {
        summary: payload.summary,
        severity: payload.severity === 'critical' ? 'critical' : 'warning',
        source: 'tikka-oracle',
        custom_details:
          payload.details || payload.context
            ? { details: payload.details, ...payload.context }
            : undefined,
      },
    };

    const res = await fetch(this.pdApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`PagerDuty trigger failed (${res.status}): ${text}`);
    }

    this.logger.warn(`PagerDuty alert triggered: ${payload.dedupKey}`);
  }

  private async pagerdutyResolve(dedupKey: string): Promise<void> {
    const body = {
      routing_key: this.pdRoutingKey,
      event_action: 'resolve',
      dedup_key: dedupKey,
    };

    const res = await fetch(this.pdApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`PagerDuty resolve failed (${res.status}): ${text}`);
    }

    this.logger.log(`PagerDuty alert resolved: ${dedupKey}`);
  }

  // ── Opsgenie ───────────────────────────────────────────────────────────────

  private async opsgenieTrigger(payload: AlertPayload): Promise<void> {
    const body = {
      message: payload.summary,
      alias: payload.dedupKey,
      description: payload.details,
      priority: payload.severity === 'critical' ? 'P1' : 'P3',
      source: 'tikka-oracle',
    };

    const res = await fetch(this.opsgenieApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `GenieKey ${this.opsgenieApiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Opsgenie trigger failed (${res.status}): ${text}`);
    }

    this.logger.warn(`Opsgenie alert triggered: ${payload.dedupKey}`);
  }

  private async opsgenieResolve(dedupKey: string): Promise<void> {
    const encoded = encodeURIComponent(dedupKey);
    const res = await fetch(`${this.opsgenieApiUrl}/${encoded}/close?identifierType=alias`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `GenieKey ${this.opsgenieApiKey}`,
      },
      body: JSON.stringify({ source: 'tikka-oracle' }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Opsgenie resolve failed (${res.status}): ${text}`);
    }

    this.logger.log(`Opsgenie alert resolved: ${dedupKey}`);
  }

  // ── Generic webhook (Slack-compatible) ──────────────────────────────────────

  private async webhookTrigger(payload: AlertPayload): Promise<void> {
    const fields = Object.entries(payload.context ?? {}).map(([title, value]) => ({
      title,
      value: String(value),
      short: true,
    }));

    const body = {
      text: `[${payload.severity.toUpperCase()}] ${payload.summary}`,
      attachments: [
        {
          color: payload.severity === 'critical' ? '#e01e5a' : '#ecb22e',
          fields,
          text: payload.details,
          footer: 'tikka-oracle',
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    };

    const res = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Alert webhook POST failed (${res.status}): ${text}`);
    }

    this.logger.warn(`Alert webhook posted: ${payload.dedupKey}`);
  }

  private async webhookResolve(dedupKey: string): Promise<void> {
    const body = {
      text: `[RESOLVED] ${dedupKey}`,
      attachments: [
        {
          color: '#2eb886',
          footer: 'tikka-oracle',
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    };

    const res = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Alert-resolved webhook POST failed (${res.status}): ${text}`);
    }

    this.logger.log(`Alert-resolved webhook posted: ${dedupKey}`);
  }
}
