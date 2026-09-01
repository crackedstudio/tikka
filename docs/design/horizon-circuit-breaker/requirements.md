# Requirements Document

## Introduction

The oracle's `EventListenerService` maintains a persistent SSE connection to Horizon to receive draw-request events. When Horizon is temporarily unavailable, the service retries indefinitely using exponential backoff but has no upper bound on the number of attempts and no mechanism to stop retrying after sustained failures. This floods logs, masks the root cause, and wastes resources.

This feature adds a circuit breaker to the Horizon SSE connection path. The circuit breaker tracks consecutive connection failures and, after a configurable threshold, opens the circuit to halt retry attempts for a configurable cooldown period. After the cooldown, the circuit enters a half-open state and allows a single probe attempt. A successful probe closes the circuit and resumes normal operation. The current circuit state is exposed in the existing `GET /health` endpoint.

## Glossary

- **CircuitBreaker**: The component that wraps the Horizon SSE connection attempt and enforces the open/half-open/closed state machine.
- **EventListenerService**: The NestJS service (`oracle/src/listener/event-listener.service.ts`) that connects to Horizon SSE and dispatches contract events.
- **HealthService**: The NestJS service (`oracle/src/health/health.service.ts`) that aggregates runtime metrics and serves the `GET /health` response.
- **Circuit State**: One of three values — `closed` (normal operation), `open` (retries halted), or `half-open` (single probe allowed).
- **Failure Threshold**: The number of consecutive SSE connection failures that causes the circuit to transition from `closed` to `open`. Configurable via `ORACLE_CB_FAILURE_THRESHOLD` (default: 5).
- **Reset Timeout**: The duration in milliseconds the circuit remains `open` before transitioning to `half-open`. Configurable via `ORACLE_CB_RESET_TIMEOUT_MS` (default: 60 000 ms).
- **Probe Attempt**: The single SSE connection attempt made while the circuit is in `half-open` state.
- **Consecutive Failure Count**: The running count of SSE connection failures that have not been interrupted by a success. Reset to zero on any successful connection.

## Requirements

### Requirement 1: Circuit State Machine

**User Story:** As an operator, I want the oracle to stop hammering Horizon after repeated failures, so that logs stay clean and the underlying outage is clearly surfaced.

#### Acceptance Criteria

1. THE CircuitBreaker SHALL maintain a Circuit State that is exactly one of `closed`, `open`, or `half-open` at all times.
2. WHEN the EventListenerService starts, THE CircuitBreaker SHALL initialise Circuit State to `closed` and Consecutive Failure Count to zero.
3. WHEN a Horizon SSE connection attempt succeeds while Circuit State is `closed`, THE CircuitBreaker SHALL keep Circuit State as `closed` and reset Consecutive Failure Count to zero.
4. WHEN a Horizon SSE connection attempt fails while Circuit State is `closed`, THE CircuitBreaker SHALL increment Consecutive Failure Count by one.
5. WHEN Consecutive Failure Count reaches the Failure Threshold while Circuit State is `closed`, THE CircuitBreaker SHALL transition Circuit State to `open` and record the timestamp of the transition.
6. WHEN Circuit State is `open` and the elapsed time since the transition timestamp is less than Reset Timeout, THE CircuitBreaker SHALL not initiate any Horizon SSE connection attempt.
7. WHEN Circuit State is `open` and the elapsed time since the transition timestamp equals or exceeds Reset Timeout, THE CircuitBreaker SHALL transition Circuit State to `half-open`.
8. WHEN Circuit State is `half-open`, THE CircuitBreaker SHALL allow exactly one Probe Attempt.
9. WHEN the Probe Attempt succeeds while Circuit State is `half-open`, THE CircuitBreaker SHALL transition Circuit State to `closed` and reset Consecutive Failure Count to zero.
10. WHEN the Probe Attempt fails while Circuit State is `half-open`, THE CircuitBreaker SHALL transition Circuit State to `open` and record a new transition timestamp.

---

### Requirement 2: Configuration

**User Story:** As an operator, I want to tune the circuit breaker thresholds via environment variables, so that I can adapt the behaviour to different deployment environments without code changes.

#### Acceptance Criteria

1. THE CircuitBreaker SHALL read the Failure Threshold from the environment variable `ORACLE_CB_FAILURE_THRESHOLD`.
2. IF `ORACLE_CB_FAILURE_THRESHOLD` is not set, THEN THE CircuitBreaker SHALL use a default Failure Threshold of 5.
3. THE CircuitBreaker SHALL read the Reset Timeout from the environment variable `ORACLE_CB_RESET_TIMEOUT_MS`.
4. IF `ORACLE_CB_RESET_TIMEOUT_MS` is not set, THEN THE CircuitBreaker SHALL use a default Reset Timeout of 60 000 ms.
5. IF `ORACLE_CB_FAILURE_THRESHOLD` is set to a value that is not a positive integer, THEN THE EventListenerService SHALL log a warning and use the default Failure Threshold of 5.
6. IF `ORACLE_CB_RESET_TIMEOUT_MS` is set to a value that is not a positive integer, THEN THE EventListenerService SHALL log a warning and use the default Reset Timeout of 60 000 ms.

---

### Requirement 3: Health Endpoint Exposure

**User Story:** As an operator, I want the circuit state visible in `GET /health`, so that I can monitor the oracle's connection health without inspecting logs.

#### Acceptance Criteria

1. THE HealthService SHALL expose a `circuitState` field in the health metrics payload with a value of `closed`, `open`, or `half-open`.
2. WHEN Circuit State changes, THE CircuitBreaker SHALL notify the HealthService of the new Circuit State within the same synchronous call that performs the transition.
3. WHEN `GET /health` is called, THE HealthService SHALL return the most recently recorded `circuitState` value.
4. IF the CircuitBreaker has not yet reported a state to the HealthService, THEN THE HealthService SHALL return `circuitState` as `closed`.

---

### Requirement 4: Logging

**User Story:** As an operator, I want clear log messages for every circuit state transition, so that I can diagnose Horizon outages from log output alone.

#### Acceptance Criteria

1. WHEN Circuit State transitions from `closed` to `open`, THE CircuitBreaker SHALL emit a `warn`-level log message that includes the Failure Threshold value and the Reset Timeout value.
2. WHEN Circuit State transitions from `open` to `half-open`, THE CircuitBreaker SHALL emit an `log`-level log message indicating that a Probe Attempt is about to be made.
3. WHEN Circuit State transitions from `half-open` to `closed`, THE CircuitBreaker SHALL emit a `log`-level log message indicating that the circuit has recovered.
4. WHEN Circuit State transitions from `half-open` to `open`, THE CircuitBreaker SHALL emit a `warn`-level log message indicating that the Probe Attempt failed and the circuit has re-opened.
5. WHEN Circuit State is `open` and a connection attempt is suppressed, THE CircuitBreaker SHALL emit a `debug`-level log message indicating that the attempt was skipped and the remaining cooldown duration in milliseconds.

---

### Requirement 5: Integration with EventListenerService

**User Story:** As a developer, I want the circuit breaker integrated into the existing reconnect flow, so that the existing retry logic is gated by the circuit state without requiring a full rewrite.

#### Acceptance Criteria

1. THE EventListenerService SHALL consult the CircuitBreaker before each Horizon SSE connection attempt.
2. WHEN the CircuitBreaker permits a connection attempt, THE EventListenerService SHALL proceed with the existing SSE connection logic unchanged.
3. WHEN the CircuitBreaker blocks a connection attempt, THE EventListenerService SHALL not call the Horizon SSE API and SHALL schedule no further reconnect timer until the Reset Timeout elapses.
4. WHEN a connection attempt is blocked by the CircuitBreaker, THE EventListenerService SHALL update the HealthService stream status to `disconnected`.
5. THE EventListenerService SHALL report a successful SSE connection to the CircuitBreaker by calling the CircuitBreaker's success callback.
6. THE EventListenerService SHALL report a failed SSE connection to the CircuitBreaker by calling the CircuitBreaker's failure callback.
