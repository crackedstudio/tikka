import { Column, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";

/**
 * Aggregated per-user participation statistics.
 * Keyed by Stellar address (natural PK — no auto-increment needed).
 * Updated upsert-style whenever a TicketPurchased or RaffleFinalized event
 * is processed for this address.
 *
 * Columns map to the `users` table in ARCHITECTURE.md.
 *
 * ## Field Ownership
 * - **Raw chain state**: address, firstSeenLedger
 * - **Derived**: totalTicketsBought, totalRafflesEntered, totalRafflesWon,
 *   totalPrizeXlm, lastTxHash (idempotency key), updatedAt
 *
 * ## Updater Handlers
 * - `UserProcessor.handleTicketPurchased()`: Increments totalTicketsBought and
 *   totalRafflesEntered (if first ticket in raffle)
 * - `UserProcessor.handleRaffleFinalized()`: Increments totalRafflesWon and totalPrizeXlm
 * - `UserProcessor.handleRaffleCreated()`: Ensures creator has user row
 *
 * ## Recalculation Safety
 * - ✅ Safe: totalTicketsBought = COUNT(tickets WHERE owner = X)
 * - ✅ Safe: totalRafflesEntered = COUNT(DISTINCT raffle_id FROM tickets WHERE owner = X)
 * - ✅ Safe: totalRafflesWon = COUNT(raffles WHERE winner = X)
 * - ✅ Safe: totalPrizeXlm = SUM(prize_amount FROM raffles WHERE winner = X)
 * - ⚠️ Caution: Recalculation resets lastTxHash, breaking idempotency
 *
 * ## Idempotency
 * - `lastTxHash` acts as idempotency key — processors skip if it matches incoming txHash
 *
 * See: `ENTITY_OWNERSHIP.md` for full documentation
 */
@Entity("users")
export class UserEntity {
  /** Stellar account address — primary key. */
  @PrimaryColumn({ type: "varchar", length: 56, name: "address" })
  address!: string;

  /**
   * DERIVED FIELD: Incremented by UserProcessor.handleTicketPurchased().
   * Safe to recalculate: COUNT(tickets WHERE owner = X)
   */
  @Column({ type: "integer", default: 0, name: "total_tickets_bought" })
  totalTicketsBought!: number;

  /**
   * DERIVED FIELD: Incremented by UserProcessor.handleTicketPurchased()
   * when user buys first ticket in a raffle.
   * Safe to recalculate: COUNT(DISTINCT raffle_id FROM tickets WHERE owner = X)
   */
  @Column({ type: "integer", default: 0, name: "total_raffles_entered" })
  totalRafflesEntered!: number;

  /**
   * DERIVED FIELD: Incremented by UserProcessor.handleRaffleFinalized().
   * Safe to recalculate: COUNT(raffles WHERE winner = X)
   */
  @Column({ type: "integer", default: 0, name: "total_raffles_won" })
  totalRafflesWon!: number;

  /**
   * DERIVED FIELD: Incremented by UserProcessor.handleRaffleFinalized().
   * Cumulative prize winnings in XLM stroops — stored as string
   * to avoid JS integer overflow on large totals.
   * Safe to recalculate: SUM(prize_amount FROM raffles WHERE winner = X)
   */
  @Column({
    type: "varchar",
    length: 40,
    default: "0",
    name: "total_prize_xlm",
  })
  totalPrizeXlm!: string;

  /**
   * RAW CHAIN STATE: Ledger sequence in which this address first appeared on-chain.
   * Can be recalculated as MIN(ledger) from all events, but typically immutable.
   */
  @Column({ type: "integer", name: "first_seen_ledger" })
  firstSeenLedger!: number;

  /**
   * IDEMPOTENCY KEY: Transaction hash of the last event applied to this user row.
   * Acts as an idempotency key — processors skip re-applying an event
   * whose tx_hash matches this value.
   * ⚠️ Caution: Resetting this breaks replay protection.
   */
  @Column({ type: "varchar", length: 64, nullable: true, name: "last_tx_hash" })
  lastTxHash!: string | null;

  @UpdateDateColumn({ type: "timestamptz", name: "updated_at" })
  updatedAt!: Date;
}
