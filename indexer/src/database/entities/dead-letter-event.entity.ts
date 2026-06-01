import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** Failure-reason categories persisted on every DLQ entry. */
export enum DlqReason {
  /** Event payload could not be parsed into a known schema. */
  PARSE_ERROR = 'PARSE_ERROR',
  /** Domain handler threw a non-transient business-logic error. */
  HANDLER_ERROR = 'HANDLER_ERROR',
  /** Database write failed with a transient error (connection drop, timeout). */
  DB_TRANSIENT = 'DB_TRANSIENT',
  /** Schema version in the event is not supported by this indexer build. */
  SCHEMA_UNSUPPORTED = 'SCHEMA_UNSUPPORTED',
}

/**
 * Dead-letter queue for events that failed to process.
 * Stores failed events with retry and replay support.
 *
 * ## Field Ownership
 * - **Raw chain state**: ledger, contractId, eventType, rawPayload
 * - **Derived**: id (UUID), errorMessage, reason, retryable, retryCount,
 *   replayedAt (idempotency guard), createdAt, lastAttemptAt
 *
 * ## Updater Handlers
 * - Exception handlers (in processors): Insert failed events into DLQ
 * - Replay handler: Retries events, increments retryCount, sets replayedAt
 *
 * ## Recalculation Safety
 * - ❌ Unsafe: Do NOT recalculate — operational log
 * - Entries should be replayed or manually resolved, not recalculated
 *
 * ## Idempotency
 * - `replayedAt` acts as idempotency guard — non-null means successfully replayed
 *
 * See: `ENTITY_OWNERSHIP.md` for full documentation
 */

@Entity('dead_letter_events')
@Index('idx_dle_retry_count', ['retryCount'])
@Index('idx_dle_reason', ['reason'])
@Index('idx_dle_ledger', ['ledger'])
@Index('idx_dle_replayed_at', ['replayedAt'])
export class DeadLetterEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /**
   * RAW CHAIN STATE: Ledger sequence in which the event was emitted.
   */
  @Column({ type: 'integer' })
  ledger!: number;

  /**
   * RAW CHAIN STATE: Contract ID that emitted the event (nullable for non-contract events).
   */
  @Column({ type: 'varchar', length: 128, name: 'contract_id', nullable: true })
  contractId!: string | null;

  /**
   * RAW CHAIN STATE: Event type name from the failed event payload.
   */
  @Column({ type: 'varchar', length: 64, name: 'event_type' })
  eventType!: string;

  /**
   * RAW CHAIN STATE: Full decoded event payload stored as JSONB.
   */
  @Column({ type: 'jsonb', name: 'raw_payload' })
  rawPayload!: Record<string, unknown>;

  /**
   * DERIVED FIELD: Error message from the exception handler.
   */
  @Column({ type: 'text', name: 'error_message' })
  errorMessage!: string;

  /**
   * DERIVED FIELD: Failure category — used to decide retryability and escalation.
   */
  @Column({ type: 'varchar', length: 32, name: 'reason', default: DlqReason.HANDLER_ERROR })
  reason!: DlqReason;

  /**
   * DERIVED FIELD: Whether this entry is eligible for automatic replay.
   * Can be manually updated to prevent retries.
   */
  @Column({ type: 'boolean', name: 'retryable', default: true })
  retryable!: boolean;

  /**
   * DERIVED FIELD: Number of times this entry has been retried.
   * Incremented by replay handler on each attempt.
   */
  @Column({ type: 'integer', name: 'retry_count', default: 0 })
  retryCount!: number;

  /**
   * IDEMPOTENCY GUARD: Timestamp set when this entry was successfully replayed.
   * A non-null value acts as an idempotency guard — the entry will not be
   * replayed again unless `forceReplay` is explicitly passed.
   */
  @Column({ type: 'timestamptz', name: 'replayed_at', nullable: true })
  replayedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'last_attempt_at' })
  lastAttemptAt!: Date;
}
