import { Column, Entity, PrimaryColumn } from "typeorm";

/**
 * Daily platform-wide aggregate statistics.
 * One row per calendar date (UTC), written by the stats.processor cron.
 *
 * Columns map to the `platform_stats` table in ARCHITECTURE.md.
 *
 * ## Field Ownership
 * - **Raw chain state**: None
 * - **Derived**: All fields (computed from raffles and tickets tables)
 *
 * ## Updater Handlers
 * - Stats cron job: Computes daily aggregates from raffles and tickets
 *
 * ## Recalculation Safety
 * - ✅ Safe: All fields can be recalculated from raffles and tickets tables
 * - This table is a MATERIALIZED VIEW for query performance
 *
 * ## Recalculation Queries
 * - totalRaffles: COUNT(raffles WHERE DATE(created_at) = X)
 * - totalTickets: COUNT(tickets WHERE DATE(indexed_at) = X)
 * - totalVolumeXlm: SUM(ticket_price * tickets_sold) for date
 * - uniqueParticipants: COUNT(DISTINCT owner FROM tickets WHERE DATE(indexed_at) = X)
 * - prizesDistributedXlm: SUM(prize_amount FROM raffles WHERE DATE(finalized_at) = X)
 *
 * See: `ENTITY_OWNERSHIP.md` for full documentation
 */
@Entity("platform_stats")
export class PlatformStatEntity {
  /** Calendar date in UTC — natural PK for daily roll-ups. */
  @PrimaryColumn({ type: "date", name: "date" })
  date!: string;

  /**
   * DERIVED FIELD: Total number of raffles created on this day.
   * Safe to recalculate: COUNT(raffles WHERE DATE(created_at) = X)
   */
  @Column({ type: "integer", default: 0, name: "total_raffles" })
  totalRaffles!: number;

  /**
   * DERIVED FIELD: Total number of tickets sold on this day.
   * Safe to recalculate: COUNT(tickets WHERE DATE(indexed_at) = X)
   */
  @Column({ type: "integer", default: 0, name: "total_tickets" })
  totalTickets!: number;

  /**
   * DERIVED FIELD: Total XLM volume (all ticket sales) on this day, in stroops.
   * Stored as string to avoid integer overflow.
   * Safe to recalculate: SUM(ticket_price * tickets_sold) for date
   */
  @Column({
    type: "varchar",
    length: 40,
    default: "0",
    name: "total_volume_xlm",
  })
  totalVolumeXlm!: string;

  /**
   * DERIVED FIELD: Number of unique participant addresses active on this day.
   * Safe to recalculate: COUNT(DISTINCT owner FROM tickets WHERE DATE(indexed_at) = X)
   */
  @Column({ type: "integer", default: 0, name: "unique_participants" })
  uniqueParticipants!: number;

  /**
   * DERIVED FIELD: Total prize XLM distributed to winners on this day, in stroops.
   * Stored as string.
   * Safe to recalculate: SUM(prize_amount FROM raffles WHERE DATE(finalized_at) = X)
   */
  @Column({
    type: "varchar",
    length: 40,
    default: "0",
    name: "prizes_distributed_xlm",
  })
  prizesDistributedXlm!: string;
}
