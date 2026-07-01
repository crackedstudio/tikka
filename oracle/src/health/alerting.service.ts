import { OracleLoggerService } from '../logger/oracle-logger';
import { Injectable, Logger } from '@nestjs/common';

export type AlertSeverity = 'warning' | 'critical';

export interface AlertPayload {
  severity: AlertSeverity;
  summary: string;
  details?: string;
  /** Stable key used to de-duplicate and auto-resolve the same alert. */
  dedupKey: string;
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

  constructor(private readonly logger: OracleLoggerService) {
    const raw = (process.env.ALERTING_PROVIDER ?? 'none').toLowerCase();
    if (raw === 'pagerduty' || raw === 'opsgenie') {
      this.provider = raw;
    } else {
      this.provider = 'none';
    }

    this.pdRoutingKey = process.env.PAGERDUTY_ROUTING_KEY ?? '';
    this.opsgenieApiKey = process.env.OPSGENIE_API_KEY ?? '';

    if (this.provider !== 'none') {
      this.logger.log(`Alerting provider: ${this.provider}`);
    }
  }

  /** Fire (trigger) an alert. No-op when provider is "none". */
  async fire(payload: AlertPayload): Promise<void> {
    if (this.provider === 'none') return;

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

  /** Resolve a previously fired alert. No-op when provider is "none". */
  async resolve(dedupKey: string): Promise<void> {
    if (this.provider === 'none') return;

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
        custom_details: payload.details ? { details: payload.details } : undefined,
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
}
