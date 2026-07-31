import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

export enum WebhookDlqReason {
  HTTP_ERROR = "HTTP_ERROR",
  NETWORK_ERROR = "NETWORK_ERROR",
  TIMEOUT = "TIMEOUT",
  UNREACHABLE = "UNREACHABLE",
}

@Entity("webhook_dead_letter_deliveries")
@Index("idx_whdl_status", ["status"])
@Index("idx_whdl_created_at", ["createdAt"])
export class WebhookDeadLetterEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  webhookUrl!: string;

  @Column()
  eventType!: string;

  @Column("jsonb")
  payload!: Record<string, any>;

  @Column({ type: "text", nullable: true })
  errorResponse?: string;

  @Column({
    type: "varchar",
    length: 32,
    default: WebhookDlqReason.HTTP_ERROR,
  })
  reason!: WebhookDlqReason;

  @Column({ default: 0 })
  retryCount!: number;

  @Column({ default: true })
  retryable!: boolean;

  @Column({ type: "timestamptz", nullable: true })
  replayedAt?: Date;

  @Column({ type: "varchar", length: 20, default: "pending" })
  status!: string;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
