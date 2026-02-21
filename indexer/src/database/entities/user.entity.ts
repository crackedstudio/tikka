import { Column, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";

/**
 * Aggregated per-user participation statistics.
 * Keyed by Stellar address (natural PK — no auto-increment needed).
 * Updated upsert-style whenever a TicketPurchased or RaffleFinalized event
 * is processed for this address.
 *
 * Columns map to the `users` table in ARCHITECTURE.md.
 */
@Entity("users")
export class UserEntity {
  /** Stellar account address — primary key. */
  @PrimaryColumn({ type: "varchar", length: 56, name: "address" })
  address!: string;

  @Column({ type: "integer", default: 0, name: "total_tickets_bought" })
  totalTicketsBought!: number;

  @Column({ type: "integer", default: 0, name: "total_raffles_entered" })
  totalRafflesEntered!: number;

  @Column({ type: "integer", default: 0, name: "total_raffles_won" })
  totalRafflesWon!: number;

  /**
   * Cumulative prize winnings in XLM stroops — stored as string
   * to avoid JS integer overflow on large totals.
   */
  @Column({
    type: "varchar",
    length: 40,
    default: "0",
    name: "total_prize_xlm",
  })
  totalPrizeXlm!: string;

  /** Ledger sequence in which this address first appeared on-chain. */
  @Column({ type: "integer", name: "first_seen_ledger" })
  firstSeenLedger!: number;

  @UpdateDateColumn({ type: "timestamptz", name: "updated_at" })
  updatedAt!: Date;
}
