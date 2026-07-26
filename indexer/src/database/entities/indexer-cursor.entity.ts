import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('indexer_cursor')
export class IndexerCursorEntity {
  @PrimaryColumn({ type: 'integer', name: 'id', default: 1 })
  id!: number;

  @Column({ type: 'integer', default: 0, name: 'last_ledger' })
  lastLedger!: number;

  @Column({ type: 'varchar', length: 255, default: '', name: 'last_paging_token' })
  lastPagingToken!: string;

  /**
   * DERIVED FIELD: Ring buffer of recent { ledger, hash } pairs for reorg detection.
   * Stored as JSONB array, capped at REORG_SAFETY_DEPTH * 2 entries.
   * Updated by CursorManagerService after each ledger.
   */
  @Column({ type: 'jsonb', default: '[]', name: 'ledger_hashes' })
  ledgerHashes!: Array<{ ledger: number; hash: string }>;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;

  // ── Checkpoint integrity fields (issue #560) ──────────────────────────────

  /** Cumulative count of events processed up to and including this ledger. */
  @Column({ type: 'bigint', default: 0, name: 'processed_event_count' })
  processedEventCount!: number;

  /** ISO-8601 timestamp of when this checkpoint was last written. */
  @Column({ type: 'timestamptz', default: () => 'NOW()', name: 'saved_at' })
  savedAt!: Date;

  /** Schema version for forward-compatible migration. */
  @Column({ type: 'integer', default: 1, name: 'checkpoint_version' })
  checkpointVersion!: number;
}
