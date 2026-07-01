import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

/**
 * Raw log of every Tikka contract event ingested from the Stellar ledger.
 * Acts as an audit trail and is the source of truth for processors.
 *
 * All writes are idempotent — `tx_hash` is unique so replaying an event
 * is a no-op.
 *
 * Columns map to the `raffle_events` table in ARCHITECTURE.md.
 *
 * ## Field Ownership
 * - **Raw chain state**: raffleId, eventType, schemaVersion, ledger, txHash, payloadJson, contractAddress
 * - **Derived**: id (UUID), indexedAt (indexer timestamp)
 *
 * ## Updater Handlers
 * - All processors insert events idempotently via orIgnore() on unique txHash constraint
 *
 * ## Recalculation Safety
 * - ❌ Unsafe: All fields are source-of-truth from chain events
 * - This table is APPEND-ONLY — no updates or deletes (except archiving)
 *
 * ## Archiving
 * - Old events can be safely archived after retention period (default: 30 days)
 * - See: `src/maintenance/ARCHIVE_RAFFLE_EVENTS_GUIDE.md`
 *
 * See: `ENTITY_OWNERSHIP.md` for full documentation
 */
@Entity("raffle_events")
@Index("idx_raffle_events_raffle_id", ["raffleId"])
@Index("idx_raffle_events_event_type", ["eventType"])
@Index("idx_raffle_events_tx_hash", ["txHash"], { unique: true })
@Index("idx_raffle_events_contract_address", ["contractAddress"])
@Index("idx_raffle_events_contract_ledger", ["contractAddress", "ledger"])
export class RaffleEventEntity {
  @PrimaryGeneratedColumn("uuid", { name: "id" })
  id!: string;

  /** Contract-assigned raffle ID this event belongs to. */
  @Column({ type: "integer", name: "raffle_id" })
  raffleId!: number;

  /**
   * One of: RaffleCreated, TicketPurchased, DrawTriggered,
   * RandomnessRequested, RandomnessReceived, RaffleFinalized,
   * RaffleCancelled, TicketRefunded.
   */
  @Column({ type: "varchar", length: 64, name: "event_type" })
  eventType!: string;

  /** The contract address emitting this event */
  @Column({ type: "varchar", length: 64, name: "contract_address", nullable: true })
  contractAddress!: string;

  /** Event schema version for forward-compatible parsing/routing. */
  @Column({ type: "integer", name: "schema_version", default: 1 })
  schemaVersion!: number;

  /** Ledger sequence in which the event was emitted. */
  @Column({ type: "integer", name: "ledger" })
  ledger!: number;

  /**
   * Transaction hash — used as idempotency key.
   * Unique constraint ensures the same tx is never indexed twice.
   */
  @Column({ type: "varchar", length: 64, unique: true, name: "tx_hash" })
  txHash!: string;

  /** Full decoded event payload stored as JSONB for flexible querying. */
  @Column({ type: "jsonb", name: "payload_json" })
  payloadJson!: Record<string, unknown>;

  @CreateDateColumn({ type: "timestamptz", name: "indexed_at" })
  indexedAt!: Date;
}
