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

@Entity('dead_letter_events')
@Index('idx_dle_retry_count', ['retryCount'])
@Index('idx_dle_reason', ['reason'])
@Index('idx_dle_ledger', ['ledger'])
@Index('idx_dle_replayed_at', ['replayedAt'])
export class DeadLetterEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'integer' })
  ledger!: number;

  @Column({ type: 'varchar', length: 128, name: 'contract_id', nullable: true })
  contractId!: string | null;

  @Column({ type: 'varchar', length: 64, name: 'event_type' })
  eventType!: string;

  @Column({ type: 'jsonb', name: 'raw_payload' })
  rawPayload!: Record<string, unknown>;

  @Column({ type: 'text', name: 'error_message' })
  errorMessage!: string;

  /** Failure category — used to decide retryability and escalation. */
  @Column({ type: 'varchar', length: 32, name: 'reason', default: DlqReason.HANDLER_ERROR })
  reason!: DlqReason;

  /** Whether this entry is eligible for automatic replay. */
  @Column({ type: 'boolean', name: 'retryable', default: true })
  retryable!: boolean;

  @Column({ type: 'integer', name: 'retry_count', default: 0 })
  retryCount!: number;

  /**
   * Timestamp set when this entry was successfully replayed.
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
