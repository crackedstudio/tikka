import { Column, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";

/**
 * Singleton row tracking the last processed Stellar ledger.
 * Used by the cursor-manager to resume indexing after a restart without
 * re-processing already-ingested ledgers.
 *
 * There is always exactly ONE row with id=1.
 *
 * Columns map to the `indexer_cursor` table in ARCHITECTURE.md.
 */
@Entity("indexer_cursor")
export class IndexerCursorEntity {
  /**
   * Always 1.  Using a fixed PK for singleton semantics avoids
   * accidental multi-row inserts and keeps upserts simple.
   */
  @PrimaryColumn({ type: "integer", name: "id", default: 1 })
  id!: number;

  /** The last Stellar ledger sequence number fully processed. */
  @Column({ type: "integer", default: 0, name: "last_ledger" })
  lastLedger!: number;

  /**
   * The Horizon paging token for the last event consumed.
   * Used to resume SSE / polling from exactly the right position.
   */
  @Column({
    type: "varchar",
    length: 255,
    default: "",
    name: "last_paging_token",
  })
  lastPagingToken!: string;

  @UpdateDateColumn({ type: "timestamptz", name: "updated_at" })
  updatedAt!: Date;
}
