import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('dead_letter_events')
@Index('idx_dle_retry_count', ['retryCount'])
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

  @Column({ type: 'integer', name: 'retry_count', default: 0 })
  retryCount!: number;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'last_attempt_at' })
  lastAttemptAt!: Date;
}
