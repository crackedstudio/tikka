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
 */
@Entity("tickets")
@Index("idx_tickets_raffle_id", ["raffleId"])
@Index("idx_tickets_owner", ["owner"])
@Index("idx_tickets_purchase_tx_hash", ["purchaseTxHash"], { unique: true })
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
   * Transaction hash of the purchase — acts as idempotency key.
   * Unique constraint prevents double-indexing the same transaction.
   */
  @Column({
    type: "varchar",
    length: 64,
    unique: true,
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
