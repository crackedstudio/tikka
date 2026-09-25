import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";

/**
 * Registered webhook endpoints for real-time event notifications.
 * Services register their URL + desired events via admin API (TBD).
 */
@Entity("webhooks")
@Index("idx_webhooks_active_events", ["isActive", "supportedEvents"])
export class WebhookEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  /** Target webhook URL */
  @Column({ unique: true })
  url!: string;

  /** Filter events to dispatch (only these will receive payloads) */
  @Column({
    type: "text",
    array: true,
    name: "supported_events",
  })
  supportedEvents!: string[];

  /** Enabled/disabled */
  @Column({ default: true, name: "is_active" })
  isActive!: boolean;

  /** Number of consecutive failures (deactivate after 10?) */
  @Column({ default: 0, name: "failure_count" })
  failureCount!: number;

  /** Last failure timestamp */
  @Column({ type: "timestamptz", nullable: true, name: "last_failure_at" })
  lastFailureAt?: Date;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}

