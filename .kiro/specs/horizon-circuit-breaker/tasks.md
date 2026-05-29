# Implementation Plan: Horizon Circuit Breaker

## Overview

Implement a `CircuitBreakerService` that wraps the Horizon SSE connection path in `EventListenerService`, enforcing a closed → open → half-open → closed state machine. Extend `HealthService` to expose `circuitState`, and wire everything together through `ListenerModule`.

## Tasks

- [x] 1. Extend `HealthService` with circuit state support
  - Add `circuitState: CircuitState` field to the `HealthMetrics` interface in `oracle/src/health/health.service.ts`
  - Add a private `circuitState` field defaulting to `'closed'`
  - Implement `updateCircuitState(state: CircuitState): void` method that stores the new state
  - Update `getMetrics()` to include `circuitState` in the returned object
  - Import the `CircuitState` type (define it in a shared types file or inline as a union type for now)
  - _Requirements: 3.1, 3.3, 3.4_

- [x] 2. Implement `CircuitBreakerService`
  - [x] 2.1 Create `oracle/src/listener/circuit-breaker.service.ts`
    - Define and export `CircuitState = 'closed' | 'open' | 'half-open'` and `CircuitBreakerConfig` interface
    - Implement `@Injectable() CircuitBreakerService` with internal state: `state`, `consecutiveFailures`, `openedAt`, `config`
    - Read `ORACLE_CB_FAILURE_THRESHOLD` and `ORACLE_CB_RESET_TIMEOUT_MS` from `ConfigService` in the constructor; validate each as a positive integer, log a `warn` and fall back to defaults (`5` / `60000`) if invalid
    - Implement `canAttempt(): boolean` — returns `true` when `closed`; checks elapsed time and transitions to `half-open` when `open` and timeout has elapsed (emitting a log message), then returns `true` for the first probe call and `false` for subsequent calls before an outcome is recorded; emits a `debug` log with remaining cooldown when returning `false` while `open`
    - Implement `recordSuccess(): void` — transitions `half-open → closed` (log) or keeps `closed`; resets `consecutiveFailures` to zero; calls `healthService.updateCircuitState('closed')`
    - Implement `recordFailure(): void` — increments `consecutiveFailures` when `closed`; transitions `closed → open` when threshold reached (warn log); transitions `half-open → open` (warn log); records new `openedAt`; calls `healthService.updateCircuitState` with the new state
    - Implement `getRemainingCooldownMs(): number` — returns milliseconds until the open circuit transitions to half-open (0 if already elapsed)
    - _Requirements: 1.1–1.10, 2.1–2.6, 3.2, 4.1–4.5_

  - [ ]* 2.2 Write property test for `CircuitBreakerService` — Property 1: Closed circuit permits attempts and resets on success
    - **Property 1: Closed circuit permits attempts and resets on success**
    - **Validates: Requirements 1.3**

  - [ ]* 2.3 Write property test for `CircuitBreakerService` — Property 2: Failure accumulation opens the circuit at threshold
    - **Property 2: Failure accumulation opens the circuit at threshold**
    - **Validates: Requirements 1.4, 1.5, 1.6**

  - [ ]* 2.4 Write property test for `CircuitBreakerService` — Property 3: Open circuit blocks all attempts until timeout elapses
    - **Property 3: Open circuit blocks all attempts until timeout elapses**
    - **Validates: Requirements 1.6**

  - [ ]* 2.5 Write property test for `CircuitBreakerService` — Property 4: Half-open allows exactly one probe then re-evaluates
    - **Property 4: Half-open allows exactly one probe then re-evaluates**
    - **Validates: Requirements 1.7, 1.8**

  - [ ]* 2.6 Write property test for `CircuitBreakerService` — Property 5: Successful probe closes the circuit
    - **Property 5: Successful probe closes the circuit**
    - **Validates: Requirements 1.9**

  - [ ]* 2.7 Write property test for `CircuitBreakerService` — Property 6: Failed probe re-opens the circuit with a fresh timestamp
    - **Property 6: Failed probe re-opens the circuit with a fresh timestamp**
    - **Validates: Requirements 1.10**

  - [ ]* 2.8 Write property test for `CircuitBreakerService` — Property 7: Invalid env-var values fall back to defaults
    - **Property 7: Invalid env-var values fall back to defaults**
    - **Validates: Requirements 2.5, 2.6**

  - [ ]* 2.9 Write property test for `CircuitBreakerService` — Property 8: Health service always reflects the latest circuit state
    - **Property 8: Health service always reflects the latest circuit state**
    - **Validates: Requirements 3.1, 3.2, 3.3**

  - [ ]* 2.10 Write unit tests for `CircuitBreakerService`
    - Cover all state-machine edges (closed→open, open→half-open, half-open→closed, half-open→open)
    - Cover config parsing: valid values, missing values, zero, negative, non-numeric strings
    - Verify `warn`/`log`/`debug` log calls at each transition using Jest spies
    - _Requirements: 1.1–1.10, 2.1–2.6, 4.1–4.5_

- [x] 3. Checkpoint — Ensure all `CircuitBreakerService` tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Integrate `CircuitBreakerService` into `EventListenerService`
  - [x] 4.1 Inject `CircuitBreakerService` into `EventListenerService`
    - Add `CircuitBreakerService` as a constructor parameter in `oracle/src/listener/event-listener.service.ts`
    - _Requirements: 5.1_

  - [x] 4.2 Gate `startListening()` with `canAttempt()`
    - At the top of `startListening()`, call `this.circuitBreaker.canAttempt()`
    - If it returns `false`, call `this.healthService.updateStreamStatus('disconnected')`, schedule a retry using `getRemainingCooldownMs()` (falling back to `INITIAL_RETRY_DELAY` if zero), and return early without calling the Horizon SSE API
    - _Requirements: 5.1, 5.3, 5.4_

  - [x] 4.3 Call `recordSuccess()` on successful stream open
    - After the SSE stream is successfully opened (inside the `try` block of `startListening()`, after `this.closeStream` is assigned), call `this.circuitBreaker.recordSuccess()`
    - _Requirements: 5.5_

  - [x] 4.4 Call `recordFailure()` on stream errors
    - In `handleStreamError()`, call `this.circuitBreaker.recordFailure()` before `scheduleReconnect()`
    - In the `catch` block of `startListening()`, call `this.circuitBreaker.recordFailure()` before `scheduleReconnect()`
    - _Requirements: 5.6_

  - [ ]* 2.11 Write unit tests for `EventListenerService` circuit breaker integration
    - Mock `CircuitBreakerService`; verify `canAttempt()` is called before each SSE attempt
    - Verify `recordSuccess()` is called when stream opens
    - Verify `recordFailure()` is called in both error paths
    - Verify `healthService.updateStreamStatus('disconnected')` is called when circuit is open
    - _Requirements: 5.1–5.6_

- [x] 5. Register `CircuitBreakerService` in `ListenerModule`
  - Add `CircuitBreakerService` to the `providers` array in `oracle/src/listener/listener.module.ts`
  - Add `CircuitBreakerService` to the `exports` array
  - _Requirements: 5.1_

- [x] 6. Add environment variable declarations to env schema
  - Add `ORACLE_CB_FAILURE_THRESHOLD` and `ORACLE_CB_RESET_TIMEOUT_MS` to `oracle/src/config/env.schema.ts` (or equivalent config file) as optional string fields
  - Update `.env.example` in the oracle package with the two new variables and their defaults
  - _Requirements: 2.1–2.4_

- [x] 7. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- `fast-check` is already present in `devDependencies` — no new dependencies needed
- Property tests should use the tag format: `// Feature: horizon-circuit-breaker, Property N: <property text>`
- `Date.now()` should be injectable/mockable in `CircuitBreakerService` for deterministic property tests (pass a `nowFn: () => number` parameter or use Jest's fake timers)
