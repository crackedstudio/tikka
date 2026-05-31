import { Injectable, Logger } from "@nestjs/common";

/**
 * Explicit states of the ledger ingestion pipeline.
 *
 * The pipeline moves through these states as it polls Horizon, parses raw
 * ledger events, dispatches them to handlers, advances its cursor, and deals
 * with failures (DLQ), chain reorganisations (rollback) and shutdown.
 *
 * `POLLING` is the resting/active state: the pipeline returns here after every
 * completed unit of work and waits for the next batch of ledger events.
 */
export enum PipelineState {
  /** Process constructed but ingestion has not started yet. */
  IDLE = "idle",
  /** Listening for / fetching ledger events from Horizon (resting state). */
  POLLING = "polling",
  /** Decoding raw ledger events into domain events. */
  PARSING = "parsing",
  /** Applying parsed events to handlers/processors. */
  DISPATCHING = "dispatching",
  /** Persisting the new cursor position after a successful batch. */
  UPDATING_CURSOR = "updating_cursor",
  /** A failed event has been routed to the dead-letter queue. */
  DEAD_LETTER = "dead_letter",
  /** Replaying / retrying a previously dead-lettered event. */
  RETRYING = "retrying",
  /** A reorg was detected and indexed state is being rolled back. */
  ROLLING_BACK = "rolling_back",
  /** Graceful shutdown in progress (draining buffers). */
  SHUTTING_DOWN = "shutting_down",
  /** Pipeline has stopped. */
  STOPPED = "stopped",
}

/**
 * Events that drive transitions between pipeline states.
 *
 * Grouped by the concern they model:
 *  - success path: EVENTS_RECEIVED → PARSE_SUCCESS → DISPATCH_SUCCESS → CURSOR_UPDATED
 *  - retry path:   RETRY / RETRY_SUCCESS / RETRY_EXHAUSTED
 *  - DLQ path:     PARSE_FAILURE / HANDLER_FAILURE → DLQ_ENQUEUED
 *  - rollback:     REORG_DETECTED → ROLLBACK_COMPLETE
 *  - shutdown:     SHUTDOWN → STOP
 */
export enum PipelineTransition {
  /** Begin (or resume) ingestion. */
  START = "start",
  /** A new batch of raw ledger events arrived and is being parsed. */
  EVENTS_RECEIVED = "events_received",
  /** Raw events decoded successfully into domain events. */
  PARSE_SUCCESS = "parse_success",
  /** Raw events could not be decoded. */
  PARSE_FAILURE = "parse_failure",
  /** Domain events applied to handlers successfully. */
  DISPATCH_SUCCESS = "dispatch_success",
  /** A handler failed while applying a domain event. */
  HANDLER_FAILURE = "handler_failure",
  /** Cursor advanced and persisted after a completed batch. */
  CURSOR_UPDATED = "cursor_updated",
  /** A failed event was written to the dead-letter queue. */
  DLQ_ENQUEUED = "dlq_enqueued",
  /** A dead-lettered event is being replayed. */
  RETRY = "retry",
  /** A replayed event succeeded. */
  RETRY_SUCCESS = "retry_success",
  /** A replayed event exhausted its retries and returns to the DLQ. */
  RETRY_EXHAUSTED = "retry_exhausted",
  /** A chain reorganisation was detected. */
  REORG_DETECTED = "reorg_detected",
  /** Rollback of reorged ledgers finished. */
  ROLLBACK_COMPLETE = "rollback_complete",
  /** Graceful shutdown requested. */
  SHUTDOWN = "shutdown",
  /** Shutdown finished; pipeline stopped. */
  STOP = "stop",
}

/**
 * Transition table — the single source of truth for the pipeline state machine.
 *
 * For each state it maps the transitions that are legal from that state to the
 * resulting state. A `(state, transition)` pair that is absent from the table
 * is an illegal transition and is rejected.
 */
export const PIPELINE_TRANSITIONS: Readonly<
  Record<PipelineState, Partial<Record<PipelineTransition, PipelineState>>>
> = {
  [PipelineState.IDLE]: {
    [PipelineTransition.START]: PipelineState.POLLING,
    [PipelineTransition.SHUTDOWN]: PipelineState.SHUTTING_DOWN,
  },
  [PipelineState.POLLING]: {
    [PipelineTransition.EVENTS_RECEIVED]: PipelineState.PARSING,
    [PipelineTransition.REORG_DETECTED]: PipelineState.ROLLING_BACK,
    [PipelineTransition.SHUTDOWN]: PipelineState.SHUTTING_DOWN,
  },
  [PipelineState.PARSING]: {
    [PipelineTransition.PARSE_SUCCESS]: PipelineState.DISPATCHING,
    [PipelineTransition.PARSE_FAILURE]: PipelineState.DEAD_LETTER,
    [PipelineTransition.REORG_DETECTED]: PipelineState.ROLLING_BACK,
    [PipelineTransition.SHUTDOWN]: PipelineState.SHUTTING_DOWN,
  },
  [PipelineState.DISPATCHING]: {
    [PipelineTransition.DISPATCH_SUCCESS]: PipelineState.UPDATING_CURSOR,
    [PipelineTransition.HANDLER_FAILURE]: PipelineState.DEAD_LETTER,
    [PipelineTransition.REORG_DETECTED]: PipelineState.ROLLING_BACK,
    [PipelineTransition.SHUTDOWN]: PipelineState.SHUTTING_DOWN,
  },
  [PipelineState.UPDATING_CURSOR]: {
    [PipelineTransition.CURSOR_UPDATED]: PipelineState.POLLING,
    [PipelineTransition.REORG_DETECTED]: PipelineState.ROLLING_BACK,
    [PipelineTransition.SHUTDOWN]: PipelineState.SHUTTING_DOWN,
  },
  [PipelineState.DEAD_LETTER]: {
    [PipelineTransition.DLQ_ENQUEUED]: PipelineState.POLLING,
    [PipelineTransition.RETRY]: PipelineState.RETRYING,
    [PipelineTransition.SHUTDOWN]: PipelineState.SHUTTING_DOWN,
  },
  [PipelineState.RETRYING]: {
    [PipelineTransition.RETRY_SUCCESS]: PipelineState.POLLING,
    [PipelineTransition.RETRY_EXHAUSTED]: PipelineState.DEAD_LETTER,
    [PipelineTransition.HANDLER_FAILURE]: PipelineState.DEAD_LETTER,
    [PipelineTransition.SHUTDOWN]: PipelineState.SHUTTING_DOWN,
  },
  [PipelineState.ROLLING_BACK]: {
    [PipelineTransition.ROLLBACK_COMPLETE]: PipelineState.POLLING,
    [PipelineTransition.SHUTDOWN]: PipelineState.SHUTTING_DOWN,
  },
  [PipelineState.SHUTTING_DOWN]: {
    [PipelineTransition.STOP]: PipelineState.STOPPED,
  },
  [PipelineState.STOPPED]: {
    [PipelineTransition.START]: PipelineState.POLLING,
  },
};

/**
 * Returns the state reached by applying `transition` from `from`, or `null`
 * when the transition is illegal. Pure — has no side effects.
 */
export function nextPipelineState(
  from: PipelineState,
  transition: PipelineTransition,
): PipelineState | null {
  return PIPELINE_TRANSITIONS[from][transition] ?? null;
}

/** True when `transition` is legal from `from`. */
export function canTransition(
  from: PipelineState,
  transition: PipelineTransition,
): boolean {
  return nextPipelineState(from, transition) !== null;
}

/** A single recorded transition, kept for operator inspection. */
export interface PipelineTransitionRecord {
  from: PipelineState;
  to: PipelineState;
  transition: PipelineTransition;
  at: string;
}

/** Operator-facing snapshot of the pipeline state machine. */
export interface PipelineStateSnapshot {
  state: PipelineState;
  previousState: PipelineState | null;
  lastTransition: PipelineTransition | null;
  since: string;
  transitionCount: number;
  recent: PipelineTransitionRecord[];
}

const HISTORY_LIMIT = 25;

/**
 * Tracks the live state of the ingestion pipeline.
 *
 * Services in the ingestion pipeline (ledger poller, ingestion dispatcher,
 * cursor manager, DLQ) call {@link apply} to report progress. Illegal
 * transitions are rejected (logged at debug) and leave the state unchanged so
 * that out-of-order or racy reports from a concurrent, buffered pipeline can
 * never corrupt the recorded state. Operators read {@link snapshot} via the
 * health endpoint.
 */
@Injectable()
export class PipelineStateMachine {
  private readonly logger = new Logger(PipelineStateMachine.name);

  private state: PipelineState = PipelineState.IDLE;
  private previousState: PipelineState | null = null;
  private lastTransition: PipelineTransition | null = null;
  private since: number = Date.now();
  private transitionCount = 0;
  private readonly history: PipelineTransitionRecord[] = [];

  /** The current pipeline state. */
  get current(): PipelineState {
    return this.state;
  }

  /**
   * Applies a transition. Returns `true` when the transition was legal and the
   * state advanced, `false` when it was illegal (state unchanged).
   */
  apply(transition: PipelineTransition): boolean {
    const target = nextPipelineState(this.state, transition);

    if (target === null) {
      this.logger.debug(
        `Ignoring illegal transition '${transition}' from state '${this.state}'`,
      );
      return false;
    }

    const record: PipelineTransitionRecord = {
      from: this.state,
      to: target,
      transition,
      at: new Date().toISOString(),
    };

    this.previousState = this.state;
    this.state = target;
    this.lastTransition = transition;
    this.since = Date.now();
    this.transitionCount += 1;

    this.history.push(record);
    if (this.history.length > HISTORY_LIMIT) {
      this.history.shift();
    }

    this.logger.debug(
      `Pipeline ${record.from} -> ${record.to} (${transition})`,
    );
    return true;
  }

  /** Operator-facing snapshot of the current pipeline state. */
  snapshot(): PipelineStateSnapshot {
    return {
      state: this.state,
      previousState: this.previousState,
      lastTransition: this.lastTransition,
      since: new Date(this.since).toISOString(),
      transitionCount: this.transitionCount,
      recent: [...this.history],
    };
  }
}
