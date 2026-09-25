import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CircuitBreaker } from '@tikka/sdk/network';
import { OracleLoggerService } from '../logger/oracle-logger';
import { HealthService } from '../health/health.service';
import { AlertingService } from '../health/alerting.service';
import { CircuitState } from './circuit-breaker.types';

export { CircuitState };

const CIRCUIT_BREAKER_ALERT_DEDUP_KEY = 'circuit-breaker-open';

export interface CircuitBreakerConfig {
  failureThreshold: number; // ORACLE_CB_FAILURE_THRESHOLD
  resetTimeoutMs: number;   // ORACLE_CB_RESET_TIMEOUT_MS
}

const DEFAULT_FAILURE_THRESHOLD = 5;
const DEFAULT_RESET_TIMEOUT_MS = 60_000;

function parsePositiveInt(raw: string | undefined, varName: string, logger: OracleLoggerService, defaultValue: number): number {
  if (raw === undefined || raw === null || raw === '') {
    return defaultValue;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    logger.warn(
      `${varName} has invalid value "${raw}" (must be a positive integer). Falling back to default: ${defaultValue}.`,
    );
    return defaultValue;
  }
  return parsed;
}

/**
 * Thin Nest wrapper around the shared, framework-free {@link CircuitBreaker}
 * from the SDK core. It owns nothing but the Nest/Prometheus concerns:
 * config parsing, logging, health status and alerting. The state machine itself
 * ("one implementation") lives in the SDK and is shared with the RPC client.
 */
@Injectable()
export class CircuitBreakerService {
  private readonly breaker: CircuitBreaker;
  private readonly config: CircuitBreakerConfig;

  constructor(
    private readonly logger: OracleLoggerService,
    private readonly configService: ConfigService,
    private readonly healthService: HealthService,
    private readonly alertingService: AlertingService,
    nowFn?: () => number,
  ) {
    const rawThreshold = this.configService.get<string>('ORACLE_CB_FAILURE_THRESHOLD');
    const rawTimeout = this.configService.get<string>('ORACLE_CB_RESET_TIMEOUT_MS');

    this.config = {
      failureThreshold: parsePositiveInt(rawThreshold, 'ORACLE_CB_FAILURE_THRESHOLD', this.logger, DEFAULT_FAILURE_THRESHOLD),
      resetTimeoutMs: parsePositiveInt(rawTimeout, 'ORACLE_CB_RESET_TIMEOUT_MS', this.logger, DEFAULT_RESET_TIMEOUT_MS),
    };

    this.breaker = new CircuitBreaker({
      failureThreshold: this.config.failureThreshold,
      resetTimeoutMs: this.config.resetTimeoutMs,
      now: nowFn ?? Date.now,
      hooks: {
        onStateChange: (from, to, info) => this.onTransition(from, to, info),
        onAttemptSuppressed: (remainingMs) =>
          this.logger.debug(
            `Circuit is open. Attempt suppressed. Remaining cooldown: ${remainingMs}ms.`,
          ),
      },
    });
  }

  /**
   * Returns true if a connection attempt is permitted.
   * Handles open → half-open transition when the reset timeout has elapsed.
   */
  canAttempt(): boolean {
    return this.breaker.canAttempt();
  }

  /**
   * Call after a successful SSE connection.
   * half-open → closed, or keeps closed. Resets consecutive failures.
   */
  recordSuccess(): void {
    this.breaker.recordSuccess();
    // Matches the previous behaviour: closed state health is refreshed on success.
    this.healthService.updateCircuitState('closed');
  }

  /**
   * Call after a failed SSE connection attempt.
   * closed: increment failures, open at threshold.
   * half-open: re-open immediately (failed probe).
   */
  recordFailure(): void {
    this.breaker.recordFailure();
  }

  private onTransition(
    from: CircuitState,
    to: CircuitState,
    info: { consecutiveFailures: number; threshold: number; resetTimeoutMs: number },
  ): void {
    if (from === 'closed' && to === 'open') {
      this.logger.warn(
        `Circuit transitioned closed → open after ${info.consecutiveFailures} consecutive failures ` +
        `(threshold: ${info.threshold}, resetTimeout: ${info.resetTimeoutMs}ms).`,
      );
      this.healthService.updateCircuitState('open');
      this.fireCircuitOpenAlert(
        `Circuit breaker OPEN after ${info.consecutiveFailures} consecutive failures`,
      );
      return;
    }

    if (from === 'open' && to === 'half-open') {
      this.logger.log('Circuit transitioned open → half-open. Allowing probe attempt.');
      return;
    }

    if (from === 'half-open' && to === 'closed') {
      this.logger.log('Circuit transitioned half-open → closed. Connection recovered.');
      void this.alertingService.resolve(CIRCUIT_BREAKER_ALERT_DEDUP_KEY);
      return;
    }

    if (from === 'half-open' && to === 'open') {
      this.logger.warn('Circuit transitioned half-open → open. Probe attempt failed. Circuit re-opened.');
      this.healthService.updateCircuitState('open');
      this.fireCircuitOpenAlert('Circuit breaker re-OPENED after failed half-open probe');
    }
  }

  private fireCircuitOpenAlert(summary: string): void {
    void this.alertingService.fire({
      severity: 'critical',
      summary,
      details:
        `threshold=${this.config.failureThreshold}, resetTimeoutMs=${this.config.resetTimeoutMs}, ` +
        `consecutiveFailures=${this.breaker.getFailureCount()}`,
      dedupKey: CIRCUIT_BREAKER_ALERT_DEDUP_KEY,
      context: {
        oracle_id: process.env.LOCAL_ORACLE_ID || 'oracle-001',
      },
    });
  }

  /** Returns milliseconds until the open circuit transitions to half-open.
   * Returns 0 if already elapsed or the circuit is not open.
   */
  getRemainingCooldownMs(): number {
    return this.breaker.getRemainingCooldownMs();
  }

  /** Returns the current circuit state. */
  getState(): CircuitState {
    return this.breaker.getState();
  }

  /** Returns the current consecutive failure count. */
  getFailureCount(): number {
    return this.breaker.getFailureCount();
  }

  /** Returns the timestamp of when the circuit last failed, or null if never. */
  getLastFailureAt(): number | null {
    return this.breaker.getLastFailureAt();
  }
}