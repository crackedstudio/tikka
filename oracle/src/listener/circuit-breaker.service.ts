import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CircuitState } from './circuit-breaker.types';
import { HealthService } from '../health/health.service';

export { CircuitState };

export interface CircuitBreakerConfig {
  failureThreshold: number; // ORACLE_CB_FAILURE_THRESHOLD
  resetTimeoutMs: number;   // ORACLE_CB_RESET_TIMEOUT_MS
}

const DEFAULT_FAILURE_THRESHOLD = 5;
const DEFAULT_RESET_TIMEOUT_MS = 60_000;

function parsePositiveInt(raw: string | undefined, varName: string, logger: Logger, defaultValue: number): number {
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

@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);

  private state: CircuitState = 'closed';
  private consecutiveFailures = 0;
  private openedAt: number | null = null;
  private probeAllowed = false;
  private readonly config: CircuitBreakerConfig;
  private readonly nowFn: () => number;

  constructor(
    private readonly configService: ConfigService,
    private readonly healthService: HealthService,
    nowFn?: () => number,
  ) {
    this.nowFn = nowFn ?? Date.now;

    const rawThreshold = this.configService.get<string>('ORACLE_CB_FAILURE_THRESHOLD');
    const rawTimeout = this.configService.get<string>('ORACLE_CB_RESET_TIMEOUT_MS');

    this.config = {
      failureThreshold: parsePositiveInt(rawThreshold, 'ORACLE_CB_FAILURE_THRESHOLD', this.logger, DEFAULT_FAILURE_THRESHOLD),
      resetTimeoutMs: parsePositiveInt(rawTimeout, 'ORACLE_CB_RESET_TIMEOUT_MS', this.logger, DEFAULT_RESET_TIMEOUT_MS),
    };
  }

  /**
   * Returns true if a connection attempt is permitted.
   * Handles open → half-open transition when the reset timeout has elapsed.
   */
  canAttempt(): boolean {
    if (this.state === 'closed') {
      return true;
    }

    if (this.state === 'open') {
      const elapsed = this.nowFn() - (this.openedAt ?? 0);
      if (elapsed >= this.config.resetTimeoutMs) {
        // Transition to half-open and allow the first probe
        this.state = 'half-open';
        this.probeAllowed = true;
        this.logger.log(
          `Circuit transitioned open → half-open. Allowing probe attempt.`,
        );
        // Consume the probe slot
        this.probeAllowed = false;
        return true;
      }

      const remaining = this.config.resetTimeoutMs - elapsed;
      this.logger.debug(
        `Circuit is open. Attempt suppressed. Remaining cooldown: ${remaining}ms.`,
      );
      return false;
    }

    // half-open
    if (this.probeAllowed) {
      this.probeAllowed = false;
      return true;
    }
    return false;
  }

  /**
   * Call after a successful SSE connection.
   * half-open → closed, or keeps closed. Resets consecutive failures.
   */
  recordSuccess(): void {
    if (this.state === 'half-open') {
      this.state = 'closed';
      this.logger.log('Circuit transitioned half-open → closed. Connection recovered.');
    }
    // closed stays closed
    this.consecutiveFailures = 0;
    this.healthService.updateCircuitState('closed');
  }

  /**
   * Call after a failed SSE connection attempt.
   * closed: increment failures, open at threshold.
   * half-open: re-open immediately.
   */
  recordFailure(): void {
    if (this.state === 'closed') {
      this.consecutiveFailures++;
      if (this.consecutiveFailures >= this.config.failureThreshold) {
        this.state = 'open';
        this.openedAt = this.nowFn();
        this.logger.warn(
          `Circuit transitioned closed → open after ${this.consecutiveFailures} consecutive failures ` +
          `(threshold: ${this.config.failureThreshold}, resetTimeout: ${this.config.resetTimeoutMs}ms).`,
        );
        this.healthService.updateCircuitState('open');
      }
      return;
    }

    if (this.state === 'half-open') {
      this.state = 'open';
      this.openedAt = this.nowFn();
      this.probeAllowed = false;
      this.logger.warn(
        `Circuit transitioned half-open → open. Probe attempt failed. Circuit re-opened.`,
      );
      this.healthService.updateCircuitState('open');
    }
  }

  /**
   * Returns milliseconds until the open circuit transitions to half-open.
   * Returns 0 if already elapsed or the circuit is not open.
   */
  getRemainingCooldownMs(): number {
    if (this.state !== 'open' || this.openedAt === null) {
      return 0;
    }
    const elapsed = this.nowFn() - this.openedAt;
    const remaining = this.config.resetTimeoutMs - elapsed;
    return remaining > 0 ? remaining : 0;
  }

  /** Returns the current circuit state. */
  getState(): CircuitState {
    return this.state;
  }
}
