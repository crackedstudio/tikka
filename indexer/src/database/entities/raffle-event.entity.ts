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
 */
@Entity("raffle_events")
@Index("idx_raffle_events_raffle_id", ["raffleId"])
@Index("idx_raffle_events_event_type", ["eventType"])
@Index("idx_raffle_events_tx_hash", ["txHash"], { unique: true })
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
