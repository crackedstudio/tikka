import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from "typeorm";

/**
 * Audit log of outbound webhook delivery attempts.
 * Matches `webhook_deliveries` created by migration 1760000000000.
 */
@Entity("webhook_deliveries")
export class WebhookDeliveryEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar" })
  webhookUrl!: string;

  @Column({ type: "varchar" })
  eventType!: string;

  @Column({ type: "jsonb" })
  payload!: Record<string, unknown>;

  @Column({ type: "varchar" })
  status!: string;

  @Column({ type: "integer" })
  attempts!: number;

  @Column({ type: "text", nullable: true })
  errorResponse!: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
