import {
  Column,
  Entity,
  Index,
  ManyToOne,
  PrimaryColumn,
  JoinColumn,
} from "typeorm";
import { RaffleEntity } from "./raffle.entity";

/**
 * Represents a single raffle ticket purchased by a user.
 * Columns map to the `tickets` table in ARCHITECTURE.md.
 *
 * ## Field Ownership
 * - **Raw chain state**: All fields (id, raffleId, owner, purchasedAtLedger,
 *   purchaseTxHash, refunded, refundTxHash)
 * - **Derived**: None
 *
 * ## Updater Handlers
 * - `TicketProcessor.handleTicketPurchased()`: Inserts ticket rows idempotently
 * - `TicketProcessor.handleTicketRefunded()`: Updates refunded flag and refundTxHash
 *
 * ## Recalculation Safety
 * - ❌ Unsafe: All fields are source-of-truth from chain events
 *
 * ## Idempotency
 * - Event-level: TicketProcessor skips when any row already exists for
 *   `purchaseTxHash` (shared across all ticket_ids in one purchase)
 * - Row-level: inserts use orIgnore() on the ticket `id` primary key
 *
 * See: `ENTITY_OWNERSHIP.md` for full documentation
 */
@Entity("tickets")
@Index("idx_tickets_raffle_id", ["raffleId"])
@Index("idx_tickets_owner", ["owner"])
@Index("idx_tickets_purchase_tx_hash", ["purchaseTxHash"])
export class TicketEntity {
  /** Contract-assigned ticket ID — used as natural PK. */
  @PrimaryColumn({ type: "integer", name: "id" })
  id!: number;

  /** FK to the parent raffle. */
  @Column({ type: "integer", name: "raffle_id" })
  raffleId!: number;

  /** Stellar account address of the ticket owner. */
  @Column({ type: "varchar", length: 56, name: "owner" })
  owner!: string;

  /** Ledger sequence in which the ticket was purchased. */
  @Column({ type: "integer", name: "purchased_at_ledger" })
  purchasedAtLedger!: number;

  /**
   * Transaction hash of the purchase — shared by all tickets in that tx.
   * Used as the event-level idempotency key in TicketProcessor (not UNIQUE,
   * because one purchase can mint many ticket rows).
   */
  @Column({
    type: "varchar",
    length: 64,
    name: "purchase_tx_hash",
  })
  purchaseTxHash!: string;

  /** Whether this ticket has been refunded (raffle was cancelled). */
  @Column({ type: "boolean", default: false, name: "refunded" })
  refunded!: boolean;

  /** Transaction hash of the refund — null until refunded. */
  @Column({
    type: "varchar",
    length: 64,
    nullable: true,
    name: "refund_tx_hash",
  })
  refundTxHash!: string | null;

  @ManyToOne(() => RaffleEntity, (raffle) => raffle.tickets, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "raffle_id" })
  raffle!: RaffleEntity;
}
