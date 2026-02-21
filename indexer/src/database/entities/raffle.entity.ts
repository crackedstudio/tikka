import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryColumn,
} from "typeorm";
import { TicketEntity } from "./ticket.entity";
import { RaffleEventEntity } from "./raffle-event.entity";

export enum RaffleStatus {
  OPEN = "open",
  DRAWING = "drawing",
  FINALIZED = "finalized",
  CANCELLED = "cancelled",
}

/**
 * Represents a single raffle as tracked by the indexer.
 * Columns map 1-to-1 with the `raffles` table in ARCHITECTURE.md.
 */
@Entity("raffles")
@Index("idx_raffles_status", ["status"])
@Index("idx_raffles_creator", ["creator"])
@Index("idx_raffles_created_at", ["createdAt"])
export class RaffleEntity {
  /** Contract-assigned raffle ID — used as natural PK. */
  @PrimaryColumn({ type: "integer", name: "id" })
  id!: number;

  /** Stellar account address of the raffle creator. */
  @Column({ type: "varchar", length: 56, name: "creator" })
  creator!: string;

  /** Current state of the raffle state machine. */
  @Column({
    type: "enum",
    enum: RaffleStatus,
    default: RaffleStatus.OPEN,
    name: "status",
  })
  status!: RaffleStatus;

  /**
   * Ticket price as a string to preserve bigint precision.
   * Represents stroops (XLM) or the token's base unit.
   */
  @Column({ type: "varchar", length: 40, name: "ticket_price" })
  ticketPrice!: string;

  /** 'XLM' or a SEP-41 token contract address. */
  @Column({ type: "varchar", length: 56, name: "asset" })
  asset!: string;

  @Column({ type: "integer", name: "max_tickets" })
  maxTickets!: number;

  @Column({ type: "integer", default: 0, name: "tickets_sold" })
  ticketsSold!: number;

  /**
   * Unix timestamp (seconds) at which the raffle closes for new purchases.
   * Stored as bigint string to avoid JS integer overflow.
   */
  @Column({ type: "bigint", name: "end_time" })
  endTime!: string;

  /** Winning Stellar address — null until raffle is FINALIZED. */
  @Column({ type: "varchar", length: 56, nullable: true, name: "winner" })
  winner!: string | null;

  /** Prize amount as a string — null until finalized. */
  @Column({
    type: "varchar",
    length: 40,
    nullable: true,
    name: "prize_amount",
  })
  prizeAmount!: string | null;

  /** Ledger sequence in which the raffle was created. */
  @Column({ type: "integer", name: "created_ledger" })
  createdLedger!: number;

  /** Ledger sequence in which the raffle was finalized or cancelled. */
  @Column({ type: "integer", nullable: true, name: "finalized_ledger" })
  finalizedLedger!: number | null;

  /** IPFS CID linking to off-chain raffle metadata (title, image, etc.). */
  @Column({
    type: "varchar",
    length: 255,
    nullable: true,
    name: "metadata_cid",
  })
  metadataCid!: string | null;

  @CreateDateColumn({ type: "timestamptz", name: "created_at" })
  createdAt!: Date;

  @OneToMany(() => TicketEntity, (ticket) => ticket.raffle)
  tickets!: TicketEntity[];

  @OneToMany(() => RaffleEventEntity, (event) => event.raffleId)
  events!: RaffleEventEntity[];
}
