import { Column, Entity, PrimaryColumn } from "typeorm";

/**
 * Daily platform-wide aggregate statistics.
 * One row per calendar date (UTC), written by the stats.processor cron.
 *
 * Columns map to the `platform_stats` table in ARCHITECTURE.md.
 */
@Entity("platform_stats")
export class PlatformStatEntity {
  /** Calendar date in UTC — natural PK for daily roll-ups. */
  @PrimaryColumn({ type: "date", name: "date" })
  date!: string;

  /** Total number of raffles created on this day. */
  @Column({ type: "integer", default: 0, name: "total_raffles" })
  totalRaffles!: number;

  /** Total number of tickets sold on this day. */
  @Column({ type: "integer", default: 0, name: "total_tickets" })
  totalTickets!: number;

  /**
   * Total XLM volume (all ticket sales) on this day, in stroops.
   * Stored as string to avoid integer overflow.
   */
  @Column({
    type: "varchar",
    length: 40,
    default: "0",
    name: "total_volume_xlm",
  })
  totalVolumeXlm!: string;

  /** Number of unique participant addresses active on this day. */
  @Column({ type: "integer", default: 0, name: "unique_participants" })
  uniqueParticipants!: number;

  /**
   * Total prize XLM distributed to winners on this day, in stroops.
   * Stored as string.
   */
  @Column({
    type: "varchar",
    length: 40,
    default: "0",
    name: "prizes_distributed_xlm",
  })
  prizesDistributedXlm!: string;
}
