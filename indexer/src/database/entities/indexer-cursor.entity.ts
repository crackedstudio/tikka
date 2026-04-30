import { Column, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";

@Entity("indexer_cursor")
export class IndexerCursorEntity {
  @PrimaryColumn({ type: "integer", name: "id", default: 1 })
  id!: number;

  @Column({ type: "integer", default: 0, name: "last_ledger" })
  lastLedger!: number;

  @Column({ type: "varchar", length: 255, default: "", name: "last_paging_token" })
  lastPagingToken!: string;

  /**
   * Ring buffer of recent { ledger, hash } pairs for reorg detection.
   * Stored as JSONB array, capped at REORG_SAFETY_DEPTH * 2 entries.
   */
  @Column({ type: "jsonb", default: "[]", name: "ledger_hashes" })
  ledgerHashes!: Array<{ ledger: number; hash: string }>;

  @UpdateDateColumn({ type: "timestamptz", name: "updated_at" })
  updatedAt!: Date;
}
