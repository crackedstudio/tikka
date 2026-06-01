import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { WebhookEntity } from "../database/entities/webhook.entity";

export enum DeliveryStatus {
  PENDING = "pending",
  SENDING = "sending",
  SUCCESS = "success",
  FAILED = "failed",
  PERMANENT_FAILURE = "permanent_failure",
}

/**
 * Tracks individual webhook delivery attempts with state machine.
 * Enables retry logic, duplicate suppression, and delivery audit trail.
 */
@Entity("webhook_deliveries")
@Index("idx_webhook_deliveries_status", ["status"])
@Index("idx_webhook_deliveries_event_id", ["eventId"])
@Index("idx_webhook_deliveries_webhook_created", ["webhook", "createdAt"])
export class WebhookDeliveryEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => WebhookEntity, { onDelete: "CASCADE" })
  webhook!: WebhookEntity;

  /** Unique event identifier for idempotency */
  @Column({ unique: true })
  eventId!: string;

  /** Event type being delivered */
  @Column()
  eventType!: string;

  /** JSON payload to deliver */
  @Column("jsonb")
  payload!: Record<string, any>;

  /** Current delivery state */
  @Column({
    type: "enum",
    enum: DeliveryStatus,
    default: DeliveryStatus.PENDING,
  })
  status!: DeliveryStatus;

  /** Number of delivery attempts */
  @Column({ default: 0 })
  attemptCount!: number;

  /** Maximum retry attempts before permanent failure */
  @Column({ default: 5 })
  maxAttempts!: number;

  /** Last HTTP status code received */
  @Column({ nullable: true })
  lastStatusCode?: number;

  /** Last error message */
  @Column({ type: "text", nullable: true })
  lastError?: string;

  /** Next scheduled retry time */
  @Column({ type: "timestamptz", nullable: true })
  nextRetryAt?: Date;

  /** Timestamp of last delivery attempt */
  @Column({ type: "timestamptz", nullable: true })
  lastAttemptAt?: Date;

  /** Timestamp of successful delivery */
  @Column({ type: "timestamptz", nullable: true })
  deliveredAt?: Date;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
