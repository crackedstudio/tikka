/**
 * A standalone, framework-free circuit breaker.
 *
 * This is the single source of truth for circuit-breaking semantics across the
 * monorepo (SDK RPC client and the oracle's Stellar event listener). Consumers
 * wrap it in framework-specific service layers (Nest, logging, metrics, alerts)
 * rather than reimplementing the state machine.
 *
 * Design is taken from the oracle's battle-tested implementation: it supports
 * the full closed → open → half-open cycle with a single half-open probe slot
 * and injectable clock for deterministic tests.
 */

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerTransitionInfo {
  /** Consecutive failures recorded up to the transition. */
  consecutiveFailures: number;
  /** Failure threshold that trips the circuit to open. */
  threshold: number;
  /** Cooldown (ms) before an open circuit returns to half-open. */
  resetTimeoutMs: number;
}

export interface CircuitBreakerHooks {
  /**
   * Fired on every state transition (from !== to). Use for logging, health
   * status updates, alerting, Prometheus metrics — whatever the wrapper needs.
   */
  onStateChange?: (
    from: CircuitState,
    to: CircuitState,
    info: CircuitBreakerTransitionInfo,
  ) => void;
  /**
   * Fired when a request is rejected because the circuit is open and the
   * reset timeout has not yet elapsed. Receives remaining cooldown in ms.
   */
  onAttemptSuppressed?: (remainingMs: number) => void;
}

export interface CircuitBreakerOptions {
  /** Consecutive failures required to transition closed → open. */
  failureThreshold: number;
  /** Cooldown (ms) before an open circuit transitions to half-open. */
  resetTimeoutMs: number;
  /** Injectible clock, mainly for tests. Defaults to `Date.now`. */
  now?: () => number;
  /** Optional side-effect hooks (logging/metrics/alerting). */
  hooks?: CircuitBreakerHooks;
}

export class CircuitBreaker {
  failureThreshold: number;
  resetTimeoutMs: number;

  private state: CircuitState = 'closed';
  private consecutiveFailures = 0;
  private openedAt: number | null = null;
  private lastFailureAt: number | null = null;
  private probeAllowed = false;

  private readonly nowFn: () => number;
  private readonly hooks: CircuitBreakerHooks;

  constructor(options: CircuitBreakerOptions) {
    this.failureThreshold = options.failureThreshold;
    this.resetTimeoutMs = options.resetTimeoutMs;
    this.nowFn = options.now ?? Date.now;
    this.hooks = options.hooks ?? {};
  }

  /** The current circuit state (never advances time by itself). */
  getState(): CircuitState {
    return this.state;
  }

  /** The current consecutive failure count. */
  getFailureCount(): number {
    return this.consecutiveFailures;
  }

  /** Timestamp of the most recent recorded failure, or null if none. */
  getLastFailureAt(): number | null {
    return this.lastFailureAt;
  }

  /**
   * Milliseconds until an open circuit transitions to half-open.
   * Returns 0 when the circuit is not open or the timeout has elapsed.
   */
  getRemainingCooldownMs(): number {
    if (this.state !== 'open' || this.openedAt === null) {
      return 0;
    }
    const elapsed = this.nowFn() - this.openedAt;
    const remaining = this.resetTimeoutMs - elapsed;
    return remaining > 0 ? remaining : 0;
  }

  /**
   * Whether a connection attempt is permitted.
   *
   * Handles the open → half-open transition when the reset timeout has
   * elapsed, granting a single probe slot for the first half-open attempt.
   */
  canAttempt(): boolean {
    if (this.state === 'closed') {
      return true;
    }

    if (this.state === 'open') {
      const elapsed = this.nowFn() - (this.openedAt ?? 0);
      if (elapsed >= this.resetTimeoutMs) {
        // open → half-open; register the probe slot below
        this.transition('half-open');
        this.probeAllowed = true;
      } else {
        const remaining = this.resetTimeoutMs - elapsed;
        this.hooks.onAttemptSuppressed?.(remaining);
        return false;
      }
    }

    if (this.state === 'half-open') {
      if (this.probeAllowed) {
        this.probeAllowed = false;
        return true;
      }
      return false;
    }

    return false;
  }

  /**
   * Update breaker tuning at runtime without resetting the current state.
   * Only the provided values are changed.
   */
  updateConfig(next: { failureThreshold?: number; resetTimeoutMs?: number }): void {
    if (typeof next.failureThreshold === 'number' && Number.isFinite(next.failureThreshold)) {
      this.failureThreshold = next.failureThreshold;
    }
    if (typeof next.resetTimeoutMs === 'number' && Number.isFinite(next.resetTimeoutMs)) {
      this.resetTimeoutMs = next.resetTimeoutMs;
    }
  }

  /**
   * Promote open → half-open if the reset timeout has elapsed, without
   * consuming the probe slot. Useful for read-only state inspection that
   * should reflect the half-open probe window.
   */
  refresh(): void {
    if (this.state !== 'open') {
      return;
    }
    const elapsed = this.nowFn() - (this.openedAt ?? 0);
    if (elapsed >= this.resetTimeoutMs) {
      this.transition('half-open');
      this.probeAllowed = true;
    }
  }

  /**
   * Record a successful attempt. Half-open → closed on success; the failure
   * count is always reset.
   */
  recordSuccess(): void {
    if (this.state === 'half-open') {
      this.transition('closed');
    }
    this.consecutiveFailures = 0;
  }

  /**
   * Record a failed attempt.
   * - closed: increments failures, opens at the threshold
   * - half-open: re-opens immediately (failed probe)
   */
  recordFailure(): void {
    this.lastFailureAt = this.nowFn();

    if (this.state === 'closed') {
      this.consecutiveFailures++;
      if (this.consecutiveFailures >= this.failureThreshold) {
        this.openedAt = this.nowFn();
        this.transition('open');
      }
      return;
    }

    if (this.state === 'half-open') {
      this.openedAt = this.nowFn();
      this.probeAllowed = false;
      this.transition('open');
    }
  }

  private transition(to: CircuitState): void {
    const from = this.state;
    if (from === to) {
      return;
    }
    this.state = to;
    this.hooks.onStateChange?.(from, to, {
      consecutiveFailures: this.consecutiveFailures,
      threshold: this.failureThreshold,
      resetTimeoutMs: this.resetTimeoutMs,
    });
  }
}