import {
  PipelineState,
  PipelineTransition,
  PipelineStateMachine,
  nextPipelineState,
  canTransition,
} from './pipeline-state';

describe('pipeline state machine', () => {
  describe('nextPipelineState (pure transition table)', () => {
    it('starts ingestion from idle', () => {
      expect(nextPipelineState(PipelineState.IDLE, PipelineTransition.START)).toBe(
        PipelineState.POLLING,
      );
    });

    it('rejects illegal transitions with null', () => {
      expect(
        nextPipelineState(PipelineState.IDLE, PipelineTransition.DISPATCH_SUCCESS),
      ).toBeNull();
      expect(
        nextPipelineState(PipelineState.POLLING, PipelineTransition.CURSOR_UPDATED),
      ).toBeNull();
    });

    it('canTransition mirrors the table', () => {
      expect(canTransition(PipelineState.POLLING, PipelineTransition.EVENTS_RECEIVED)).toBe(
        true,
      );
      expect(canTransition(PipelineState.POLLING, PipelineTransition.STOP)).toBe(false);
    });
  });

  describe('PipelineStateMachine', () => {
    let sm: PipelineStateMachine;

    beforeEach(() => {
      sm = new PipelineStateMachine();
    });

    it('begins in the idle state', () => {
      expect(sm.current).toBe(PipelineState.IDLE);
      expect(sm.snapshot().previousState).toBeNull();
      expect(sm.snapshot().transitionCount).toBe(0);
    });

    // ── Success path ────────────────────────────────────────────────────────
    it('walks the success path: poll → parse → dispatch → cursor → poll', () => {
      sm.apply(PipelineTransition.START);
      expect(sm.current).toBe(PipelineState.POLLING);

      expect(sm.apply(PipelineTransition.EVENTS_RECEIVED)).toBe(true);
      expect(sm.current).toBe(PipelineState.PARSING);

      expect(sm.apply(PipelineTransition.PARSE_SUCCESS)).toBe(true);
      expect(sm.current).toBe(PipelineState.DISPATCHING);

      expect(sm.apply(PipelineTransition.DISPATCH_SUCCESS)).toBe(true);
      expect(sm.current).toBe(PipelineState.UPDATING_CURSOR);

      expect(sm.apply(PipelineTransition.CURSOR_UPDATED)).toBe(true);
      expect(sm.current).toBe(PipelineState.POLLING);

      expect(sm.snapshot().transitionCount).toBe(5);
    });

    // ── Parser failure path ───────────────────────────────────────────────────
    it('routes a parser failure to the dead-letter queue and back to polling', () => {
      sm.apply(PipelineTransition.START);
      sm.apply(PipelineTransition.EVENTS_RECEIVED);
      expect(sm.current).toBe(PipelineState.PARSING);

      expect(sm.apply(PipelineTransition.PARSE_FAILURE)).toBe(true);
      expect(sm.current).toBe(PipelineState.DEAD_LETTER);

      expect(sm.apply(PipelineTransition.DLQ_ENQUEUED)).toBe(true);
      expect(sm.current).toBe(PipelineState.POLLING);
    });

    // ── Handler failure path ──────────────────────────────────────────────────
    it('routes a handler failure to the dead-letter queue', () => {
      sm.apply(PipelineTransition.START);
      sm.apply(PipelineTransition.EVENTS_RECEIVED);
      sm.apply(PipelineTransition.PARSE_SUCCESS);
      expect(sm.current).toBe(PipelineState.DISPATCHING);

      expect(sm.apply(PipelineTransition.HANDLER_FAILURE)).toBe(true);
      expect(sm.current).toBe(PipelineState.DEAD_LETTER);
    });

    it('retries a dead-lettered event and recovers on success', () => {
      sm.apply(PipelineTransition.START);
      sm.apply(PipelineTransition.EVENTS_RECEIVED);
      sm.apply(PipelineTransition.PARSE_SUCCESS);
      sm.apply(PipelineTransition.HANDLER_FAILURE);
      expect(sm.current).toBe(PipelineState.DEAD_LETTER);

      expect(sm.apply(PipelineTransition.RETRY)).toBe(true);
      expect(sm.current).toBe(PipelineState.RETRYING);

      expect(sm.apply(PipelineTransition.RETRY_SUCCESS)).toBe(true);
      expect(sm.current).toBe(PipelineState.POLLING);
    });

    it('returns an exhausted retry to the dead-letter queue', () => {
      sm.apply(PipelineTransition.START);
      sm.apply(PipelineTransition.EVENTS_RECEIVED);
      sm.apply(PipelineTransition.PARSE_SUCCESS);
      sm.apply(PipelineTransition.HANDLER_FAILURE);
      sm.apply(PipelineTransition.RETRY);
      expect(sm.current).toBe(PipelineState.RETRYING);

      expect(sm.apply(PipelineTransition.RETRY_EXHAUSTED)).toBe(true);
      expect(sm.current).toBe(PipelineState.DEAD_LETTER);
    });

    // ── Reorg / rollback path ─────────────────────────────────────────────────
    it('rolls back on a detected reorg and returns to polling', () => {
      sm.apply(PipelineTransition.START);
      expect(sm.current).toBe(PipelineState.POLLING);

      expect(sm.apply(PipelineTransition.REORG_DETECTED)).toBe(true);
      expect(sm.current).toBe(PipelineState.ROLLING_BACK);

      expect(sm.apply(PipelineTransition.ROLLBACK_COMPLETE)).toBe(true);
      expect(sm.current).toBe(PipelineState.POLLING);
    });

    it('allows a reorg to interrupt dispatching', () => {
      sm.apply(PipelineTransition.START);
      sm.apply(PipelineTransition.EVENTS_RECEIVED);
      sm.apply(PipelineTransition.PARSE_SUCCESS);
      expect(sm.current).toBe(PipelineState.DISPATCHING);

      expect(sm.apply(PipelineTransition.REORG_DETECTED)).toBe(true);
      expect(sm.current).toBe(PipelineState.ROLLING_BACK);
    });

    // ── Shutdown path ─────────────────────────────────────────────────────────
    it('shuts down from a running state and stops', () => {
      sm.apply(PipelineTransition.START);
      expect(sm.current).toBe(PipelineState.POLLING);

      expect(sm.apply(PipelineTransition.SHUTDOWN)).toBe(true);
      expect(sm.current).toBe(PipelineState.SHUTTING_DOWN);

      expect(sm.apply(PipelineTransition.STOP)).toBe(true);
      expect(sm.current).toBe(PipelineState.STOPPED);
    });

    it('can shut down mid-dispatch', () => {
      sm.apply(PipelineTransition.START);
      sm.apply(PipelineTransition.EVENTS_RECEIVED);
      sm.apply(PipelineTransition.PARSE_SUCCESS);
      expect(sm.apply(PipelineTransition.SHUTDOWN)).toBe(true);
      expect(sm.current).toBe(PipelineState.SHUTTING_DOWN);
    });

    it('can restart after stopping', () => {
      sm.apply(PipelineTransition.START);
      sm.apply(PipelineTransition.SHUTDOWN);
      sm.apply(PipelineTransition.STOP);
      expect(sm.current).toBe(PipelineState.STOPPED);

      expect(sm.apply(PipelineTransition.START)).toBe(true);
      expect(sm.current).toBe(PipelineState.POLLING);
    });

    // ── Illegal transitions ───────────────────────────────────────────────────
    it('ignores illegal transitions and leaves state unchanged', () => {
      sm.apply(PipelineTransition.START);
      expect(sm.current).toBe(PipelineState.POLLING);

      // CURSOR_UPDATED is not valid from POLLING
      expect(sm.apply(PipelineTransition.CURSOR_UPDATED)).toBe(false);
      expect(sm.current).toBe(PipelineState.POLLING);
      // Rejected transitions are not counted
      expect(sm.snapshot().transitionCount).toBe(1);
    });

    // ── Snapshot for operator inspection ──────────────────────────────────────
    it('exposes a snapshot operators can inspect', () => {
      sm.apply(PipelineTransition.START);
      sm.apply(PipelineTransition.EVENTS_RECEIVED);

      const snap = sm.snapshot();
      expect(snap.state).toBe(PipelineState.PARSING);
      expect(snap.previousState).toBe(PipelineState.POLLING);
      expect(snap.lastTransition).toBe(PipelineTransition.EVENTS_RECEIVED);
      expect(snap.transitionCount).toBe(2);
      expect(snap.recent).toHaveLength(2);
      expect(snap.recent[1]).toMatchObject({
        from: PipelineState.POLLING,
        to: PipelineState.PARSING,
        transition: PipelineTransition.EVENTS_RECEIVED,
      });
      expect(typeof snap.since).toBe('string');
    });

    it('bounds the recorded history', () => {
      sm.apply(PipelineTransition.START);
      // Drive many valid success cycles to overflow the history buffer.
      for (let i = 0; i < 40; i++) {
        sm.apply(PipelineTransition.EVENTS_RECEIVED);
        sm.apply(PipelineTransition.PARSE_SUCCESS);
        sm.apply(PipelineTransition.DISPATCH_SUCCESS);
        sm.apply(PipelineTransition.CURSOR_UPDATED);
      }
      expect(sm.snapshot().recent.length).toBeLessThanOrEqual(25);
    });
  });
});
