import { Column, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";

/**
 * Singleton row tracking the last processed ledger and reorg detection state.
 *
 * ## Field Ownership
 * - **Raw chain state**: None
 * - **Derived**: All fields (ingestion progress tracking)
 *
 * ## Updater Handlers
 * - `CursorManagerService`: Updates after each ledger is processed
 *
 * ## Recalculation Safety
 * - ❌ Unsafe: Do NOT recalculate — tracks ingestion progress
 * - Resetting this will cause the indexer to reprocess ledgers from the beginning
 *
 * ## Reset for Reindexing
 * To reset the cursor for a full reindex:
 * ```sql
 * UPDATE indexer_cursor SET last_ledger = 0, last_paging_token = '', ledger_hashes = '[]' WHERE id = 1;
 * ```
 *
 * See: `ENTITY_OWNERSHIP.md` for full documentation
 */
@Entity("indexer_cursor")
export class IndexerCursorEntity {
  /** Singleton PK — always 1 */
  @PrimaryColumn({ type: "integer", name: "id", default: 1 })
  id!: number;

  /**
   * DERIVED FIELD: Last ledger sequence processed by the indexer.
   * Updated by CursorManagerService after each ledger.
   */
  @Column({ type: "integer", default: 0, name: "last_ledger" })
  lastLedger!: number;

  /**
   * DERIVED FIELD: Last paging token from Horizon API.
   * Updated by CursorManagerService after each ledger.
   */
  @Column({ type: "varchar", length: 255, default: "", name: "last_paging_token" })
  lastPagingToken!: string;

  /**
   * DERIVED FIELD: Ring buffer of recent { ledger, hash } pairs for reorg detection.
   * Stored as JSONB array, capped at REORG_SAFETY_DEPTH * 2 entries.
   * Updated by CursorManagerService after each ledger.
   */
  @Column({ type: "jsonb", default: "[]", name: "ledger_hashes" })
  ledgerHashes!: Array<{ ledger: number; hash: string }>;

  @UpdateDateColumn({ type: "timestamptz", name: "updated_at" })
  updatedAt!: Date;
}
