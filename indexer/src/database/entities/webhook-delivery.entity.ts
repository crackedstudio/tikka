import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from "typeorm";

/** Audit log of outbound webhook delivery attempts. */
@Entity("webhook_deliveries")
export class WebhookDeliveryEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  webhookUrl!: string;

  @Column()
  eventType!: string;

  @Column("jsonb")
  payload!: Record<string, any>;

  @Column()
  status!: "success" | "failed";

  @Column("int")
  attempts!: number;

  @Column({ type: "text", nullable: true })
  errorResponse!: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
